/**
 * Generic game-data store types — the opaque document/KV primitive any game uses
 * to persist content/config/saves with no backend of its own. Mirrors the
 * `boards`/`runs` philosophy: gameId-namespaced, payload opaque to the platform.
 *
 * Three scopes by access pattern:
 * - `shared`  — dev-authored content (tracks, waves, songs). Admin-written, public-read.
 * - `player`  — per-player owned data (saves, progress). Owner-only read+write.
 * - `public`  — player-authored, world-readable (UGC). Owner-write, public-read.
 */
export type GameDataScope = "shared" | "player" | "public";

/** A stored document. `data` is opaque (the game owns its shape). */
export interface GameDoc {
  id: string;
  data: unknown;
  /** ms timestamp of the last write. */
  updatedAt: number;
  /** Owner playerId — present for `public` (UGC) docs. */
  ownerId?: string;
  /** `shared` drafts are admin-only until published. */
  draft?: boolean;
}
