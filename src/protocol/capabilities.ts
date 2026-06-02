/**
 * Capabilities a game may request from the platform.
 *
 * The game declares the minimum it needs in its handshake; the shell grants a
 * subset (least-privilege). The shell only streams data for granted
 * capabilities, so a game that never asked for `heartRate` never receives it.
 */
export type Capability =
  /** Trainer power in watts (`hw.power`). */
  | "power"
  /** Pedalling cadence in rpm (`hw.cadence`). */
  | "cadence"
  /** Heart rate in bpm from a paired HRM (`hw.heartRate`). */
  | "heartRate"
  /** Trainer-reported speed in m/s (`hw.speed`). */
  | "speed"
  /** Canonical controller buttons (`input.button`). */
  | "buttons"
  /** Scoped player identity (stable id, display name, physics metrics). */
  | "identity";

/** Every capability the protocol defines. Useful for dev harnesses. */
export const ALL_CAPABILITIES: readonly Capability[] = [
  "power",
  "cadence",
  "heartRate",
  "speed",
  "buttons",
  "identity",
];
