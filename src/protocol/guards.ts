/**
 * Runtime type guards for the wire protocol.
 *
 * A game iframe and the platform shell both receive `postMessage` traffic from
 * many sources (devtools, analytics, frameworks). These guards filter to genuine
 * SDK messages and discriminate direction, so handlers never act on foreign frames.
 */
import type {
  RydrMessage,
  GameToPlatformMessage,
  PlatformToGameMessage,
} from "./messages.js";

/** Type strings the platform sends to the game. Kept in sync with {@link PlatformToGameMessage}. */
const PLATFORM_TO_GAME_TYPES: ReadonlySet<string> = new Set([
  "rydr/welcome",
  "rydr/reject",
  "rydr/hw.power",
  "rydr/hw.cadence",
  "rydr/hw.heartRate",
  "rydr/hw.speed",
  "rydr/hw.powerBuffer",
  "rydr/input.button",
  "rydr/identity.update",
  "rydr/trainer.status",
  "rydr/lifecycle.pause",
  "rydr/lifecycle.resume",
  "rydr/ping",
  "rydr/leaderboard.submitResult",
  "rydr/leaderboard.queryResult",
  "rydr/gamedata.result",
  "rydr/asset.uploadUrlResult",
  "rydr/replay.result",
  "rydr/run.result",
  "rydr/room.opened",
  "rydr/room.closed",
  "rydr/room.presence",
  "rydr/room.state",
  "rydr/room.message",
  "rydr/room.telemetry",
  "rydr/room.event",
]);

/** True if `x` is any SDK protocol message. */
export function isRydrMessage(x: unknown): x is RydrMessage {
  if (!x || typeof x !== "object") return false;
  const m = x as { rydr?: unknown; type?: unknown };
  return m.rydr === true && typeof m.type === "string" && m.type.startsWith("rydr/");
}

/** True if `x` is a message the platform sends to the game (consume on the game side). */
export function isPlatformToGameMessage(x: unknown): x is PlatformToGameMessage {
  return isRydrMessage(x) && PLATFORM_TO_GAME_TYPES.has(x.type);
}

/** True if `x` is a message the game sends to the platform (consume on the platform side). */
export function isGameToPlatformMessage(x: unknown): x is GameToPlatformMessage {
  return isRydrMessage(x) && !PLATFORM_TO_GAME_TYPES.has(x.type);
}
