/**
 * The platform-side counterpart to {@link connectToPlatform}.
 *
 * `createPlatformHost()` binds one embedded game iframe to the shell: it answers
 * the game's `hello` with a `welcome` (granting capabilities and a scoped,
 * PII-free identity), streams hardware from a pluggable {@link HardwareSource},
 * relays trainer-control commands back to it, and surfaces lifecycle/route/exit
 * events as callbacks. The shell supplies the real hardware + identity; this
 * host owns none of it — it only mediates the protocol.
 */
import type { Capability } from "../protocol/capabilities";
import type { ScopedIdentity } from "../protocol/identity";
import type { ButtonName, ButtonEdge } from "../protocol/buttons";
import type { ActivitySummary, PlatformToGameMessage } from "../protocol/messages";
import { RYDR_PROTOCOL_VERSION } from "../protocol/version";
import { isGameToPlatformMessage } from "../protocol/guards";

/** A point-in-time hardware reading pushed to connected games. Omitted fields are unchanged. */
export interface HardwareSample {
  power?: number;
  cadence?: number;
  heartRate?: number;
  speed?: number;
  /** ms timestamp from the platform clock. */
  t: number;
}

/** The shell's hardware, adapted to what the host needs. The shell implements this over its HardwareManager. */
export interface HardwareSource {
  /** Subscribe to live readings. Returns an unsubscribe fn. */
  subscribe(listener: (sample: HardwareSample) => void): () => void;
  /** Current trainer connection / ERG status. */
  getStatus(): { connected: boolean; ergSupported: boolean };
  /** Apply grade-based resistance. */
  setSimulation(gradePercent: number): void;
  /** Apply power-based (ERG) target. */
  setTargetPower(watts: number): void;
  /** Toggle ERG mode. */
  setErgMode(enabled: boolean): void;
}

export interface PlatformHostOptions {
  /** The embedded game iframe. */
  iframe: HTMLIFrameElement;
  /** Origin the game is served from. Messages from any other origin are ignored. Default `"*"` (dev only). */
  gameOrigin?: string;
  /** The shell's hardware. */
  hardware: HardwareSource;
  /** Produce the scoped identity granted to this game. */
  identityFor(gameId: string): ScopedIdentity;
  /** Decide which requested capabilities to grant. Default: grant all requested. */
  grantFor?(gameId: string, requested: Capability[]): Capability[];
  /** Initial deep-link path to hand the game. */
  initialPath?: string;

  onReady?(): void;
  onLoadProgress?(progress: number): void;
  onExitRequest?(): void;
  onRouteChanged?(path: string): void;
  onActivityStart?(sport: string, name?: string): void;
  onActivityFinish?(summary?: ActivitySummary): void;
  onRequestHardwareModal?(): void;
  onError?(message: string): void;
}

export interface PlatformHost {
  /** Tell the game to pause (e.g. a shell modal opened). */
  pause(): void;
  /** Tell the game to resume. */
  resume(): void;
  /** Push a controller button to the game (if it was granted `buttons`). */
  sendButton(name: ButtonName, edge: ButtonEdge): void;
  /** Push an updated scoped identity (e.g. after a profile edit). */
  updateIdentity(identity: ScopedIdentity): void;
  /** Tear down listeners and stop streaming. */
  dispose(): void;
}

/** Bind a game iframe to the shell over the wire protocol. */
export function createPlatformHost(options: PlatformHostOptions): PlatformHost {
  const { iframe, gameOrigin = "*", hardware, identityFor } = options;
  const grantFor = options.grantFor ?? ((_id, requested) => requested);

  let granted: Capability[] = [];
  let unsubscribeHardware: (() => void) | null = null;

  const post = (message: PlatformToGameMessage): void => {
    iframe.contentWindow?.postMessage(message, gameOrigin);
  };

  const can = (capability: Capability): boolean => granted.includes(capability);

  const onHardware = (s: HardwareSample): void => {
    if (s.power !== undefined && can("power")) post({ rydr: true, type: "rydr/hw.power", watts: s.power, t: s.t });
    if (s.cadence !== undefined && can("cadence")) post({ rydr: true, type: "rydr/hw.cadence", rpm: s.cadence, t: s.t });
    if (s.heartRate !== undefined && can("heartRate")) post({ rydr: true, type: "rydr/hw.heartRate", bpm: s.heartRate, t: s.t });
    if (s.speed !== undefined && can("speed")) post({ rydr: true, type: "rydr/hw.speed", mps: s.speed, t: s.t });
  };

  const onMessage = (event: MessageEvent): void => {
    if (event.source !== iframe.contentWindow) return;
    if (gameOrigin !== "*" && event.origin !== gameOrigin) return;
    const msg = event.data;
    if (!isGameToPlatformMessage(msg)) return;

    switch (msg.type) {
      case "rydr/hello": {
        granted = grantFor(msg.gameId, msg.capabilities);
        post({
          rydr: true,
          type: "rydr/welcome",
          protocolVersion: RYDR_PROTOCOL_VERSION,
          grantedCapabilities: granted,
          identity: identityFor(msg.gameId),
          initialPath: options.initialPath,
        });
        const status = hardware.getStatus();
        post({ rydr: true, type: "rydr/trainer.status", connected: status.connected, ergSupported: status.ergSupported });
        unsubscribeHardware?.();
        unsubscribeHardware = hardware.subscribe(onHardware);
        break;
      }
      case "rydr/ready":
        options.onReady?.();
        break;
      case "rydr/loadProgress":
        options.onLoadProgress?.(msg.progress);
        break;
      case "rydr/trainer.setSimulation":
        hardware.setSimulation(msg.gradePercent);
        break;
      case "rydr/trainer.setTargetPower":
        hardware.setTargetPower(msg.watts);
        break;
      case "rydr/trainer.setErgMode":
        hardware.setErgMode(msg.enabled);
        break;
      case "rydr/activity.start":
        options.onActivityStart?.(msg.sport, msg.name);
        break;
      case "rydr/activity.finish":
        options.onActivityFinish?.(msg.summary);
        break;
      case "rydr/route.changed":
        options.onRouteChanged?.(msg.path);
        break;
      case "rydr/exitRequest":
        options.onExitRequest?.();
        break;
      case "rydr/ui.requestHardwareModal":
        options.onRequestHardwareModal?.();
        break;
      case "rydr/pong":
        // liveness reply — no-op for now
        break;
      case "rydr/error":
        options.onError?.(msg.message);
        break;
    }
  };

  window.addEventListener("message", onMessage);

  return {
    pause: () => post({ rydr: true, type: "rydr/lifecycle.pause" }),
    resume: () => post({ rydr: true, type: "rydr/lifecycle.resume" }),
    sendButton: (name, edge) => {
      if (can("buttons")) post({ rydr: true, type: "rydr/input.button", name, edge });
    },
    updateIdentity: (identity) => post({ rydr: true, type: "rydr/identity.update", identity }),
    dispose: () => {
      unsubscribeHardware?.();
      unsubscribeHardware = null;
      window.removeEventListener("message", onMessage);
    },
  };
}
