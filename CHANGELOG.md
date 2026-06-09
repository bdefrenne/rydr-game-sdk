# Changelog

All notable changes to `@rydr/game-sdk` are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

> **R&D phase — no backward-compatibility guarantee.** There are no production consumers
> yet, so we do **not** maintain old API/protocol shapes. Breaking changes are only made
> with explicit sign-off; when approved, every game must update to the new version.
>
> **Self-contained migration is the rule.** A game on _any_ version must be able to reach
> the latest by reading each entry between its version and `HEAD` in order and doing exactly
> what each **Migration / Action required** callout says — nothing else needed. So every
> callout must be **concrete and standalone**: show the old → new code/shape, name the exact
> symbols, and never assume the reader saw an earlier entry. Either it says **"None — additive,
> no action"** or it lists the precise steps. When the wire protocol changes,
> `RYDR_PROTOCOL_VERSION` bumps and the callout says so.
>
> **Enforced — you cannot release undocumented.** Write changes under `## [Unreleased]` as you go.
> `npm version` runs a `preversion` gate (`scripts/check-changelog.mjs`) that REFUSES to bump if
> Unreleased is empty or missing its `### Migration / Action required` callout, then auto-promotes
> Unreleased → the new `## [x.y.z] — DATE` (`scripts/release-changelog.mjs`). Publish CI re-checks
> that the tagged version has an entry, so a manual `git tag` can't bypass it either.

## [Unreleased]

### Added
- **`applyWorld(target, world, { loadGlb })`** (main export) — render a platform `WorldDoc` into your
  own three.js scene. Renderer-agnostic and pulls in **no** `three` dependency (structural types);
  you pass your own `GLTFLoader`. See README → "Shared worlds".
- **`session.listWorlds()` / `session.getWorld(id)`** — read the platform's shared, cross-game 3D
  environments authored in the platform world editor. New protocol messages `rydr/world.list` and
  `rydr/world.get`; `RYDR_PROTOCOL_VERSION` → **3** (additive).
- **`ScopedIdentity.isAdmin?: boolean`** — whether the player is in the platform's admin mode. Use it
  to reveal an in-game editor entry point.

### Changed
- In-game editor authoring (`saveContent` / `deleteContent` / `getUploadUrl`, i.e. the `shared`
  scope) is now gated by **admin mode**, not a per-game author allowlist. The shell relays the admin
  secret on your behalf; your game never handles the secret.

### Migration / Action required

**Protocol 2 → 3 (additive — existing calls unchanged).** Update the dependency to get worlds + `isAdmin`.

