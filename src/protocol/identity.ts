/**
 * The scoped identity a game receives — deliberately NOT the full player profile.
 *
 * The platform holds PII (real name, gender, year of birth, exact weight). A
 * game only ever receives this redacted view: a stable opaque id, a display
 * name, and the physics metrics it explicitly requested. This is the privacy
 * boundary that makes third-party games safe.
 */
export interface ScopedIdentity {
  /** Stable, opaque per-player id. Safe to use as a key; reveals no PII. */
  playerId: string;
  /** Display name chosen for public surfaces (leaderboards, lobbies). */
  displayName: string;
  /** Optional avatar URL. */
  avatarUrl?: string;
  /** Rider weight in kg — present only if `identity` capability granted with physics scope. */
  weightKg?: number;
  /** Functional threshold power in watts — present only if granted. */
  ftp?: number;
  /**
   * Whether this player is in the platform's admin mode (holds the admin secret). Lets a game
   * reveal an in-game editor entry point. This is a UI hint only — the shell relays the actual
   * authenticated writes (the secret never enters the game), and the backend enforces auth.
   */
  isAdmin?: boolean;
}
