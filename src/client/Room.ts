/**
 * Client handle for a generic realtime {@link https://docs.partykit.io | PartyKit} `room`.
 *
 * Three transports, one {@link RoomHandle} shape:
 * - **relay** ({@link createRelayRoom}) — the game side. The game iframe does NOT open a socket;
 *   it drives the room through the shell over `rydr/room.*` postMessage frames, and the shell
 *   (which owns the hardware + identity) is the sole socket writer. That's what makes presence and
 *   {@link RoomTelemetry} trustworthy — a game can't forge another player's identity or wattage.
 * - **direct WS** ({@link createRoom}) — the SHELL side. The shell opens the real socket to the
 *   `room` party, relays the game's `send`/`setState`, and injects trusted telemetry.
 * - **loopback** ({@link createLoopbackRoom}) — standalone dev with no shell/backend.
 *
 * Wire protocol (kept in sync with `party/room.ts`):
 * - client→server: `{t:"msg", data}`, `{t:"state", patch}`, `{t:"telemetry", power?, cadence?,
 *   heartRate?, ts?}` (shell only)
 * - server→client: `{t:"hello", state, members}`, `{t:"presence", members}`, `{t:"msg", from, data}`,
 *   `{t:"state", state}`, `{t:"telemetry", from, power?, cadence?, heartRate?, ts}`, `{t:"full", max}`
 */
import type { RoomMember, RoomTelemetry, RoomEvent } from "../protocol/room";
import type { GameToPlatformMessage } from "../protocol/messages";

export type { RoomMember, RoomTelemetry, RoomEvent };

export interface RoomHandle {
  /** Relay an opaque message to the other members. */
  send(data: unknown): void;
  /** Merge a patch into the shared opaque state (last-write-wins) and broadcast it. */
  setState(patch: Record<string, unknown>): void;
  /**
   * Schedule a server-stamped orchestration event ({@link RoomEvent}) — the genre-neutral "referee
   * whistle". Omit `at` for an immediate event, or pass a future server-clock instant for a fair,
   * head-start-free transition (a countdown, a round timer, a grace window). The server stamps
   * `from`/`at` and broadcasts to everyone, including the scheduler; clients self-schedule to `at`.
   */
  scheduleEvent(name: string, payload?: unknown, at?: number): void;
  /** Current members (presence). */
  readonly members: readonly RoomMember[];
  /** Current shared opaque state. */
  readonly state: Record<string, unknown>;
  /** Subscribe to an event. Returns an unsubscribe fn.
   *  - `message`: `(data, from)` — a relayed peer message.
   *  - `presence`: `(members)` — membership changed.
   *  - `state`: `(state)` — shared state changed.
   *  - `telemetry`: `(reading)` — a peer's trusted, shell-stamped hardware reading.
   *  - `event`: `(e)` — a server-stamped orchestration event (see {@link scheduleEvent}).
   *  - `open`/`close`: connection lifecycle. */
  on(event: "message", cb: (data: unknown, from: string) => void): () => void;
  on(event: "presence", cb: (members: readonly RoomMember[]) => void): () => void;
  on(event: "state", cb: (state: Record<string, unknown>) => void): () => void;
  on(event: "telemetry", cb: (reading: RoomTelemetry) => void): () => void;
  on(event: "event", cb: (e: RoomEvent) => void): () => void;
  on(event: "open" | "close", cb: () => void): () => void;
  /** Leave the room and close the socket. */
  leave(): void;
}

/** Shell-only extension: inject a trusted hardware reading into the room. Games never see this. */
export interface ShellRoomHandle extends RoomHandle {
  sendTelemetry(reading: { power?: number; cadence?: number; heartRate?: number; t?: number }): void;
}

type Listeners = Record<string, Set<(...args: unknown[]) => void>>;

function makeListeners(): Listeners {
  return {
    message: new Set(),
    presence: new Set(),
    state: new Set(),
    telemetry: new Set(),
    event: new Set(),
    open: new Set(),
    close: new Set(),
  };
}

interface RoomOptions {
  host: string;
  gameId: string;
  roomId: string;
  playerId: string;
  name?: string;
  /** Max distinct players the room admits (passed to the server). */
  max?: number;
}

function wsProtocol(host: string): "ws" | "wss" {
  return /^(localhost|127\.|0\.0\.0\.0|192\.168\.|10\.)/.test(host) ? "ws" : "wss";
}

