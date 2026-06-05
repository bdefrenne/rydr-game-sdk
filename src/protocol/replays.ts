/**
 * Replay/ghost types — the frame contract, the decoded body, the derived display meta, and the
 * `session.getReplays(boardId)` result shape.
 *
 * A replay is an array of {@link ReplayFrame} the game saves with {@link PlatformSession.saveReplay}
 * keyed by the session's `runId`. The SDK encodes the frames into a compressed blob and derives a
 * {@link ReplayMeta} summary stored alongside it. Replays align to leaderboard standings through the
 * shared `runId`: the `boards` party stamps `runId` on each entry, so "the ghosts for the top-N" is
 * the leaderboard's top-N entries' replays. `getReplays` composes that — it reads the leaderboard
 * page, then fetches each ranked entry's blob + meta — returning one {@link ReplayRef} per ranked
 * entry; decode a specific one's frames with `getReplay`/`decodeReplay`.
 */

/**
 * One replay frame. A replay is an array of these — the time-series a game interpolates over to
 * render a ghost. `t` and `power` are MANDATORY and platform-readable (so the timeline + power of
 * any replay are legible without understanding the game); `customData` is the game's own opaque
 * per-frame payload. Frames need not be evenly spaced — timing lives entirely in `t`, so there is
 * no global sample rate / frame count to drift out of sync.
 */
export interface ReplayFrame {
  /** Elapsed time from replay start, in ms. */
  t: number;
  /** Instantaneous power, in watts. */
  power: number;
  /** Game-specific per-frame payload (position, lean, animation…). Opaque to the platform. */
  customData?: unknown;
}

/**
 * The decoded body of a replay blob: a versioned array of {@link ReplayFrame}. `version` lets a
 * game evolve its frame/`customData` shape and still recognise (or reject) older replays.
 * Produced/consumed by `encodeReplay`/`decodeReplay`.
 */
export interface ReplayBody {
  version: number;
  frames: ReplayFrame[];
}

/**
 * A small, platform-visible summary of a replay, DERIVED from its frames at save time. Lets a
 * ghost/replay list render (length + power) without fetching and decompressing every blob.
 *
 * Who/score/when are intentionally NOT here — they live on the leaderboard entry sharing the same
 * `runId` (`displayName`/`value`/`ts`). Meta only adds what the timeline itself knows.
 */
export interface ReplayMeta {
  /** Total replay length in ms (the last frame's `t`). */
  durationMs: number;
  /** Mean of every frame's `power`, in watts. */
  avgPower: number;
  /** Peak frame `power`, in watts. */
  maxPower: number;
}

/** One ranked leaderboard entry paired with its stored replay (if any). */
export interface ReplayRef {
  /** The run this replay/entry came from. */
  runId: string;
  /** 1-based rank on the board this came from. */
  rank: number;
  /** The entry's display name (for labelling the ghost). */
  displayName: string;
  /** The entry's board value (e.g. lap time in ms). */
  value: number;
  /** The opaque replay blob (base64), or `null` if no replay was stored for this run. */
  blob: string | null;
  /** Derived display summary of the replay, or `null` when no replay/meta was stored. */
  meta: ReplayMeta | null;
}
