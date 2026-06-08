/**
 * The game-side entry point to the RYDR platform.
 *
 * `connectToPlatform()` performs the handshake with the embedding shell and
 * resolves to a {@link PlatformSession}: a reactive hardware store, the scoped
 * identity, and trainer-control commands. A game uses only this — it never
 * touches `postMessage`, BLE, or PII directly.
 */
import { RYDR_PROTOCOL_VERSION, RYDR_SDK_VERSION } from "../protocol/version";
import { ALL_CAPABILITIES, type Capability } from "../protocol/capabilities";
import type { ScopedIdentity } from "../protocol/identity";
import type { ButtonName, ButtonEdge } from "../protocol/buttons";
import type {
  BoardDefinition,
  LeaderboardPage,
  SubmitScoreResult,
} from "../protocol/boards";
import type { GameDoc, GameDataScope } from "../protocol/gamedata";
import type { ReplayBody, ReplayFrame, ReplayMeta, ReplayRef } from "../protocol/replays";
import { decodeReplay, encodeReplay } from "./replayCodec";
import type {
  GameToPlatformMessage,
  WelcomeMessage,
  GameDataResultMessage,
  AssetUploadUrlResultMessage,
  ReplayResultMessage,
  RunGetResultMessage,
} from "../protocol/messages";
import { isPlatformToGameMessage } from "../protocol/guards";
import { HardwareStore } from "./HardwareStore";
import { createRelayRoom, createLoopbackRoom, type RoomRelayEvent, type RoomHandle } from "./Room";

/** A canonical controller button event delivered to the game. */
export interface ButtonEvent {
  name: ButtonName;
  edge: ButtonEdge;
}

export interface ConnectOptions {
  /** Stable game id, matching the game's platform manifest. */
  gameId: string;
  /**
   * Capabilities to request. Optional — defaults to ALL. Games get full access; the
   * platform doesn't ask games to pick. (Field kept for forward-compat / tests.)
   */
  capabilities?: Capability[];
  /**
   * Origin the shell is served from. Messages from any other origin are ignored,
   * and outbound messages are posted only to this origin. Defaults to `"*"`
   * (acceptable for local dev only — always set it in production).
   */
  platformOrigin?: string;
  /** Window to talk to. Defaults to `window.parent` (the embedding shell). */
  target?: Window;
  /** How long to wait for the shell's `welcome` before rejecting. Default 15000ms. */
  handshakeTimeoutMs?: number;
}

/** The live connection a game holds to the platform. */
export interface PlatformSession {
  /** Scoped, PII-free identity granted by the shell. */
  readonly identity: ScopedIdentity;
  /** Capabilities the shell actually granted (subset of those requested). */
  readonly grantedCapabilities: readonly Capability[];
  /** Deep-link path the game should route to on start, if the shell supplied one. */
  readonly initialPath: string | undefined;
  /** Reactive bridged hardware state. */
  readonly hardware: HardwareStore;
  /** The game's declared leaderboard boards (catalog from the manifest). */
  readonly boards: readonly BoardDefinition[];
  /** The run this session is recorded under (links score/run to the FIT activity). */
  readonly runId: string;
  /** The `rydr` backend host — used to open realtime room WebSockets. */
  readonly dataHost: string;

  /** Tell the shell the game has loaded and is ready to be shown. */
  ready(): void;
  /** Report load progress (0–100) for the shell's loading affordance. */
  reportLoadProgress(progress: number): void;

  /** Request grade-based resistance on the trainer. */
  setSimulation(gradePercent: number): void;
  /** Request power-based (ERG) resistance on the trainer. */
  setTargetPower(watts: number): void;
  /** Toggle ERG mode. */
  setErgMode(enabled: boolean): void;

  // Note: there is NO activity/FIT API. The platform records every session
  // automatically from its own hardware stream — games do nothing.

  /**
   * Submit a score to a leaderboard `boardId` (must be one of {@link boards}).
   * The shell performs the authenticated write (stamping playerId + runId).
   * Resolves with the player's rank/PB after the submit, for a results screen.
   * `opts.key` selects a parameterized board family member (e.g. per-track).
   */
  submitScore(boardId: string, value: number, opts?: { key?: string }): Promise<SubmitScoreResult>;
  /** Read a leaderboard page (top-N + the requester's own row). */
  getLeaderboard(boardId: string, opts?: { key?: string; limit?: number }): Promise<LeaderboardPage>;
  /** Save an opaque, game-specific run breakdown against this session's runId. Fire-and-forget. */
  saveRun(breakdown: unknown): void;
  /** Read back an opaque run breakdown by `runId` (e.g. a leaderboard entry's `runId`). `null` if absent. */
  getRun(runId: string): Promise<unknown | null>;

