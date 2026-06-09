/**
 * Wire-protocol version of the platform↔game boundary.
 *
 * Bumped only for protocol-shape changes. The platform shell advertises a
 * supported range and up-converts older messages via an adapter, so a game
 * built against an older protocol keeps working. Evolve the protocol
 * ADDITIVELY — never change or remove an existing message shape.
 */
export const RYDR_PROTOCOL_VERSION = 3 as const;

/** Semver of this SDK build. Sent in the handshake for telemetry/debugging. */
export const RYDR_SDK_VERSION = "1.8.0";
