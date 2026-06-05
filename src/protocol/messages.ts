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
import type { BoardDefinition, BoardEntry, SubmitScoreResult } from "./boards";
import type { GameDataScope, GameDoc } from "./gamedata";

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

/**
 * Game submits a score to a leaderboard. The shell performs the authenticated
 * write (stamping playerId + runId) and replies with {@link LeaderboardSubmitResultMessage}
 * carrying the same `nonce`. `key` selects a parameterized board family member
 * (e.g. per-track): board `{boardId}:{key}`.
 */
export interface LeaderboardSubmitMessage extends RydrTagged {
  type: "rydr/leaderboard.submit";
  nonce: number;
  boardId: string;
  value: number;
  key?: string;
}

/** Game reads a leaderboard. The shell fetches and replies with {@link LeaderboardQueryResultMessage}. */
export interface LeaderboardQueryMessage extends RydrTagged {
  type: "rydr/leaderboard.query";
  nonce: number;
  boardId: string;
  key?: string;
  limit?: number;
}

/** Game saves an opaque, game-specific run breakdown. Fire-and-forget; the shell stamps runId + playerId. */
export interface RunSaveMessage extends RydrTagged {
  type: "rydr/run.save";
  breakdown: unknown;
}

/** Read one doc from the generic game-data store. Reply: {@link GameDataResultMessage} (`doc`). */
export interface GameDataGetMessage extends RydrTagged {
  type: "rydr/gamedata.get";
  nonce: number;
  scope: GameDataScope;
  collection: string;
  id: string;
}

/** List a collection. Reply: {@link GameDataResultMessage} (`docs`). */
export interface GameDataListMessage extends RydrTagged {
  type: "rydr/gamedata.list";
  nonce: number;
  scope: GameDataScope;
  collection: string;
}

/** Write a doc (scope `player` or `public` only — `shared` is admin-authored). Reply: `ok`. */
export interface GameDataSaveMessage extends RydrTagged {
  type: "rydr/gamedata.save";
  nonce: number;
  scope: GameDataScope;
  collection: string;
  id: string;
  data: unknown;
}

/** Delete an owned doc (scope `player` or `public`). Reply: `ok`. */
export interface GameDataDeleteMessage extends RydrTagged {
  type: "rydr/gamedata.delete";
  nonce: number;
  scope: GameDataScope;
  collection: string;
  id: string;
}

/** Request a presigned upload URL for a binary asset (e.g. an MP3). Reply:
 *  {@link AssetUploadUrlResultMessage}. Authed by the per-game author allowlist. */
export interface AssetUploadUrlMessage extends RydrTagged {
  type: "rydr/asset.uploadUrl";
  nonce: number;
  collection: string;
  filename: string;
  contentType?: string;
}

export type GameToPlatformMessage =
  | HelloMessage
  | ReadyMessage
  | LoadProgressMessage
  | PongMessage
  | TrainerSetSimulationMessage
  | TrainerSetTargetPowerMessage
  | TrainerSetErgModeMessage
  | RouteChangedMessage
  | SetChromeMessage
  | ExitRequestMessage
  | RequestHardwareModalMessage
  | GameErrorMessage
  | LeaderboardSubmitMessage
  | LeaderboardQueryMessage
  | RunSaveMessage
  | GameDataGetMessage
  | GameDataListMessage
  | GameDataSaveMessage
  | GameDataDeleteMessage
  | AssetUploadUrlMessage;

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
  /** The game's declared leaderboard boards (catalog), so the SDK can validate ids + format. */
  boards?: BoardDefinition[];
  /** The run this session is recorded under (links score/run to the shell's FIT activity). */
  runId?: string;
  /** The `rydr` backend host (e.g. `rydr.bdefrenne.partykit.dev`) — lets the SDK open a direct
   *  WebSocket for realtime rooms (`joinRoom`). HTTP data calls still go through the relay. */
  dataHost?: string;
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

/** Reply to {@link LeaderboardSubmitMessage} (matched by `nonce`). */
export interface LeaderboardSubmitResultMessage extends RydrTagged {
  type: "rydr/leaderboard.submitResult";
  nonce: number;
  result: SubmitScoreResult;
}

/** Reply to {@link LeaderboardQueryMessage} (matched by `nonce`). */
export interface LeaderboardQueryResultMessage extends RydrTagged {
  type: "rydr/leaderboard.queryResult";
  nonce: number;
  entries: BoardEntry[];
  you?: BoardEntry;
}

/** Reply to any `rydr/gamedata.*` request (matched by `nonce`). `get`→`doc`, `list`→`docs`,
 *  `save`/`delete`→`ok`. `error` set when the op was denied/failed. */
export interface GameDataResultMessage extends RydrTagged {
  type: "rydr/gamedata.result";
  nonce: number;
  doc?: GameDoc | null;
  docs?: GameDoc[];
  ok?: boolean;
  error?: string;
}

/** Reply to {@link AssetUploadUrlMessage}: a presigned PUT `uploadUrl` + the eventual public `url`. */
export interface AssetUploadUrlResultMessage extends RydrTagged {
  type: "rydr/asset.uploadUrlResult";
  nonce: number;
  uploadUrl?: string;
  url?: string;
  error?: string;
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
  | PingMessage
  | LeaderboardSubmitResultMessage
  | LeaderboardQueryResultMessage
  | GameDataResultMessage
  | AssetUploadUrlResultMessage;

/** Any message in the protocol. */
export type RydrMessage = GameToPlatformMessage | PlatformToGameMessage;