/**
 * Open a room WebSocket directly — used by the SHELL (the trusted socket owner). Returns a
 * {@link ShellRoomHandle} so the shell can also inject telemetry. Games do NOT call this; they use
 * `session.joinRoom()`, which relays through the shell.
 */
export function createRoom(opts: RoomOptions): ShellRoomHandle {
  const room = `${opts.gameId}:${opts.roomId}`;
  const params = new URLSearchParams({ playerId: opts.playerId, name: opts.name ?? "" });
  if (opts.max && opts.max > 0) params.set("max", String(opts.max));
  const url = `${wsProtocol(opts.host)}://${opts.host}/parties/room/${encodeURIComponent(room)}?${params}`;
  const ws = new WebSocket(url);

  let members: RoomMember[] = [];
  let state: Record<string, unknown> = {};
  const listeners = makeListeners();
  const fire = (event: string, ...args: unknown[]): void => {
    for (const cb of listeners[event] ?? []) cb(...args);
  };

  ws.addEventListener("open", () => fire("open"));
  ws.addEventListener("close", () => fire("close"));
  ws.addEventListener("message", (e: MessageEvent) => {
    let msg: { t?: string; [k: string]: unknown };
    try {
      msg = JSON.parse(typeof e.data === "string" ? e.data : "");
    } catch {
      return;
    }
    switch (msg.t) {
      case "hello":
        state = (msg.state as Record<string, unknown>) ?? {};
        members = (msg.members as RoomMember[]) ?? [];
        fire("presence", members);
        fire("state", state);
        break;
      case "presence":
        members = (msg.members as RoomMember[]) ?? [];
        fire("presence", members);
        break;
      case "state":
        state = (msg.state as Record<string, unknown>) ?? {};
        fire("state", state);
        break;
      case "msg":
        fire("message", msg.data, msg.from as string);
        break;
      case "telemetry":
        fire("telemetry", {
          playerId: msg.from as string,
          power: msg.power as number | undefined,
          cadence: msg.cadence as number | undefined,
          heartRate: msg.heartRate as number | undefined,
          t: (msg.ts as number | undefined) ?? 0,
        } satisfies RoomTelemetry);
        break;
      case "event":
        fire("event", {
          name: msg.name as string,
          payload: msg.payload,
          at: (msg.at as number | undefined) ?? 0,
          from: msg.from as string,
        } satisfies RoomEvent);
        break;
      case "full":
        // Room at capacity — the server closes the socket; surface it as a close.
        fire("close");
        break;
    }
  });

  const sendRaw = (obj: unknown): void => {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
    else ws.addEventListener("open", () => ws.send(JSON.stringify(obj)), { once: true });
  };

  return {
    send: (data) => sendRaw({ t: "msg", data }),
    setState: (patch) => sendRaw({ t: "state", patch }),
    sendTelemetry: (reading) =>
      sendRaw({
        t: "telemetry",
        power: reading.power,
        cadence: reading.cadence,
        heartRate: reading.heartRate,
        ts: reading.t,
      }),
    scheduleEvent: (name, payload, at) => sendRaw({ t: "event", name, payload, at }),
    get members() {
      return members;
    },
    get state() {
      return state;
    },
    on: ((event: string, cb: (...args: unknown[]) => void) => {
      listeners[event]?.add(cb);
      return () => listeners[event]?.delete(cb);
    }) as RoomHandle["on"],
    leave: () => ws.close(),
  };
}

/** A platform→game room message, already narrowed to one room by the SDK before dispatch into a
 *  relay handle. (Distinct from {@link RoomEvent}, which is the game-facing orchestration event.) */
export type RoomRelayEvent =
  | { type: "rydr/room.opened" }
  | { type: "rydr/room.closed" }
  | { type: "rydr/room.presence"; members: RoomMember[] }
  | { type: "rydr/room.state"; state: Record<string, unknown> }
  | { type: "rydr/room.message"; from: string; data: unknown }
  | { type: "rydr/room.telemetry"; from: string; power?: number; cadence?: number; heartRate?: number; t: number }
  | { type: "rydr/room.event"; name: string; payload: unknown; at: number; from: string };