  // ── Replays / ghosts (frame arrays keyed by runId; relayed through the shell) ──
  /**
   * Save a replay/ghost: an array of {@link ReplayFrame} (`{ t, power, customData }`) keyed by
   * `runId` (default the session's own {@link runId}). The SDK packs the frames into a versioned,
   * gzip+base64 blob and derives a {@link ReplayMeta} summary (duration + power) stored alongside it
   * for cheap ghost lists. A replay aligns to a leaderboard entry through the shared `runId`, so it
   * can be fetched back as the ghost for that standing.
   */
  saveReplay(runId: string, frames: ReplayFrame[], opts?: { version?: number }): Promise<void>;
  /**
   * Fetch the replays for a board's top entries (the "ghosts"). Reads the leaderboard page, then
   * fetches each ranked entry's stored blob + meta. `opts.key` selects a parameterized board member
   * (e.g. per-track); `opts.top` bounds how many entries (default 10). Entries without a stored
   * replay come back with `blob: null` and `meta: null`. This does NOT decode frames — use the
   * `meta` for display and {@link getReplay} (or `decodeReplay`) when you need the timeline.
   */
  getReplays(boardId: string, opts?: { key?: string; top?: number }): Promise<ReplayRef[]>;
  /**
   * Fetch and decode a single stored replay by `runId` (e.g. a leaderboard entry's `runId`, the
   * session's own {@link runId}, or a shared-link id). Returns the decoded {@link ReplayBody} plus
   * its {@link ReplayMeta}, or `null` if no replay was stored for that run.
   */
  getReplay(runId: string): Promise<{ body: ReplayBody; meta: ReplayMeta | null } | null>;

  // ── Generic game-data store (opaque docs; relayed through the shell) ──
  /** Read dev-authored shared content (public). */
  getContent(collection: string, id: string): Promise<GameDoc | null>;
  /** List dev-authored shared content (public). */
  listContent(collection: string): Promise<GameDoc[]>;
  /** Read an owned doc. `scope` defaults to `player` (private); use `public` for UGC. */
  getData(collection: string, id: string, opts?: { scope?: "player" | "public" }): Promise<GameDoc | null>;
  /** List owned docs (`player`) or world-readable UGC (`public`). */
  listData(collection: string, opts?: { scope?: "player" | "public" }): Promise<GameDoc[]>;
  /** Write an owned doc. `scope` defaults to `player` (private); `public` = world-readable UGC. */
  saveData(collection: string, id: string, value: unknown, opts?: { scope?: "player" | "public" }): Promise<void>;
  /** Delete an owned doc. */
  deleteData(collection: string, id: string, opts?: { scope?: "player" | "public" }): Promise<void>;
  /** Author `shared` (official) content — charts, songs, levels. Requires author rights on this
   *  game (the platform checks the per-game author allowlist by your playerId). Used by in-game
   *  editors. */
  saveContent(collection: string, id: string, value: unknown): Promise<void>;
  /** Delete `shared` content (author rights required). */
  deleteContent(collection: string, id: string): Promise<void>;
  /**
   * Get a presigned URL to upload a binary asset (e.g. an MP3) for `shared` content. Author
   * rights required. Returns `{ uploadUrl, url }`: PUT the file to `uploadUrl` directly, then
   * store the public `url` in a doc via {@link saveContent}.
   */
  getUploadUrl(opts: { collection: string; filename: string; contentType?: string }): Promise<{ uploadUrl: string; url: string }>;

  /**
   * Join a realtime room (presence + relay + opaque shared state + trusted peer telemetry). The
   * shell owns the socket and relays for the game, so identity and telemetry can't be forged. With
   * no shell-backed rooms (standalone dev), this returns a local loopback room.
   */
  joinRoom(roomId: string): RoomHandle;

