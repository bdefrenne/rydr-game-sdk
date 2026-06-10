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
import type { Capability } from "./capabilities.js";
import type { ScopedIdentity } from "./identity.js";
import type { ButtonName, ButtonEdge } from "./buttons.js";
import type { BoardDefinition, BoardEntry, SubmitScoreResult } from "./boards.js";
import type { GameDataScope, GameDoc } from "./gamedata.js";
import type { WorldDoc } from "./worlds.js";
import type { ReplayMeta } from "./replays.js";
import type { RoomMember } from "./room.js";
// RoomEvent shape is documented in ./room; its fields are inlined on the wire messages below.

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

/** Game asks the shell to show/hide the trainerless power bar (e.g. hide it in an editor). */
export interface SetPowerBarMessage extends RydrTagged {
  type: "rydr/ui.setPowerBar";
  visible: boolean;
}

/** Game asks the shell to show/hide the in-game platform menu (the hamburger that opens
 *  Exit + hardware/settings/profile), e.g. hide it during fully-immersive play. */
export interface SetMenuMessage extends RydrTagged {
  type: "rydr/ui.setMenu";
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

/**
 * Save a replay/ghost keyed by `runId`: the `blob` is the game's compressed frame time-series
 * (base64; opaque at this layer — the SDK encodes a `ReplayFrame[]` into it), and `meta` is the
 * SDK-derived display summary persisted alongside it for ghost lists. The shell relays the
 * authenticated write to the `replays` party (stamping playerId). A replay aligns to a leaderboard
 * entry via the shared `runId`. Reply: {@link ReplayResultMessage} (`ok`).
 */
export interface ReplaySaveMessage extends RydrTagged {
  type: "rydr/replay.save";
  nonce: number;
  runId: string;
  /** base64 string of the game's compressed replay/ghost time-series. */
  blob: string;
  /** Derived display summary (duration + power) stored alongside the blob for ghost lists. */
  meta: ReplayMeta;
}

/** Fetch a stored replay by `runId`. Reply: {@link ReplayResultMessage} (`blob`+`meta`, both `null` if absent). */
export interface ReplayGetMessage extends RydrTagged {
  type: "rydr/replay.get";
  nonce: number;
  runId: string;
}

/** List the platform's shared worlds (cross-game environments). Reply:
 *  {@link WorldListResultMessage}. Public read — no auth. */
export interface WorldListMessage extends RydrTagged {
  type: "rydr/world.list";
  nonce: number;
}

/** Fetch one world by id. Reply: {@link WorldGetResultMessage} (`world`, `null` if absent). */
export interface WorldGetMessage extends RydrTagged {
  type: "rydr/world.get";
  nonce: number;
  id: string;
}

/** Read back an opaque run breakdown by `runId` (the one saved via {@link RunSaveMessage}).
 *  Reply: {@link RunGetResultMessage}. */
export interface RunGetMessage extends RydrTagged {
  type: "rydr/run.get";
  nonce: number;
  runId: string;
}

// ── Realtime rooms ──
// The shell owns the room WebSocket (the game iframe never connects directly), so identity and
// telemetry are trusted. The game drives the room through these relay messages; the shell forwards
// room events back as the `rydr/room.{opened,closed,presence,state,message,telemetry}` family below.
// `roomId` routes each frame to the right client-side handle (a game may hold several rooms).

/** Ask the shell to join (open) a room. The shell opens the socket and starts forwarding events. */
export interface RoomJoinMessage extends RydrTagged {
  type: "rydr/room.join";
  roomId: string;
}

/** Ask the shell to leave a room and close its socket. */
export interface RoomLeaveMessage extends RydrTagged {
  type: "rydr/room.leave";
  roomId: string;
}

/** Relay an opaque game message to the room's other members. */
export interface RoomSendMessage extends RydrTagged {
  type: "rydr/room.send";
  roomId: string;
  data: unknown;
}

/** Merge an opaque patch into the room's shared state (last-write-wins) and broadcast it. */
export interface RoomSetStateMessage extends RydrTagged {
  type: "rydr/room.setState";
  roomId: string;
  patch: Record<string, unknown>;
}

/** Schedule a server-stamped orchestration event (the "referee whistle"). `at` is optional —
 *  immediate if omitted, a future server-clock instant if given. See {@link RoomEvent}. */
export interface RoomScheduleEventMessage extends RydrTagged {
  type: "rydr/room.scheduleEvent";
  roomId: string;
  name: string;
  payload?: unknown;
  at?: number;
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
  | SetPowerBarMessage
  | SetMenuMessage
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
  | AssetUploadUrlMessage
  | ReplaySaveMessage
  | ReplayGetMessage
  | RunGetMessage
  | WorldListMessage
  | WorldGetMessage
  | RoomJoinMessage
  | RoomLeaveMessage
  | RoomSendMessage
  | RoomSetStateMessage
  | RoomScheduleEventMessage;

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

/** Reply to {@link ReplaySaveMessage} / {@link ReplayGetMessage} (matched by `nonce`):
 *  save→`ok`; get→`blob`+`meta` (`null` when not found). `error` set on failure. */
export interface ReplayResultMessage extends RydrTagged {
  type: "rydr/replay.result";
  nonce: number;
  ok?: boolean;
  blob?: string | null;
  /** Derived display summary returned with a fetched replay (`null`/absent when not found). */
  meta?: ReplayMeta | null;
  error?: string;
}

/** Reply to {@link RunGetMessage} (matched by `nonce`): the opaque `breakdown`, or `null` if absent. */
export interface RunGetResultMessage extends RydrTagged {
  type: "rydr/run.result";
  nonce: number;
  breakdown?: unknown;
  error?: string;
}

/** Reply to {@link WorldListMessage} (matched by `nonce`). */
export interface WorldListResultMessage extends RydrTagged {
  type: "rydr/world.listResult";
  nonce: number;
  worlds?: WorldDoc[];
  error?: string;
}

/** Reply to {@link WorldGetMessage} (matched by `nonce`): the `world`, or `null` if absent. */
export interface WorldGetResultMessage extends RydrTagged {
  type: "rydr/world.getResult";
  nonce: number;
  world?: WorldDoc | null;
  error?: string;
}

// ── Realtime room events (shell → game) ──
// Forwarded by the shell from its room socket. All carry `roomId` so the SDK routes them to the
// matching `joinRoom` handle.

/** The room socket opened. */
export interface RoomOpenedMessage extends RydrTagged {
  type: "rydr/room.opened";
  roomId: string;
}

/** The room socket closed (left, dropped, or rejected because the room was full). */
export interface RoomClosedMessage extends RydrTagged {
  type: "rydr/room.closed";
  roomId: string;
}

/** Room membership changed (de-duped by playerId). */
export interface RoomPresenceMessage extends RydrTagged {
  type: "rydr/room.presence";
  roomId: string;
  members: RoomMember[];
}

/** The room's shared opaque state changed. */
export interface RoomStateMessage extends RydrTagged {
  type: "rydr/room.state";
  roomId: string;
  state: Record<string, unknown>;
}

/** A relayed opaque message from a peer in the room. */
export interface RoomMessageMessage extends RydrTagged {
  type: "rydr/room.message";
  roomId: string;
  from: string;
  data: unknown;
}

/** A trusted, shell-stamped telemetry reading for one room member (raw hardware; `from` is the
 *  member's playerId). Maps to {@link RoomTelemetry} on the SDK side. */
export interface RoomTelemetryMessage extends RydrTagged {
  type: "rydr/room.telemetry";
  roomId: string;
  from: string;
  power?: number;
  cadence?: number;
  heartRate?: number;
  t: number;
}

/** A server-stamped orchestration event broadcast to the room. Maps to {@link RoomEvent} on the
 *  SDK side; `from` is the scheduler's playerId and `at` the shared-clock instant to act on. */
export interface RoomEventMessage extends RydrTagged {
  type: "rydr/room.event";
  roomId: string;
  name: string;
  payload: unknown;
  at: number;
  from: string;
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
  | AssetUploadUrlResultMessage
  | ReplayResultMessage
  | RunGetResultMessage
  | WorldListResultMessage
  | WorldGetResultMessage
  | RoomOpenedMessage
  | RoomClosedMessage
  | RoomPresenceMessage
  | RoomStateMessage
  | RoomMessageMessage
  | RoomTelemetryMessage
  | RoomEventMessage;

/** Any message in the protocol. */
export type RydrMessage = GameToPlatformMessage | PlatformToGameMessage;
