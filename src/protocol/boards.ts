/**
 * Leaderboard board definitions + value formatting — shared by the game manifest,
 * a game's in-game results screen, and the platform's leaderboard hub.
 *
 * A board is declared ONCE (in the game's manifest, admin-managed) so every entry
 * is comparable: `sort` answers "is more better?", `valueType` drives display
 * formatting, `aggregate` collapses repeated submits. `submitScore(boardId, value)`
 * sends a raw number in the board's unit; the platform ranks by `sort`, formats by
 * `valueType` via {@link formatBoardValue}, and tie-breaks by earliest timestamp.
 */

/** Display/format hint for a board's raw numeric value. */
export type BoardValueType =
  | "time"      // ms of elapsed time, precise → "1:23.45"
  | "score"     // points → "12,300"
  | "distance"  // meters → "12.3 km" / "850 m"
  | "speed"     // m/s → "32.4 km/h"
  | "percent"   // 0–100 → "85.3%"
  | "duration"  // ms of duration, coarse → "1:23:05"
  | "count";    // integer tally → "42"

/** Ranking direction. `asc` = lower wins (time); `desc` = higher wins (score). */
export type BoardSort = "asc" | "desc";

/** How repeated submits from the same player collapse. */
export type BoardAggregate = "best" | "last" | "sum";

/**
 * A declarative leaderboard definition. Lives on the {@link GameManifest} (so the
 * shell can render every game's boards with no game code) and is handed to the game
 * at handshake as `session.boards`.
 */
export interface BoardDefinition {
  /** Stable id; the `boardId` passed to `submitScore`/`getLeaderboard`. */
  id: string;
  /** Human label for the board (defaults to `id`). */
  label?: string;
  valueType: BoardValueType;
  sort: BoardSort;
  aggregate: BoardAggregate;
}

/** One ranked leaderboard row. */
export interface BoardEntry {
  /** 1-based rank within the board. */
  rank: number;
  playerId: string;
  displayName: string;
  /** Raw value in the board's unit (format with {@link formatBoardValue}). */
  value: number;
  /** The run this entry came from, if known (links to the FIT activity + run record). */
  runId?: string;
  /** ms timestamp the entry was recorded. */
  ts: number;
}

/** Result of a `submitScore` — drives a post-game "you placed #N (new PB!)" screen. */
export interface SubmitScoreResult {
  /** The submitter's 1-based rank after this submit. */
  rank: number;
  /** Whether this submit improved the player's standing on the board. */
  isPersonalBest: boolean;
  /** Total entrants on the board. */
  total: number;
}

/** A page of leaderboard rows, plus the requesting player's own row when off-page. */
export interface LeaderboardPage {
  entries: BoardEntry[];
  /** The requester's own ranked row (may be outside `entries`). */
  you?: BoardEntry;
}

/** Format a raw board value for display, per its {@link BoardValueType}. */
export function formatBoardValue(valueType: BoardValueType, value: number): string {
  switch (valueType) {
    case "time":
      return formatClock(value, true);
    case "duration":
      return formatClock(value, false);
    case "score":
    case "count":
      return Math.round(value).toLocaleString("en-US");
    case "distance":
      return value >= 1000
        ? `${(value / 1000).toFixed(1)} km`
        : `${Math.round(value)} m`;
    case "speed":
      return `${(value * 3.6).toFixed(1)} km/h`;
    case "percent":
      return `${value.toFixed(1)}%`;
  }
}

/**
 * Format milliseconds as a clock. `precise` (for `time` boards) appends hundredths
 * and drops the hour unless needed: 83210 → "1:23.21". Coarse (for `duration`)
 * rounds to whole seconds: 4985000 → "1:23:05".
 */
function formatClock(ms: number, precise: boolean): string {
  const totalMs = Math.max(0, ms);
  const totalSeconds = Math.floor(totalMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (precise) {
    const hundredths = Math.floor((totalMs % 1000) / 10);
    const secs = `${String(seconds).padStart(2, "0")}.${String(hundredths).padStart(2, "0")}`;
    return hours > 0
      ? `${hours}:${String(minutes).padStart(2, "0")}:${secs}`
      : `${minutes}:${secs}`;
  }

  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
    : `${minutes}:${String(seconds).padStart(2, "0")}`;
}