  /** Tell the shell the game's internal route changed (for URL projection). */
  setRoute(path: string): void;
  /** Ask the shell to show/hide its chrome (navbar). Default is visible. */
  setChrome(visible: boolean): void;
  /** Ask the shell to exit the game (back to the launcher). */
  requestExit(): void;
  /** Ask the shell to surface its hardware (reconnect) UI. */
  requestHardwareModal(): void;
  /** Report a fatal error to the shell. */
  reportError(message: string): void;

  /** Subscribe to controller buttons. Returns an unsubscribe fn. */
  onButton(cb: (e: ButtonEvent) => void): () => void;
  /** Subscribe to shell-driven pause. Returns an unsubscribe fn. */
  onPause(cb: () => void): () => void;
  /** Subscribe to shell-driven resume. Returns an unsubscribe fn. */
  onResume(cb: () => void): () => void;
  /** Subscribe to scoped-identity changes. Returns an unsubscribe fn. */
  onIdentityChange(cb: (identity: ScopedIdentity) => void): () => void;

  /** Tear down listeners. */
  dispose(): void;
}

type Emitter<T> = Set<(value: T) => void>;

function emit<T>(set: Emitter<T>, value: T): void {
  for (const cb of set) cb(value);
}

/**
 * Connect to the embedding platform shell.
 *
 * Sends `hello` (retrying until the shell answers, to survive a not-yet-ready
 * parent) and resolves once `welcome` arrives, or rejects on `reject`/timeout.
 */
