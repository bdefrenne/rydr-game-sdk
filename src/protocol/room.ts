/**
 * Realtime room types — the shell-vouched fields shared by every room, kept separate from the
 * opaque game payloads (mirrors how {@link ReplayMeta} sits beside the opaque replay blob).
 *
 * A room carries three kinds of traffic over one shell-owned connection:
 * - **presence** — who's here ({@link RoomMember}); shell-stamped identity.
 * - **telemetry** — each member's live, real hardware reading ({@link RoomTelemetry}); injected by
 *   the shell that owns the hardware, so it can't be forged by a game. The mandatory, typed part.
 * - **message / state** — the game's own opaque payloads (`send`/`setState`); the platform never
 *   parses them. The blob part.
 */

/** A player present in a room. Identity is shell-stamped; `name` is the public display name. */
export interface RoomMember {
  playerId: string;
  name?: string;
}

/**
 * A trusted, live hardware reading for one room member, broadcast by that member's shell. Raw
 * measured signals only — speed/position is a game-computed output and belongs in the opaque
 * `send`/`state` payloads, not here. Fields are optional because a given sample may carry only
 * some of them (e.g. an HRM update with no power).
 */
export interface RoomTelemetry {
  /** The member this reading belongs to (server-stamped — never self-reported). */
  playerId: string;
  /** Instantaneous power, in watts. */
  power?: number;
  /** Pedalling cadence, in rpm. */
  cadence?: number;
  /** Heart rate, in bpm. */
  heartRate?: number;
  /** ms timestamp from the originating shell's clock. */
  t: number;
}

/**
 * A server-stamped, genre-neutral orchestration event — the "referee whistle" / match clock. A
 * member schedules one (`room.scheduleEvent`); the server stamps it on a shared clock and broadcasts
 * it to everyone, so all clients act on the same wall-clock instant with no host head start.
 *
 * The room knows nothing about what `name` means — a game's host-run orchestrator gives it meaning
 * (a race uses `"start"`/`"grace"`/`"advance"`/`"finished"`; a match could use `"point"`/`"set"`).
 * Timing-sensitive events carry a future `at`; clients self-schedule against their skew-corrected
 * clock until then (the server runs no timers).
 */
export interface RoomEvent {
  /** Game-defined event name. Opaque to the platform. */
  name: string;
  /** Game-defined opaque payload. */
  payload: unknown;
  /** Server-stamped wall-clock time (ms) to act on. Immediate events: ≈ broadcast time. */
  at: number;
  /** playerId that scheduled it (server-stamped — never the message body). */
  from: string;
}
