/**
 * Reactive snapshot of bridged hardware state for a game.
 *
 * A game never owns hardware; it observes this store, which the
 * {@link PlatformClient} keeps current from the platform's `hw.*` messages.
 * Buttons are events (see `PlatformSession.onButton`), not state, so they live
 * on the client rather than here.
 */
export interface HardwareSnapshot {
  /**
   * Raw trainer power, watts — the exact last reading, updated only when a power message
   * arrives (~1–4Hz), so it's steppy/jittery between updates.
   *
   * You get BOTH this and {@link smoothedPower}; pick per use:
   * - **`power`** — for anything that should reflect the true instantaneous value: the HUD watts
   *   readout, zone/metric calculations, logging, threshold checks.
   * - **`smoothedPower`** — for anything you drive continuously off power (a cursor, position,
   *   speed, fill bar), where raw jitter would look bad.
   *
   * Using `power` for a continuously-moving control will look jittery; using `smoothedPower` for
   * a numeric watts readout will read low/laggy during surges. Choose deliberately.
   */
  power: number;
  /**
   * EMA-smoothed power, watts — see {@link power} for when to use which. A time-based exponential
   * moving average over raw `power`, advanced from a wall-clock delta each time the snapshot is
   * read, so it ramps smoothly between the sparse (~1–4Hz) power messages and is frame-rate
   * independent. The smoothing strength (time constant) defaults to {@link DEFAULT_POWER_TAU_S}
   * and can be overridden per game via the manifest or {@link ConnectOptions.powerSmoothing}.
   */
  smoothedPower: number;
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
  smoothedPower: 0,
  cadence: 0,
  heartRate: 0,
  speed: 0,
  trainerConnected: false,
  ergSupported: false,
  updatedAt: 0,
};

export type HardwareListener = (snapshot: HardwareSnapshot) => void;

/**
 * Default power-smoothing time constant (seconds). Tuned for responsive tracking with minimal
 * single-frame jitter (the value the RYDR games used before smoothing moved into the SDK).
 * A larger τ smooths more but lags more. Override per game via the manifest /
 * {@link ConnectOptions.powerSmoothing}.
 */
export const DEFAULT_POWER_TAU_S = 0.06;

/** Largest single EMA step (seconds). Bounds catch-up after a tab stall/backgrounding; never
 *  fires at ordinary frame rates, so smoothing stays frame-rate independent. */
const MAX_SMOOTHING_STEP_S = 1.0;

/** Holds the latest hardware snapshot and notifies subscribers on change. */
export class HardwareStore {
  private snapshot: HardwareSnapshot = EMPTY;
  private readonly listeners = new Set<HardwareListener>();

  /** Smoothing time constant (s). 0 disables smoothing (smoothedPower mirrors power). */
  private tauS: number;
  /** ms wall-clock timestamp of the last EMA advance; 0 before the first sample. */
  private smoothedAt = 0;

  constructor(tauSeconds: number = DEFAULT_POWER_TAU_S) {
    this.tauS = Math.max(0, tauSeconds);
  }

  /** The latest snapshot, with {@link HardwareSnapshot.smoothedPower} advanced to now. Cheap to
   *  read every frame — this is the intended way games poll smoothed power. */
  get current(): HardwareSnapshot {
    this.advanceSmoothing();
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
   * Set the power-smoothing time constant (seconds). Called when the `welcome` manifest value
   * arrives (after construction). 0 disables smoothing.
   * @internal
   */
  _setSmoothingTau(tauSeconds: number): void {
    this.tauS = Math.max(0, tauSeconds);
  }

  /**
   * Merge a partial update and notify subscribers.
   * @internal Used by {@link PlatformClient}; games should not call this.
   */
  _patch(patch: Partial<HardwareSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    // Refresh smoothedPower so event-only subscribers (not polling `current`) see a fresh value.
    this.advanceSmoothing();
    for (const listener of this.listeners) listener(this.snapshot);
  }

  /**
   * Advance the EMA toward the latest raw power using the real elapsed wall-clock time. Using
   * `k = 1 - exp(-dt/τ)` makes the result frame-rate independent (the gap to target decays by
   * `exp(-dt/τ)`, which composes additively over dt). Seeds to the current raw power on the
   * first sample so it doesn't ramp up from zero.
   */
  private advanceSmoothing(): void {
    const now = Date.now();
    if (this.smoothedAt === 0) {
      this.snapshot.smoothedPower = this.snapshot.power;
      this.smoothedAt = now;
      return;
    }
    const dt = Math.min(MAX_SMOOTHING_STEP_S, (now - this.smoothedAt) / 1000);
    this.smoothedAt = now;
    if (dt <= 0) return;
    const k = this.tauS > 0 ? 1 - Math.exp(-dt / this.tauS) : 1;
    this.snapshot.smoothedPower += (this.snapshot.power - this.snapshot.smoothedPower) * k;
  }
}
