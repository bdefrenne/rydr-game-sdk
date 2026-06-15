/**
 * Wire-protocol version of the platform↔game boundary.
 *
 * Bumped only for protocol-shape changes. The platform shell advertises a
 * supported range and up-converts older messages via an adapter, so a game
 * built against an older protocol keeps working. Evolve the protocol
 * ADDITIVELY — never change or remove an existing message shape.
 */
// Unchanged at 5: 1.12.0 only adds an optional `powerSmoothing` field to `welcome` (older
// shells omit it, the client falls back to its default) — a purely additive change.
export const RYDR_PROTOCOL_VERSION = 5 as const;

/** Semver of this SDK build. Sent in the handshake for telemetry/debugging. */
export const RYDR_SDK_VERSION = "1.12.0";
