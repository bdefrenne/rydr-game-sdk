/**
 * A stand-in platform for developing a game with no shell and no trainer.
 *
 * It implements the platform side of the wire protocol: answers the game's
 * `hello` with a `welcome` (fake identity + granted capabilities), streams
 * hardware from on-screen sliders, and forwards button presses. Drive it two
 * ways:
 *
 * - **in-process** (default): the game runs at the top level; `createDevHarness()`
 *   listens on the same window. Fast HMR; does not exercise the iframe boundary.
 * - **faithful**: host page iframes the game and passes the iframe's
 *   `contentWindow` as `target`; exercises the real cross-document handshake.
 *
 * The protocol guards keep game→platform and platform→game traffic from
 * crossing wires even when both share one window.
 */
import type { Capability } from "../protocol/capabilities";
import { ALL_CAPABILITIES } from "../protocol/capabilities";
import type { ScopedIdentity } from "../protocol/identity";
import type { ButtonName } from "../protocol/buttons";
import type { BoardDefinition, BoardEntry, LeaderboardPage, SubmitScoreResult } from "../protocol/boards";
import type { GameDoc } from "../protocol/gamedata";
import type { PlatformToGameMessage } from "../protocol/messages";
import { RYDR_PROTOCOL_VERSION } from "../protocol/version";
import { isGameToPlatformMessage } from "../protocol/guards";

export interface DevHarnessOptions {
  /** Window running the game. Defaults to `window` (in-process). Pass an iframe's `contentWindow` for faithful mode. */
  target?: Window;
  /** Origin to post to / accept from. Default `"*"`. */
  origin?: string;
  /** Fake identity to grant (merged over sensible defaults). */
  identity?: Partial<ScopedIdentity>;
  /** Capabilities to grant. Default: everything the game requests. */
  grant?: Capability[];
  /** Initial deep-link path to hand the game. */
  initialPath?: string;
  /** Render the on-screen control panel. Default `true`. */
  ui?: boolean;
  /** Hardware stream rate in Hz. Default 4. */
  streamHz?: number;
  /**
   * Leaderboard boards to expose (handed to the game in `welcome`). The harness
   * keeps an in-memory store seeded with a few fake entries, so `submitScore`/
   * `getLeaderboard` resolve plausibly while developing the results screen with
   * no shell + no backend.
   */
  boards?: BoardDefinition[];
}

export interface DevHarness {
  setPower(watts: number): void;
  setCadence(rpm: number): void;
  setHeartRate(bpm: number): void;
  setSpeed(mps: number): void;
  pressButton(name: ButtonName): void;
  dispose(): void;
}

const DEFAULT_IDENTITY: ScopedIdentity = {
  playerId: "dev-player",
  displayName: "Dev Rider",
  weightKg: 75,
  ftp: 250,
};

