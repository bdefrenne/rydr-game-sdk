/**
 * The platform↔game wire protocol — the public contract.
 *
 * Every message carries a `rydr: true` marker (so a frame can be told apart
 * from unrelated `postMessage` traffic) and a `type` namespaced under `rydr/`
 * (so it never collides with a game's private game↔engine protocol).
 *
 * This is ONLY the generic boundary: hardware data, scoped identity, lifecycle,
 * and trainer-control commands. Game-specific payloads (tracks, ghosts, race
 * state, workouts) are NOT here — they belong to a game's private inner
 * protocol. Evolve this file ADDITIVELY; never change an existing shape.
 */
import type { Capability } from "./capabilities";
import type { ScopedIdentity } from "./identity";
import type { ButtonName, ButtonEdge } from "./buttons";

/** Marker present on every SDK message. */
interface RydrTagged {
  readonly rydr: true;
}

/** A single buffered power sample, used to back-fill after the platform tab was backgrounded. */
export interface PowerSample {
  watts: number;
  cadence?: number;
  /** ms timestamp from the platform clock. */
  t: number;
}

/** Minimal activity summary a game may pass when finishing a recording. The platform owns FIT generation. */
export interface ActivitySummary {
  sport: string;
  durationMs: number;
  /** Optional game-supplied rollups; the platform does not depend on these. */
  [key: string]: unknown;
}

// ============================================================
// Game → Platform
// ============================================================

/** First message a game sends: declares who it is and what it needs. */
export interface HelloMessage extends RydrTagged {
  type: "rydr/hello";
  gameId: string;
  sdkVersion: string;
  protocolVersion: number;
  capabilities: Capability[];
}

/** Game has finished loading and is ready to be shown/played. */
export interface ReadyMessage extends RydrTagged {
  type: "rydr/ready";
}

/** Loading progress, 0–100, for the shell's loading affordance. */
export interface LoadProgressMessage extends RydrTagged {
  type: "rydr/loadProgress";
  progress: number;
}

/** Reply to a platform liveness `ping`. */
export interface PongMessage extends RydrTagged {
  type: "rydr/pong";
  nonce: number;
}

/** Request grade-based (simulation) resistance on the trainer. */
export interface TrainerSetSimulationMessage extends RydrTagged {
  type: "rydr/trainer.setSimulation";
  gradePercent: number;
}

/** Request power-based (ERG) resistance on the trainer. */
export interface TrainerSetTargetPowerMessage extends RydrTagged {
  type: "rydr/trainer.setTargetPower";
  watts: number;
}

/** Toggle ERG mode on/off. */
export interface TrainerSetErgModeMessage extends RydrTagged {
  type: "rydr/trainer.setErgMode";
  enabled: boolean;
}

/** Mark the start of a recorded activity (the platform records from its own hardware stream). */
export interface ActivityStartMessage extends RydrTagged {
  type: "rydr/activity.start";
  sport: string;
  name?: string;
}

/** Mark the end of a recorded activity. */
export interface ActivityFinishMessage extends RydrTagged {
  type: "rydr/activity.finish";
  summary?: ActivitySummary;
}

/** Game's internal route changed; the shell reflects it into the top-level URL. */
export interface RouteChangedMessage extends RydrTagged {
  type: "rydr/route.changed";
  path: string;
}

/** Game asks the shell to show/hide its chrome (e.g. hide the navbar during active play). */
export interface SetChromeMessage extends RydrTagged {
  type: "rydr/ui.setChrome";
  visible: boolean;
}

/** Game asks the shell to exit it (return to the launcher). */
export interface ExitRequestMessage extends RydrTagged {
  type: "rydr/exitRequest";
}

/** Game asks the shell to surface its hardware (reconnect) UI. */
export interface RequestHardwareModalMessage extends RydrTagged {
  type: "rydr/ui.requestHardwareModal";
}

/** Game reports a fatal error to the shell. */
export interface GameErrorMessage extends RydrTagged {
  type: "rydr/error";
  message: string;
}

export type GameToPlatformMessage =
  | HelloMessage
  | ReadyMessage
  | LoadProgressMessage
  | PongMessage
  | TrainerSetSimulationMessage
  | TrainerSetTargetPowerMessage
  | TrainerSetErgModeMessage
  | ActivityStartMessage
  | ActivityFinishMessage
  | RouteChangedMessage
  | SetChromeMessage
  | ExitRequestMessage
  | RequestHardwareModalMessage
  | GameErrorMessage;

// ============================================================
// Platform → Game
// ============================================================

/** Accepts the handshake: grants capabilities and hands over the scoped identity. */
export interface WelcomeMessage extends RydrTagged {
  type: "rydr/welcome";
  protocolVersion: number;
  grantedCapabilities: Capability[];
  identity: ScopedIdentity;
  /** Initial deep-link path the game should route to, if any. */
  initialPath?: string;
}

/** Rejects the handshake (e.g. unknown game, unsupported protocol, denied capabilities). */
export interface RejectMessage extends RydrTagged {
  type: "rydr/reject";
  reason: string;
}

/** Live trainer power. */
export interface PowerMessage extends RydrTagged {
  type: "rydr/hw.power";
  watts: number;
  t: number;
}

/** Live pedalling cadence. */
export interface CadenceMessage extends RydrTagged {
  type: "rydr/hw.cadence";
  rpm: number;
  t: number;
}

/** Live heart rate. */
export interface HeartRateMessage extends RydrTagged {
  type: "rydr/hw.heartRate";
  bpm: number;
  t: number;
}

/** Live trainer-reported speed. */
export interface SpeedMessage extends RydrTagged {
  type: "rydr/hw.speed";
  mps: number;
  t: number;
}

/** Back-fill of power samples missed while the platform tab was backgrounded. */
export interface PowerBufferMessage extends RydrTagged {
  type: "rydr/hw.powerBuffer";
  samples: PowerSample[];
}

/** A canonical controller button event. */
export interface InputButtonMessage extends RydrTagged {
  type: "rydr/input.button";
  name: ButtonName;
  edge: ButtonEdge;
}

/** Scoped identity changed mid-session (e.g. profile edit in the shell). */
export interface IdentityUpdateMessage extends RydrTagged {
  type: "rydr/identity.update";
  identity: ScopedIdentity;
}

/** Trainer connection/capability status, so the game can show ERG availability etc. */
export interface TrainerStatusMessage extends RydrTagged {
  type: "rydr/trainer.status";
  connected: boolean;
  ergSupported: boolean;
}

/** Shell asks the game to pause (e.g. shell-level modal opened). */
export interface LifecyclePauseMessage extends RydrTagged {
  type: "rydr/lifecycle.pause";
}

/** Shell asks the game to resume. */
export interface LifecycleResumeMessage extends RydrTagged {
  type: "rydr/lifecycle.resume";
}

/** Liveness probe; the game must reply with a `pong` carrying the same nonce. */
export interface PingMessage extends RydrTagged {
  type: "rydr/ping";
  nonce: number;
}

export type PlatformToGameMessage =
  | WelcomeMessage
  | RejectMessage
  | PowerMessage
  | CadenceMessage
  | HeartRateMessage
  | SpeedMessage
  | PowerBufferMessage
  | InputButtonMessage
  | IdentityUpdateMessage
  | TrainerStatusMessage
  | LifecyclePauseMessage
  | LifecycleResumeMessage
  | PingMessage;

/** Any message in the protocol. */
export type RydrMessage = GameToPlatformMessage | PlatformToGameMessage;
