/**
 * Client handle for a generic realtime {@link https://docs.partykit.io | PartyKit} `room`.
 *
 * Opens a **direct WebSocket** to the `rydr` backend (realtime can't sanely go through the
 * shell's postMessage relay). The server is dumb — presence + message relay + opaque shared
 * state — so the game defines what `send`/`state` mean. v1 uses a raw `WebSocket` (no
 * reconnection; that's a later nicety).
 *
 * Wire protocol (kept in sync with `party/room.ts`):
 * - client→server: `{t:"msg", data}` (relay to others), `{t:"state", patch}` (merge+broadcast)
 * - server→client: `{t:"hello", state, members}` (on join), `{t:"presence", members}`,
 *   `{t:"msg", from, data}`, `{t:"state", state}`
 */
export interface RoomMember {
  playerId: string;
  name?: string;
}

export interface RoomHandle {
  /** Relay an opaque message to the other members. */
  send(data: unknown): void;
  /** Merge a patch into the shared opaque state (last-write-wins) and broadcast it. */
  setState(patch: Record<string, unknown>): void;
  /** Current members (presence). */
  readonly members: readonly RoomMember[];
  /** Current shared opaque state. */
  readonly state: Record<string, unknown>;
  /** Subscribe to an event. Returns an unsubscribe fn.
   *  - `message`: `(data, from)` — a relayed peer message.
   *  - `presence`: `(members)` — membership changed.
   *  - `state`: `(state)` — shared state changed.
   *  - `open`/`close`: connection lifecycle. */
  on(event: "message", cb: (data: unknown, from: string) => void): () => void;
  on(event: "presence", cb: (members: readonly RoomMember[]) => void): () => void;
  on(event: "state", cb: (state: Record<string, unknown>) => void): () => void;
  on(event: "open" | "close", cb: () => void): () => void;
  /** Leave the room and close the socket. */
  leave(): void;
}

interface RoomOptions {
  host: string;
  gameId: string;
  roomId: string;
  playerId: string;
  name?: string;
}

function wsProtocol(host: string): "ws" | "wss" {
  return /^(localhost|127\.|0\.0\.0\.0|192\.168\.|10\.)/.test(host) ? "ws" : "wss";
}

/** Open a room WebSocket. Internal — games call `session.joinRoom()`. */
export function createRoom(opts: RoomOptions): RoomHandle {
  const room = `${opts.gameId}:${opts.roomId}`;
  const params = new URLSearchParams({ playerId: opts.playerId, name: opts.name ?? "" });
  const url = `${wsProtocol(opts.host)}://${opts.host}/parties/room/${encodeURIComponent(room)}?${params}`;
  const ws = new WebSocket(url);

  let members: RoomMember[] = [];
  let state: Record<string, unknown> = {};
  const listeners: Record<string, Set<(...args: unknown[]) => void>> = {
    message: new Set(), presence: new Set(), state: new Set(), open: new Set(), close: new Set(),
  };
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
    }
  });

  const sendRaw = (obj: unknown): void => {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
    else ws.addEventListener("open", () => ws.send(JSON.stringify(obj)), { once: true });
  };

  return {
    send: (data) => sendRaw({ t: "msg", data }),
    setState: (patch) => sendRaw({ t: "state", patch }),
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

/**
 * A backend-less loopback room for standalone dev (the dev-harness, or any session with no
 * `dataHost`): a single local member that echoes `send` back as a `message` and reflects
 * `setState`. Lets a game build its realtime UI with no shell/server.
 */
export function createLoopbackRoom(playerId: string, name?: string): RoomHandle {
  const self: RoomMember = { playerId, name };
  let state: Record<string, unknown> = {};
  const listeners: Record<string, Set<(...args: unknown[]) => void>> = {
    message: new Set(), presence: new Set(), state: new Set(), open: new Set(), close: new Set(),
  };
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
