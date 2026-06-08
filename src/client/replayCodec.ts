/**
 * Replay blob codec — the SDK-owned wire shape for replays.
 *
 * A game hands {@link saveReplay} an array of {@link ReplayFrame}; the SDK packs it into a
 * versioned {@link ReplayBody}, gzip+base64-encodes it (so it travels as one opaque string the
 * platform stores verbatim), and in the same pass derives the {@link ReplayMeta} display summary.
 * `decodeReplay` is the inverse, used when a caller actually needs the timeline back.
 *
 * Encoding mirrors the platform's other compressed payloads: gzip via `CompressionStream`, base64,
 * prefixed `gz:`. When `CompressionStream` is unavailable the blob falls back to URL-encoded base64
 * JSON (no `gz:` prefix), and `decodeReplay` accepts both.
 */
import type { ReplayBody, ReplayFrame, ReplayMeta } from "../protocol/replays.js";

const GZIP_PREFIX = "gz:";

/** Derive the platform-visible summary from a replay's frames. */
function deriveMeta(frames: ReplayFrame[]): ReplayMeta {
  if (frames.length === 0) {
    return { durationMs: 0, avgPower: 0, maxPower: 0 };
  }
  let sum = 0;
  let max = 0;
  for (const f of frames) {
    sum += f.power;
    if (f.power > max) max = f.power;
  }
  const lastFrame = frames[frames.length - 1];
  return {
    durationMs: lastFrame ? lastFrame.t : 0,
    avgPower: Math.round(sum / frames.length),
    maxPower: Math.round(max),
  };
}

/**
 * Encode replay frames into the blob saved by {@link PlatformSession.saveReplay}, plus the derived
 * {@link ReplayMeta}. Async because gzip compression is streaming.
 */
export async function encodeReplay(
  frames: ReplayFrame[],
  version = 1,
): Promise<{ blob: string; meta: ReplayMeta }> {
  const body: ReplayBody = { version, frames };
  const json = JSON.stringify(body);
  const meta = deriveMeta(frames);

  if (typeof CompressionStream === "undefined") {
    return { blob: btoa(encodeURIComponent(json)), meta };
  }

  try {
    const cs = new CompressionStream("gzip");
    const writer = cs.writable.getWriter();
    void writer.write(new TextEncoder().encode(json));
    void writer.close();
    const compressed = new Uint8Array(await new Response(cs.readable).arrayBuffer());
    let binary = "";
    for (const byte of compressed) binary += String.fromCharCode(byte);
    return { blob: `${GZIP_PREFIX}${btoa(binary)}`, meta };
  } catch {
    return { blob: btoa(encodeURIComponent(json)), meta };
  }
}

/**
 * Decode a replay blob (as returned by {@link PlatformSession.getReplay} / `getReplays`) back into
 * its {@link ReplayBody}. Returns `null` if the blob is empty or cannot be parsed.
 */
export async function decodeReplay(blob: string | null): Promise<ReplayBody | null> {
  if (!blob) return null;
  try {
    if (blob.startsWith(GZIP_PREFIX)) {
      if (typeof DecompressionStream === "undefined") return null;
      const binary = atob(blob.slice(GZIP_PREFIX.length));
      const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
      const ds = new DecompressionStream("gzip");
      const writer = ds.writable.getWriter();
      void writer.write(bytes);
      void writer.close();
      const json = new TextDecoder().decode(await new Response(ds.readable).arrayBuffer());
      return JSON.parse(json) as ReplayBody;
    }
    // Uncompressed fallback (URL-encoded base64 JSON).
    return JSON.parse(decodeURIComponent(atob(blob))) as ReplayBody;
  } catch {
    return null;
  }
}
