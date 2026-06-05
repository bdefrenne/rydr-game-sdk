/**
 * @rydr/game-sdk — client SDK for building games on the RYDR indoor-cycling platform.
 *
 * - `protocol` — the versioned platform↔game wire contract (handshake, capabilities,
 *   scoped identity, hardware/lifecycle messages, type guards).
 * - `client` — `connectToPlatform()` → a `PlatformSession` (game side).
 * - `host` — `createPlatformHost()` to embed a game from the shell (platform side).
 */
export * from "./protocol/index";
export * from "./client/index";
export * from "./host/index";
