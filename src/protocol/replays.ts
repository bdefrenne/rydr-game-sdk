/**
 * Replay/ghost references — the result shape of `session.getReplays(boardId)`.
 *
 * A replay is an opaque blob the game saves with {@link PlatformSession.saveReplay} keyed by the
 * session's `runId`. Replays align to leaderboard standings through that shared `runId`: the
 * `boards` party stamps `runId` on each entry, so "the ghosts for the top-N" is the leaderboard's
 * top-N entries' replays. `getReplays` composes that — it reads the leaderboard page, then fetches
 * each ranked entry's blob — returning one {@link ReplayRef} per ranked entry that has a stored
 * replay.
 */

/** One ranked leaderboard entry paired with its stored replay blob (if any). */
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
}