**If your game ships an in-game editor** (authors `shared` content via `saveContent`/`getUploadUrl`):
- The per-game **author allowlist is removed**. There is no `_authors` list anymore and no need to be
  added to one. Do **not** call any author-allowlist admin endpoint (it's gone).
- **Gate your editor UI on `session.identity.isAdmin`** instead. When `true`, your existing
  `session.saveContent(...)` / `session.getUploadUrl(...)` calls work unchanged — the shell attaches
  the admin secret for you. When `false`, they reject (as before for non-authors).
- **Remove any admin-secret handling from an in-shell editor.** If your in-shell editor prompted for /
  stored the `ADMIN_SECRET` itself, delete that — the shell holds and relays it now. A user becomes
  admin by entering the secret once in the shell's `?admin` flow.
- **Standalone editors** (their own `.html`, opened outside the shell, using
  `createAdminContentBackend`) are unchanged — they still send the admin Bearer directly.

**No editor?** None — additive, no action.

## [1.7.1] — 2026-06-08

### Changed
- **ESM correctness.** Relative imports in the build now carry explicit `.js` extensions
  (build switched to `NodeNext`), so the package resolves under native Node ESM, not only
  inside bundlers.

### Migration / Action required
- "None — additive, no action." Bundled consumers (Vite, etc.) were unaffected; this only fixes
  native/non-bundler ESM resolution.

## [1.7.0] — 2026-06-08

### Added
- **`session.setPowerBar(visible)`** (`rydr/ui.setPowerBar`) — show/hide the shell's trainerless
  power bar (e.g. hide it inside an editor).

### Changed
- **Distribution: `@rydr/game-sdk` is now published to npm** (public, scoped). Depend on it from
  the registry instead of the GitHub git URL — installs are token-free and cached, and semver
  ranges / `npm update` work normally.

### Migration / Action required
- **Switch your dependency from the GitHub git URL to the npm range.** In your game's
  `package.json`:
  - old: `"@rydr/game-sdk": "github:bdefrenne/rydr-game-sdk#semver:^1.x.0"`
  - new: `"@rydr/game-sdk": "^1.7.1"`

  then run `npm install` (regenerates the lockfile to resolve from `registry.npmjs.org`). Import
  paths and API are unchanged — only the dependency source moves.

## [1.6.0] — 2026-06-08

### Added
- **Realtime rooms (trusted, shell-owned).** `session.joinRoom(roomId)` returns a `RoomHandle`:
  presence, opaque `send`/`setState`, **trusted `on("telemetry")`** (peers' real, shell-stamped
  power/cadence/HR — `RoomTelemetry`), and a **server-stamped `scheduleEvent(name, payload?, at?)`**
  + `on("event")` — the genre-neutral orchestration "whistle" for fair, head-start-free
  countdowns/turns on a shared clock. The shell owns the socket and relays for the game, so
  identity and telemetry can't be forged. `createLoopbackRoom` echoes it all for standalone dev.
- New `rydr/room.*` protocol messages and types `RoomMember` / `RoomTelemetry` / `RoomEvent`.

### Changed
- **`RYDR_PROTOCOL_VERSION` → 2.** `joinRoom` now relays through the shell instead of opening a
  direct WebSocket from the game.

### Migration / Action required
- "None — additive, no action" for games that don't use rooms. To go realtime, call
  `session.joinRoom(...)`; your own watts are injected into the room by the shell automatically
  (you only ever read opponents' telemetry).

## [1.5.0] — 2026-06-08

### Added
- **In-game editor backend** — `createAdminContentBackend({ host, gameId, getSecret })`
  returns an `AdminContentBackend` (`list` / `get` / `save` / `remove` / `uploadAsset`) for
  standalone editor pages. It's the authoring-time mirror of the session content API
  (`getContent` / `saveContent`): a page with no platform session writes `shared` gamedata
  over HTTP with `Authorization: Bearer <ADMIN_SECRET>`. The game reads the same content back
  through `session.listContent` / `getContent`. New README section "Build an in-game editor".

### Migration / Action required
- "None — additive, no action." New export only; existing code is unaffected.

<!-- Entry template — every release MUST end with a Migration / Action required callout.
     The callout must be self-contained: a reader on the previous version does exactly what
     it says and is fully migrated, without consulting code or other entries.
## [x.y.z] — YYYY-MM-DD
### Added / Changed / Removed
- ...
### Migration / Action required
- "None — additive, no action." OR concrete steps with old -> new code and exact symbols, e.g.:
  - Rename `oldMethod(a, b)` -> `newMethod({ a, b })`.
  - `getReplay` now returns `{ body, meta }` instead of `body`; read `result.body`.
-->


## [1.4.0] — 2026-06-05

### Added
- **Typed replay frames.** Replays are now a structured frame array instead of an
  opaque blob: `ReplayFrame { t, power, customData? }` (`t` + `power` are mandatory and
  platform-readable; `customData` is game-owned). Timing lives per-frame in `t` — there
  is no global `dt`/`sampleCount`.
- `ReplayBody { version, frames }` plus an SDK-owned codec (`encodeReplay` /
  `decodeReplay`, gzip + base64).
- Derived `ReplayMeta { durationMs, avgPower, maxPower }`, computed by the SDK.
- `getReplays()` `ReplayRef` now carries `meta`, so ghost lists can be built without
  decoding each replay body.

### Changed
- `saveReplay(runId, frames, { version? })` sends the encoded blob plus derived meta.
- `getReplay(runId)` now returns `{ body, meta }`.
- Protocol and host relay thread `ReplayMeta` through.

### Removed
- Standalone dev harness (`src/dev`) and the `dev:game` script.

### Migration / Action required
- **None for the replay additions** — new methods and types; existing code keeps working.
- If you imported anything from `src/dev` / used the `dev:game` script, it's gone — drop it.

---

Releases before 1.4.0 (v1.0.0 – v1.3.0) predate this changelog; see the git tags and
commit messages for their history.

[Unreleased]: https://github.com/bdefrenne/rydr-game-sdk/compare/v1.7.1...HEAD
[1.7.1]: https://github.com/bdefrenne/rydr-game-sdk/releases/tag/v1.7.1
[1.7.0]: https://github.com/bdefrenne/rydr-game-sdk/releases/tag/v1.7.0
[1.6.0]: https://github.com/bdefrenne/rydr-game-sdk/releases/tag/v1.6.0
[1.5.0]: https://github.com/bdefrenne/rydr-game-sdk/releases/tag/v1.5.0
[1.4.0]: https://github.com/bdefrenne/rydr-game-sdk/releases/tag/v1.4.0