/** Spin up a mock platform that a game can connect to via `connectToPlatform()`. */
export function createDevHarness(options: DevHarnessOptions = {}): DevHarness {
  const {
    target = window,
    origin = "*",
    identity: identityOverride,
    grant,
    initialPath,
    ui = true,
    streamHz = 4,
  } = options;

  const identity: ScopedIdentity = { ...DEFAULT_IDENTITY, ...identityOverride };
  const state = { power: 0, cadence: 0, heartRate: 0, speed: 0 };
  const boards = options.boards ?? [];
  const runId = `dev-run-${Date.now()}`;
  let connected = false;

  // In-memory mock leaderboard store: boardKey → playerId → raw entry. Seeded
  // with fake rivals so the game's results screen has data to render in dev.
  type StoredEntry = { playerId: string; displayName: string; value: number; ts: number };
  const boardStore = new Map<string, Map<string, StoredEntry>>();
  // Mock gamedata store keyed by `{scope}:{collection}:{id}` (single game in dev).
  const gamedataStore = new Map<string, GameDoc>();
  const boardKey = (boardId: string, key?: string): string => (key ? `${boardId}:${key}` : boardId);

  const rankEntries = (boardId: string, raw: StoredEntry[]): BoardEntry[] => {
    const def = boards.find((b) => b.id === boardId);
    const sort = def?.sort ?? "desc";
    return [...raw]
      .sort((a, b) => (a.value === b.value ? a.ts - b.ts : sort === "asc" ? a.value - b.value : b.value - a.value))
      .map((e, i) => ({ rank: i + 1, playerId: e.playerId, displayName: e.displayName, value: e.value, ts: e.ts }));
  };

  const seedBoard = (boardId: string, key?: string): Map<string, StoredEntry> => {
    const k = boardKey(boardId, key);
    let store = boardStore.get(k);
    if (store) return store;
    store = new Map();
    const def = boards.find((b) => b.id === boardId);
    const asc = def?.sort === "asc";
    const names = ["Ada", "Ben", "Cy", "Dot", "Eve"];
    names.forEach((name, i) => {
      // asc (lower-wins, e.g. time): ascending seed values; desc: descending.
      const value = asc ? 60_000 + i * 7_500 : 50 - i * 7;
      store!.set(`seed-${i}`, { playerId: `seed-${i}`, displayName: name, value, ts: 1 + i });
    });
    boardStore.set(k, store);
    return store;
  };

  const post = (message: PlatformToGameMessage): void => {
    target.postMessage(message, origin);
  };

  const onMessage = (event: MessageEvent): void => {
    if (origin !== "*" && event.origin !== origin) return;
    const msg = event.data;
    if (!isGameToPlatformMessage(msg)) return;

    switch (msg.type) {
      case "rydr/hello": {
        const granted = grant ?? msg.capabilities ?? ALL_CAPABILITIES.slice();
        post({
          rydr: true,
          type: "rydr/welcome",
          protocolVersion: RYDR_PROTOCOL_VERSION,
          grantedCapabilities: granted as Capability[],
          identity,
          initialPath,
          boards,
          runId,
        });
        post({ rydr: true, type: "rydr/trainer.status", connected: true, ergSupported: true });
        connected = true;
        break;
      }
      case "rydr/leaderboard.submit": {
        const def = boards.find((b) => b.id === msg.boardId);
        const store = seedBoard(msg.boardId, msg.key);
        const prev = store.get(identity.playerId);
        const aggregate = def?.aggregate ?? "best";
        const sort = def?.sort ?? "desc";
        const better = (a: number, b: number): boolean => (sort === "asc" ? a < b : a > b);
        let value = msg.value;
        if (prev) {
          if (aggregate === "best") value = better(msg.value, prev.value) ? msg.value : prev.value;
          else if (aggregate === "sum") value = prev.value + msg.value;
        }
        const isPersonalBest = !prev || better(value, prev.value) || (aggregate === "sum");
        store.set(identity.playerId, { playerId: identity.playerId, displayName: identity.displayName, value, ts: Date.now() });
        const ranked = rankEntries(msg.boardId, [...store.values()]);
        const mine = ranked.find((e) => e.playerId === identity.playerId);
        const result: SubmitScoreResult = { rank: mine?.rank ?? 0, isPersonalBest, total: ranked.length };
        post({ rydr: true, type: "rydr/leaderboard.submitResult", nonce: msg.nonce, result });
        break;
      }
      case "rydr/leaderboard.query": {
        const store = seedBoard(msg.boardId, msg.key);
        const ranked = rankEntries(msg.boardId, [...store.values()]);
        const limit = msg.limit ?? 10;
        const page: LeaderboardPage = {
          entries: ranked.slice(0, limit),
          you: ranked.find((e) => e.playerId === identity.playerId),
        };
        post({ rydr: true, type: "rydr/leaderboard.queryResult", nonce: msg.nonce, entries: page.entries, you: page.you });
        break;
      }
      case "rydr/run.save":
        console.info("[dev-harness] run.save", msg.breakdown);
        break;
      case "rydr/gamedata.get": {
        const doc = gamedataStore.get(`${msg.scope}:${msg.collection}:${msg.id}`) ?? null;
        post({ rydr: true, type: "rydr/gamedata.result", nonce: msg.nonce, doc });
        break;
      }
      case "rydr/gamedata.list": {
        const prefix = `${msg.scope}:${msg.collection}:`;
        const docs = [...gamedataStore.entries()]
          .filter(([k]) => k.startsWith(prefix))
          .map(([, v]) => v);
        post({ rydr: true, type: "rydr/gamedata.result", nonce: msg.nonce, docs });
        break;
      }
      case "rydr/gamedata.save": {
        gamedataStore.set(`${msg.scope}:${msg.collection}:${msg.id}`, {
          id: msg.id,
          data: msg.data,
          updatedAt: Date.now(),
          ownerId: msg.scope === "shared" ? undefined : identity.playerId,
        });
        post({ rydr: true, type: "rydr/gamedata.result", nonce: msg.nonce, ok: true });
        break;
      }
      case "rydr/gamedata.delete": {
        gamedataStore.delete(`${msg.scope}:${msg.collection}:${msg.id}`);
        post({ rydr: true, type: "rydr/gamedata.result", nonce: msg.nonce, ok: true });
        break;
      }
      case "rydr/asset.uploadUrl":
        // No R2 in standalone dev — report unavailable so the editor can fall back.
        post({ rydr: true, type: "rydr/asset.uploadUrlResult", nonce: msg.nonce, error: "asset upload unavailable in dev-harness (needs the platform + R2)" });
        break;
      case "rydr/trainer.setSimulation":
        console.info("[dev-harness] trainer.setSimulation", msg.gradePercent, "%");
        break;
      case "rydr/trainer.setTargetPower":
        console.info("[dev-harness] trainer.setTargetPower", msg.watts, "W");
        break;
      case "rydr/trainer.setErgMode":
        console.info("[dev-harness] trainer.setErgMode", msg.enabled);
        break;
      case "rydr/exitRequest":
        console.info("[dev-harness] exitRequest (no launcher in dev)");
        break;
      case "rydr/error":
        console.error("[dev-harness] game error:", msg.message);
        break;
    }
  };

  window.addEventListener("message", onMessage);

  // Stream hardware on a fixed cadence once the game has connected.
  const streamTimer = window.setInterval(() => {
    if (!connected) return;
    const t = Date.now();
    post({ rydr: true, type: "rydr/hw.power", watts: state.power, t });
    post({ rydr: true, type: "rydr/hw.cadence", rpm: state.cadence, t });
    post({ rydr: true, type: "rydr/hw.heartRate", bpm: state.heartRate, t });
    post({ rydr: true, type: "rydr/hw.speed", mps: state.speed, t });
  }, Math.max(50, Math.round(1000 / streamHz)));

  const pressButton = (name: ButtonName): void => {
    post({ rydr: true, type: "rydr/input.button", name, edge: "down" });
    post({ rydr: true, type: "rydr/input.button", name, edge: "up" });
  };

  const panel = ui ? buildPanel(state, pressButton) : null;

  const onKey = (e: KeyboardEvent): void => {
    const map: Record<string, ButtonName> = {
      ArrowUp: "UP",
      ArrowDown: "DOWN",
      ArrowLeft: "LEFT",
      ArrowRight: "RIGHT",
      " ": "OK",
      Enter: "OK",
      Escape: "CANCEL",
      Backspace: "CANCEL",
    };
    const name = map[e.key];
    if (name) pressButton(name);
  };
  window.addEventListener("keydown", onKey);

  return {
    setPower: (w) => {
      state.power = w;
      panel?.sync();
    },
    setCadence: (rpm) => {
      state.cadence = rpm;
      panel?.sync();
    },
    setHeartRate: (bpm) => {
      state.heartRate = bpm;
      panel?.sync();
    },
    setSpeed: (mps) => {
      state.speed = mps;
    },
    pressButton,
    dispose: () => {
      window.clearInterval(streamTimer);
      window.removeEventListener("message", onMessage);
      window.removeEventListener("keydown", onKey);
      panel?.remove();
    },
  };
}

