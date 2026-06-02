/**
 * Reactive snapshot of bridged hardware state for a game.
 *
 * A game never owns hardware; it observes this store, which the
 * {@link PlatformClient} keeps current from the platform's `hw.*` messages.
 * Buttons are events (see `PlatformSession.onButton`), not state, so they live
 * on the client rather than here.
 */
export interface HardwareSnapshot {
  /** Trainer power, watts. */
  power: number;
  /** Pedalling cadence, rpm. */
  cadence: number;
  /** Heart rate, bpm (0 when no HRM). */
  heartRate: number;
  /** Trainer-reported speed, m/s. */
  speed: number;
  /** Whether a trainer is currently connected. */
  trainerConnected: boolean;
  /** Whether the connected trainer supports ERG (target-power) control. */
  ergSupported: boolean;
  /** ms timestamp of the most recent update (0 before any data). */
  updatedAt: number;
}

const EMPTY: HardwareSnapshot = {
  power: 0,
  cadence: 0,
  heartRate: 0,
  speed: 0,
  trainerConnected: false,
  ergSupported: false,
  updatedAt: 0,
};

export type HardwareListener = (snapshot: HardwareSnapshot) => void;

/** Holds the latest hardware snapshot and notifies subscribers on change. */
export class HardwareStore {
  private snapshot: HardwareSnapshot = EMPTY;
  private readonly listeners = new Set<HardwareListener>();

  /** The latest snapshot. Cheap to read every frame. */
  get current(): HardwareSnapshot {
    return this.snapshot;
  }

  /** Subscribe to changes. Fires immediately with the current snapshot. Returns an unsubscribe fn. */
  subscribe(listener: HardwareListener): () => void {
    this.listeners.add(listener);
    listener(this.snapshot);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Merge a partial update and notify subscribers.
   * @internal Used by {@link PlatformClient}; games should not call this.
   */
  _patch(patch: Partial<HardwareSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const listener of this.listeners) listener(this.snapshot);
  }
}
