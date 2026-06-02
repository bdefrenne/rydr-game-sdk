/**
 * Canonical, source-agnostic controller vocabulary.
 *
 * Every physical controller (phone, keyboard, Zwift Play) is normalised to
 * these names by the platform before it reaches a game. The game never learns
 * which device produced a press — only the canonical name and edge. This keeps
 * games decoupled from hardware specifics and is the same vocabulary the
 * platform's input layer already uses.
 */
export type ButtonName = "OK" | "UP" | "DOWN" | "LEFT" | "RIGHT" | "CANCEL" | "RETRY";

/** Press = "down", release = "up". A held button emits one of each. */
export type ButtonEdge = "down" | "up";