interface HwState {
  power: number;
  cadence: number;
  heartRate: number;
  speed: number;
}

/** Build the floating control panel. Vanilla DOM so the SDK stays framework-free. */
function buildPanel(
  state: HwState,
  pressButton: (name: ButtonName) => void,
): { sync: () => void; remove: () => void } {
  const root = document.createElement("div");
  root.style.cssText =
    "position:fixed;right:12px;bottom:12px;z-index:2147483647;background:#0b0f1a;color:#e8edf6;" +
    "font:12px/1.4 ui-monospace,monospace;padding:12px;border:1px solid #2a3550;border-radius:10px;" +
    "width:220px;box-shadow:0 8px 30px rgba(0,0,0,.5);opacity:.96";

  const title = document.createElement("div");
  title.textContent = "RYDR dev harness";
  title.style.cssText = "font-weight:600;margin-bottom:8px;letter-spacing:.04em";
  root.appendChild(title);

  const sliders: Array<{ key: keyof HwState; out: HTMLElement; input: HTMLInputElement }> = [];
  const makeSlider = (key: keyof HwState, label: string, max: number): void => {
    const wrap = document.createElement("label");
    wrap.style.cssText = "display:block;margin:6px 0";
    const out = document.createElement("span");
    out.style.cssText = "float:right;color:#7fd1ff";
    const text = document.createElement("span");
    text.textContent = label;
    const input = document.createElement("input");
    input.type = "range";
    input.min = "0";
    input.max = String(max);
    input.value = String(state[key]);
    input.style.cssText = "width:100%;margin-top:4px";
    input.addEventListener("input", () => {
      state[key] = Number(input.value);
      out.textContent = input.value;
    });
    out.textContent = String(state[key]);
    wrap.append(text, out, input);
    root.appendChild(wrap);
    sliders.push({ key, out, input });
  };
  makeSlider("power", "Power (W)", 600);
  makeSlider("cadence", "Cadence (rpm)", 130);
  makeSlider("heartRate", "Heart rate (bpm)", 200);

  const btnRow = document.createElement("div");
  btnRow.style.cssText = "display:flex;flex-wrap:wrap;gap:4px;margin-top:8px";
  (["OK", "UP", "DOWN", "LEFT", "RIGHT", "CANCEL"] as ButtonName[]).forEach((name) => {
    const b = document.createElement("button");
    b.textContent = name;
    b.style.cssText =
      "flex:1 0 30%;background:#16203a;color:#e8edf6;border:1px solid #2a3550;" +
      "border-radius:6px;padding:4px;cursor:pointer;font:11px ui-monospace,monospace";
    b.addEventListener("click", () => pressButton(name));
    btnRow.appendChild(b);
  });
  root.appendChild(btnRow);

  document.body.appendChild(root);

  return {
    sync: () => {
      for (const s of sliders) {
        s.input.value = String(state[s.key]);
        s.out.textContent = String(state[s.key]);
      }
    },
    remove: () => root.remove(),
  };
}