export function connectToPlatform(options: ConnectOptions): Promise<PlatformSession> {
  const {
    gameId,
    capabilities = [...ALL_CAPABILITIES],
    platformOrigin = "*",
    target = window.parent,
    handshakeTimeoutMs = 15_000,
  } = options;

  const hardware = new HardwareStore();
  const buttonListeners: Emitter<ButtonEvent> = new Set();
  const pauseListeners: Emitter<void> = new Set();
  const resumeListeners: Emitter<void> = new Set();
  const identityListeners: Emitter<ScopedIdentity> = new Set();

  // Generic request/response over postMessage: each request carries a `nonce`;
  // the shell replies with a `*Result` message carrying the same nonce, which
  // resolves the pending promise. Shared by submitScore + getLeaderboard.
  const pending = new Map<number, (value: unknown) => void>();
  // Active relayed rooms keyed by roomId; the shell forwards room events which we route to dispatch.
  const rooms = new Map<string, (event: RoomRelayEvent) => void>();
  let nextNonce = 1;
  const REQUEST_TIMEOUT_MS = 10_000;
  const request = <T>(send: (nonce: number) => void): Promise<T> => {
    const nonce = nextNonce++;
    return new Promise<T>((resolveReq, rejectReq) => {
      const timer = setTimeout(() => {
        pending.delete(nonce);
        rejectReq(new Error("Platform request timed out"));
      }, REQUEST_TIMEOUT_MS);
      pending.set(nonce, (value) => {
        clearTimeout(timer);
        pending.delete(nonce);
        resolveReq(value as T);
      });
      send(nonce);
    });
  };

  const post = (message: GameToPlatformMessage): void => {
    target.postMessage(message, platformOrigin);
  };

  // gamedata helpers (relayed req/res). The shell replies with one GameDataResultMessage;
  // get→doc, list→docs, save/delete→ok, and `error` rejects.
  const throwIfError = (r: GameDataResultMessage): GameDataResultMessage => {
    if (r.error) throw new Error(`[rydr-sdk] gamedata: ${r.error}`);
    return r;
  };
  const gamedataGet = (scope: GameDataScope, collection: string, id: string): Promise<GameDoc | null> =>
    request<GameDataResultMessage>((nonce) =>
      post({ rydr: true, type: "rydr/gamedata.get", nonce, scope, collection, id }),
    ).then(throwIfError).then((r) => r.doc ?? null);
  const gamedataList = (scope: GameDataScope, collection: string): Promise<GameDoc[]> =>
    request<GameDataResultMessage>((nonce) =>
      post({ rydr: true, type: "rydr/gamedata.list", nonce, scope, collection }),
    ).then(throwIfError).then((r) => r.docs ?? []);

  // replay helper (relayed req/res). save→ok, get→blob+meta; `error` rejects.
  const replayGet = (runId: string): Promise<{ blob: string; meta: ReplayMeta | null } | null> =>
    request<ReplayResultMessage>((nonce) =>
      post({ rydr: true, type: "rydr/replay.get", nonce, runId }),
    ).then((r) => {
      if (r.error) throw new Error(`[rydr-sdk] getReplay: ${r.error}`);
      return r.blob ? { blob: r.blob, meta: r.meta ?? null } : null;
    });

  return new Promise<PlatformSession>((resolve, reject) => {
    let settled = false;
    let identity: ScopedIdentity | null = null;
    let grantedCapabilities: readonly Capability[] = [];
    let initialPath: string | undefined;
    let boards: readonly BoardDefinition[] = [];
    let runId = "";
    let dataHost = "";

    const knownBoard = (boardId: string): boolean => {
      const ok = boards.some((b) => b.id === boardId);
      if (!ok) console.warn(`[rydr-sdk] unknown boardId "${boardId}" — not in the game's manifest boards`);
      return ok;
    };

    const onMessage = (event: MessageEvent): void => {
      if (platformOrigin !== "*" && event.origin !== platformOrigin) return;
      const msg = event.data;
      if (!isPlatformToGameMessage(msg)) return;

      switch (msg.type) {
        case "rydr/welcome": {
          if (settled) return;
          settled = true;
          clearInterval(helloTimer);
          clearTimeout(timeoutTimer);
          const welcome = msg as WelcomeMessage;
          identity = welcome.identity;
          grantedCapabilities = welcome.grantedCapabilities;
          initialPath = welcome.initialPath;
          boards = welcome.boards ?? [];
          runId = welcome.runId ?? "";
          dataHost = welcome.dataHost ?? "";
          resolve(session);
          break;
        }
        case "rydr/reject": {
          if (settled) return;
          settled = true;
          clearInterval(helloTimer);
          clearTimeout(timeoutTimer);
          window.removeEventListener("message", onMessage);
          reject(new Error(`Platform rejected handshake: ${msg.reason}`));
          break;
        }
        case "rydr/hw.power":
          hardware._patch({ power: msg.watts, updatedAt: msg.t });
          break;
        case "rydr/hw.cadence":
          hardware._patch({ cadence: msg.rpm, updatedAt: msg.t });
          break;
        case "rydr/hw.heartRate":
          hardware._patch({ heartRate: msg.bpm, updatedAt: msg.t });
          break;
        case "rydr/hw.speed":
          hardware._patch({ speed: msg.mps, updatedAt: msg.t });
          break;
        case "rydr/hw.powerBuffer": {
          const last = msg.samples[msg.samples.length - 1];
          if (last) hardware._patch({ power: last.watts, cadence: last.cadence ?? hardware.current.cadence, updatedAt: last.t });
          break;
        }
        case "rydr/input.button":
          emit(buttonListeners, { name: msg.name, edge: msg.edge });
          break;
        case "rydr/identity.update":
          identity = msg.identity;
          emit(identityListeners, msg.identity);
          break;
        case "rydr/trainer.status":
          hardware._patch({ trainerConnected: msg.connected, ergSupported: msg.ergSupported });
          break;
        case "rydr/lifecycle.pause":
          emit(pauseListeners, undefined);
          break;
        case "rydr/lifecycle.resume":
          emit(resumeListeners, undefined);
          break;
        case "rydr/ping":
          post({ rydr: true, type: "rydr/pong", nonce: msg.nonce });
          break;
        case "rydr/leaderboard.submitResult":
          pending.get(msg.nonce)?.(msg.result);
          break;
        case "rydr/leaderboard.queryResult":
          pending.get(msg.nonce)?.({ entries: msg.entries, you: msg.you } as LeaderboardPage);
          break;
        case "rydr/gamedata.result":
          pending.get(msg.nonce)?.(msg);
          break;
        case "rydr/asset.uploadUrlResult":
          pending.get(msg.nonce)?.(msg);
          break;
        case "rydr/replay.result":
          pending.get(msg.nonce)?.(msg);
          break;
        case "rydr/run.result":
          pending.get(msg.nonce)?.(msg);
          break;
        case "rydr/room.opened":
          rooms.get(msg.roomId)?.({ type: "rydr/room.opened" });
          break;
        case "rydr/room.closed":
          rooms.get(msg.roomId)?.({ type: "rydr/room.closed" });
          rooms.delete(msg.roomId);
          break;
        case "rydr/room.presence":
          rooms.get(msg.roomId)?.({ type: "rydr/room.presence", members: msg.members });
          break;
        case "rydr/room.state":
          rooms.get(msg.roomId)?.({ type: "rydr/room.state", state: msg.state });
          break;
        case "rydr/room.message":
          rooms.get(msg.roomId)?.({ type: "rydr/room.message", from: msg.from, data: msg.data });
          break;
        case "rydr/room.telemetry":
          rooms.get(msg.roomId)?.({
            type: "rydr/room.telemetry",
            from: msg.from,
            power: msg.power,
            cadence: msg.cadence,
            heartRate: msg.heartRate,
            t: msg.t,
          });
          break;
        case "rydr/room.event":
          rooms.get(msg.roomId)?.({
            type: "rydr/room.event",
            name: msg.name,
            payload: msg.payload,
            at: msg.at,
            from: msg.from,
          });
          break;
      }
    };

    window.addEventListener("message", onMessage);

    const sendHello = (): void => {
      post({
        rydr: true,
        type: "rydr/hello",
        gameId,
        sdkVersion: RYDR_SDK_VERSION,
        protocolVersion: RYDR_PROTOCOL_VERSION,
        capabilities,
      });
    };

    // Retry hello until the shell answers (it may not be listening on the first tick).
    sendHello();
    const helloTimer = setInterval(sendHello, 250);
    const timeoutTimer = setTimeout(() => {
      if (settled) return;
      settled = true;
      clearInterval(helloTimer);
      window.removeEventListener("message", onMessage);
      reject(new Error("Platform handshake timed out"));
    }, handshakeTimeoutMs);

    const session: PlatformSession = {
      get identity(): ScopedIdentity {
        if (!identity) throw new Error("Session not established");
        return identity;
      },
      get grantedCapabilities(): readonly Capability[] {
        return grantedCapabilities;
      },
      get initialPath(): string | undefined {
        return initialPath;
      },
      get boards(): readonly BoardDefinition[] {
        return boards;
      },
      get runId(): string {
        return runId;
      },
      get dataHost(): string {
        return dataHost;
      },
      hardware,
      ready: () => post({ rydr: true, type: "rydr/ready" }),
      reportLoadProgress: (progress) => post({ rydr: true, type: "rydr/loadProgress", progress }),
      setSimulation: (gradePercent) => post({ rydr: true, type: "rydr/trainer.setSimulation", gradePercent }),
      setTargetPower: (watts) => post({ rydr: true, type: "rydr/trainer.setTargetPower", watts }),
      setErgMode: (enabled) => post({ rydr: true, type: "rydr/trainer.setErgMode", enabled }),
      submitScore: (boardId, value, opts) => {
        knownBoard(boardId);
        return request<SubmitScoreResult>((nonce) =>
          post({ rydr: true, type: "rydr/leaderboard.submit", nonce, boardId, value, key: opts?.key }),
        );
      },
      getLeaderboard: (boardId, opts) => {
        knownBoard(boardId);
        return request<LeaderboardPage>((nonce) =>
          post({ rydr: true, type: "rydr/leaderboard.query", nonce, boardId, key: opts?.key, limit: opts?.limit }),
        );
      },
      saveRun: (breakdown) => post({ rydr: true, type: "rydr/run.save", breakdown }),
      getRun: (runId) =>
        request<RunGetResultMessage>((nonce) =>
          post({ rydr: true, type: "rydr/run.get", nonce, runId }),
        ).then((r) => {
          if (r.error) throw new Error(`[rydr-sdk] getRun: ${r.error}`);
          return r.breakdown ?? null;
        }),
      saveReplay: async (runId, frames, opts) => {
        const { blob, meta } = await encodeReplay(frames, opts?.version ?? 1);
        const r = await request<ReplayResultMessage>((nonce) =>
          post({ rydr: true, type: "rydr/replay.save", nonce, runId, blob, meta }),
        );
        if (r.error) throw new Error(`[rydr-sdk] saveReplay: ${r.error}`);
      },
      getReplay: async (runId) => {
        const stored = await replayGet(runId);
        if (!stored) return null;
        const body = await decodeReplay(stored.blob);
        if (!body) return null;
        return { body, meta: stored.meta };
      },
      getReplays: async (boardId, opts) => {
        knownBoard(boardId);
        const page = await request<LeaderboardPage>((nonce) =>
          post({ rydr: true, type: "rydr/leaderboard.query", nonce, boardId, key: opts?.key, limit: opts?.top ?? 10 }),
        );
        // Each ranked entry that carries a runId maps to a (possibly absent) stored replay.
        const ranked = page.entries.filter((e): e is typeof e & { runId: string } => !!e.runId);
        return Promise.all(
          ranked.map(async (e): Promise<ReplayRef> => {
            const stored = await replayGet(e.runId);
            return {
              runId: e.runId,
              rank: e.rank,
              displayName: e.displayName,
              value: e.value,
              blob: stored?.blob ?? null,
              meta: stored?.meta ?? null,
            };
          }),
        );
      },
      getContent: (collection, id) => gamedataGet("shared", collection, id),
      listContent: (collection) => gamedataList("shared", collection),
      getData: (collection, id, opts) => gamedataGet(opts?.scope ?? "player", collection, id),
      listData: (collection, opts) => gamedataList(opts?.scope ?? "player", collection),
      saveData: (collection, id, value, opts) =>
        request<GameDataResultMessage>((nonce) =>
          post({ rydr: true, type: "rydr/gamedata.save", nonce, scope: opts?.scope ?? "player", collection, id, data: value }),
        ).then(throwIfError).then(() => undefined),
      deleteData: (collection, id, opts) =>
        request<GameDataResultMessage>((nonce) =>
          post({ rydr: true, type: "rydr/gamedata.delete", nonce, scope: opts?.scope ?? "player", collection, id }),
        ).then(throwIfError).then(() => undefined),
      saveContent: (collection, id, value) =>
        request<GameDataResultMessage>((nonce) =>
          post({ rydr: true, type: "rydr/gamedata.save", nonce, scope: "shared", collection, id, data: value }),
        ).then(throwIfError).then(() => undefined),
      deleteContent: (collection, id) =>
        request<GameDataResultMessage>((nonce) =>
          post({ rydr: true, type: "rydr/gamedata.delete", nonce, scope: "shared", collection, id }),
        ).then(throwIfError).then(() => undefined),
      getUploadUrl: (opts) =>
        request<AssetUploadUrlResultMessage>((nonce) =>
          post({ rydr: true, type: "rydr/asset.uploadUrl", nonce, collection: opts.collection, filename: opts.filename, contentType: opts.contentType }),
        ).then((r) => {
          if (r.error || !r.uploadUrl || !r.url) throw new Error(`[rydr-sdk] getUploadUrl: ${r.error ?? "no url"}`);
          return { uploadUrl: r.uploadUrl, url: r.url };
        }),
      joinRoom: (roomId) => {
        if (!identity) throw new Error("[rydr-sdk] joinRoom: session not established");
        // No shell-backed rooms (standalone dev / shell didn't advertise a backend) → loopback.
        if (!dataHost) return createLoopbackRoom(identity.playerId, identity.displayName);
        // Shell-relayed room: the shell owns the socket (trusted identity + telemetry).
        const existing = rooms.get(roomId);
        if (existing) console.warn(`[rydr-sdk] joinRoom("${roomId}") called twice — re-joining`);
        const { handle, dispatch } = createRelayRoom({
          roomId,
          post,
          onLeave: () => rooms.delete(roomId),
        });
        rooms.set(roomId, dispatch);
        return handle;
      },
      setRoute: (path) => post({ rydr: true, type: "rydr/route.changed", path }),
      setChrome: (visible) => post({ rydr: true, type: "rydr/ui.setChrome", visible }),
      requestExit: () => post({ rydr: true, type: "rydr/exitRequest" }),
      requestHardwareModal: () => post({ rydr: true, type: "rydr/ui.requestHardwareModal" }),
      reportError: (message) => post({ rydr: true, type: "rydr/error", message }),
      onButton: (cb) => {
        buttonListeners.add(cb);
        return () => buttonListeners.delete(cb);
      },
      onPause: (cb) => {
        pauseListeners.add(cb);
        return () => pauseListeners.delete(cb);
      },
      onResume: (cb) => {
        resumeListeners.add(cb);
        return () => resumeListeners.delete(cb);
      },
      onIdentityChange: (cb) => {
        identityListeners.add(cb);
        return () => identityListeners.delete(cb);
      },
      dispose: () => {
        clearInterval(helloTimer);
        clearTimeout(timeoutTimer);
        window.removeEventListener("message", onMessage);
        buttonListeners.clear();
        pauseListeners.clear();
        resumeListeners.clear();
        identityListeners.clear();
        pending.clear();
        rooms.clear();
      },
    };
  });
}