/**
 * Game-side room over the shell relay. The handle posts `rydr/room.*` frames to the shell; incoming
 * room events are fed in via the returned `dispatch` (the SDK routes them by `roomId`). This is what
 * `session.joinRoom()` returns when embedded.
 */
export function createRelayRoom(opts: {
  roomId: string;
  post: (msg: GameToPlatformMessage) => void;
  onLeave: () => void;
}): { handle: RoomHandle; dispatch: (event: RoomRelayEvent) => void } {
  let members: RoomMember[] = [];
  let state: Record<string, unknown> = {};
  const listeners = makeListeners();
  const fire = (event: string, ...args: unknown[]): void => {
    for (const cb of listeners[event] ?? []) cb(...args);
  };

  opts.post({ rydr: true, type: "rydr/room.join", roomId: opts.roomId });

  const dispatch = (event: RoomRelayEvent): void => {
    switch (event.type) {
      case "rydr/room.opened":
        fire("open");
        break;
      case "rydr/room.closed":
        fire("close");
        break;
      case "rydr/room.presence":
        members = event.members ?? [];
        fire("presence", members);
        break;
      case "rydr/room.state":
        state = event.state ?? {};
        fire("state", state);
        break;
      case "rydr/room.message":
        fire("message", event.data, event.from);
        break;
      case "rydr/room.telemetry":
        fire("telemetry", {
          playerId: event.from,
          power: event.power,
          cadence: event.cadence,
          heartRate: event.heartRate,
          t: event.t,
        } satisfies RoomTelemetry);
        break;
      case "rydr/room.event":
        fire("event", {
          name: event.name,
          payload: event.payload,
          at: event.at,
          from: event.from,
        } satisfies RoomEvent);
        break;
    }
  };

  const handle: RoomHandle = {
    send: (data) => opts.post({ rydr: true, type: "rydr/room.send", roomId: opts.roomId, data }),
    setState: (patch) => opts.post({ rydr: true, type: "rydr/room.setState", roomId: opts.roomId, patch }),
    scheduleEvent: (name, payload, at) =>
      opts.post({ rydr: true, type: "rydr/room.scheduleEvent", roomId: opts.roomId, name, payload, at }),
    get members() {
      return members;
    },
    get state() {
      return state;
    },
    on: ((event: string, cb: (...args: unknown[]) => void) => {
      listeners[event]?.add(cb);
      return () => listeners[event]?.delete(cb);
    }) as RoomHandle["on"],
    leave: () => {
      opts.post({ rydr: true, type: "rydr/room.leave", roomId: opts.roomId });
      opts.onLeave();
      fire("close");
    },
  };

  return { handle, dispatch };
}

/**
 * A backend-less loopback room for standalone dev (a session with no `dataHost`): a single local
 * member that echoes `send` back as a `message` and reflects `setState`. Lets a game build its
 * realtime UI with no shell/server. No telemetry is emitted (there are no peers).
 */
export function createLoopbackRoom(playerId: string, name?: string): RoomHandle {
  const self: RoomMember = { playerId, name };
  let state: Record<string, unknown> = {};
  const listeners = makeListeners();
  const fire = (event: string, ...args: unknown[]): void => {
    for (const cb of listeners[event] ?? []) cb(...args);
  };
  // Defer the initial events so the caller can attach `.on(...)` first.
  setTimeout(() => {
    fire("open");
    fire("presence", [self]);
    fire("state", state);
  }, 0);
  return {
    send: (data) => setTimeout(() => fire("message", data, playerId), 0),
    setState: (patch) => {
      state = { ...state, ...patch };
      fire("state", state);
    },
    scheduleEvent: (name, payload, at) => {
      // No server: stamp locally and echo back as an event — immediately, or via a real timer for
      // a future `at` — so a solo dev still drives countdowns/phases.
      const now = Date.now();
      const fireEvent = (): void =>
        fire("event", { name, payload, at: at ?? now, from: playerId } satisfies RoomEvent);
      const delay = at && at > now ? at - now : 0;
      setTimeout(fireEvent, delay);
    },
    get members() {
      return [self];
    },
    get state() {
      return state;
    },
    on: ((event: string, cb: (...args: unknown[]) => void) => {
      listeners[event]?.add(cb);
      return () => listeners[event]?.delete(cb);
    }) as RoomHandle["on"],
    leave: () => fire("close"),
  };
}
