/**
 * Admin content backend — the authoring-time mirror of the player-facing
 * content API ({@link PlatformSession.getContent} / `saveContent`), for
 * standalone in-game editor pages.
 *
 * A standalone editor page (e.g. `run-editor.html`, `track-editor.html`) has no
 * platform session, so it authenticates with the platform owner's
 * `ADMIN_SECRET` (Bearer) instead of the author allowlist. This factory wraps
 * the generic gamedata party's HTTP contract for one `gameId` so editors don't
 * hand-roll `fetch` + headers:
 *
 *   - read  (public):   `GET    {host}/parties/gamedata/{gameId}/shared/{collection}[/{id}]`
 *   - write (Bearer):   `PUT    …/shared/{collection}/{id}`   body `{ data, draft? }`
 *   - delete(Bearer):   `DELETE …/shared/{collection}/{id}`
 *   - asset (Bearer):   `POST   …/{gameId}/asset/upload-url` → presigned R2 PUT
 *
 * The game reads the SAME content back through the SDK session
 * (`session.listContent` / `getContent`) — one shared backend, no per-game
 * server. See the "Build an in-game editor" guide in the README.
 *
 * SECURITY: `ADMIN_SECRET` is the platform owner's key (full write to any
 * game's shared content). It is an authoring-time credential, entered at
 * runtime (kept in `sessionStorage`, never in the repo) and never shipped to
 * players. Player-generated content uses the SDK's public owner-write scope
 * instead, not this backend.
 */

import type { GameDoc } from "../protocol/gamedata";

/** Bytes accepted by {@link AdminContentBackend.uploadAsset}. */
export type AssetBody = Blob | ArrayBuffer | ArrayBufferView;

export interface AdminContentBackend {
  /** List all docs in a shared collection (includes drafts — Bearer is sent). */
  list(collection: string): Promise<GameDoc[]>;
  /** Fetch one shared doc, or `null` if it doesn't exist. */
  get(collection: string, id: string): Promise<GameDoc | null>;
  /** Create/overwrite a shared doc. `draft: true` hides it from the public (player) read until published. */
  save(collection: string, id: string, value: unknown, opts?: { draft?: boolean }): Promise<void>;
  /** Delete a shared doc. */
  remove(collection: string, id: string): Promise<void>;
  /** Upload a binary asset to R2 and return its public URL (store it in a doc via {@link save}). */
  uploadAsset(opts: { collection: string; filename: string; contentType?: string; body: AssetBody }): Promise<{ url: string }>;
}

export interface AdminContentOptions {
  /** Platform origin (no trailing slash), e.g. `https://my-game.partykit.dev` or `http://localhost:1999`. */
  host: string;
  /** The game's stable id (slug), matching its platform manifest. */
  gameId: string;
  /** Returns the `ADMIN_SECRET` at call time (e.g. from `sessionStorage`). Read per-request so a re-entered secret takes effect. */
  getSecret: () => string;
}

/**
 * Build an {@link AdminContentBackend} for one game. Pure factory — no network
 * until a method is called. Every request carries the Bearer secret so the
 * editor can see drafts and perform writes.
 */
export function createAdminContentBackend(opts: AdminContentOptions): AdminContentBackend {
  const base = `${opts.host.replace(/\/$/, "")}/parties/gamedata/${opts.gameId}`;
  const authHeaders = (): Record<string, string> => ({ Authorization: `Bearer ${opts.getSecret()}` });

  async function req<T>(method: string, url: string, body?: unknown): Promise<T> {
    const res = await fetch(url, {
      method,
      headers: { ...authHeaders(), ...(body !== undefined ? { "Content-Type": "application/json" } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`[rydr-admin] ${method} ${url} → ${res.status} ${detail}`);
    }
    return (await res.json()) as T;
  }

  return {
    async list(collection) {
      const r = await req<{ docs?: GameDoc[] }>("GET", `${base}/shared/${collection}`);
      return r.docs ?? [];
    },
    async get(collection, id) {
      const r = await req<{ doc?: GameDoc | null }>("GET", `${base}/shared/${collection}/${id}`);
      return r.doc ?? null;
    },
    async save(collection, id, value, saveOpts) {
      await req<{ ok: true }>("PUT", `${base}/shared/${collection}/${id}`, { data: value, draft: saveOpts?.draft });
    },
    async remove(collection, id) {
      await req<{ ok: true }>("DELETE", `${base}/shared/${collection}/${id}`);
    },
    async uploadAsset({ collection, filename, contentType, body }) {
      const { uploadUrl, url } = await req<{ uploadUrl: string; url: string }>(
        "POST",
        `${base}/asset/upload-url`,
        { collection, filename },
      );
      const put = await fetch(uploadUrl, {
        method: "PUT",
        headers: contentType ? { "Content-Type": contentType } : {},
        body: body as BodyInit,
      });
      if (!put.ok) throw new Error(`[rydr-admin] asset PUT → ${put.status}`);
      return { url };
    },
  };
}
