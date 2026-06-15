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
- **`session.hardware.current.smoothedPower`** — an EMA-smoothed power (watts) on the hardware
  snapshot, alongside raw `power`. It's a time-based exponential moving average advanced from a
  wall-clock delta each time the snapshot is read, so it ramps smoothly between the sparse
  (~1–4Hz) `rydr/hw.power` messages and is **frame-rate independent** (same result at 30/60/120fps).
  Computed in-iframe in the SDK client — **no extra wire traffic**.
- **Configurable smoothing strength (time constant τ, seconds).** Resolution order:
  the manifest value (new optional `welcome.powerSmoothing`, surfaced as `powerSmoothing` on
  `PlatformHostOptions` and set per game in the platform's `GameManifest` / admin) →
  `connectToPlatform({ powerSmoothing })` → the SDK default `DEFAULT_POWER_TAU_S` (0.06s, exported
  from the client). `τ = 0` disables smoothing (`smoothedPower` mirrors `power`).

### Migration / Action required
- **None — additive, no action.** `RYDR_PROTOCOL_VERSION` stays `5`: `welcome.powerSmoothing` is
  optional, so older shells simply omit it and the client falls back to `DEFAULT_POWER_TAU_S`.
  Games that today maintain their own power EMA can delete it and read
  `session.hardware.current.smoothedPower` instead; to match a previous hand-rolled time constant,
  set `powerSmoothing` in the game's manifest (the default already matches RYDR's prior 0.06s).

## [1.9.0] — 2026-06-10
### Added
- **`session.setMenu(visible)`** — a game can show/hide the shell's in-game platform menu (the
  hamburger that opens Exit + hardware/settings/profile), e.g. to hide it during fully-immersive
  play. Mirrors the existing `setPowerBar` control. New wire message `rydr/ui.setMenu`
  (`SetMenuMessage`) and host hook `onMenuRequest(visible)` on `PlatformHostOptions`.

### Removed
- **`session.setChrome(visible)`** and its wire message `rydr/ui.setChrome` (`SetChromeMessage`)
  + host hook `onChromeRequest`. The shell already always hides its navbar while a game is running,
  so the toggle was a no-op — the platform never acted on it. Use `session.setMenu(visible)` to
  control the in-game hamburger menu instead.

### Fixed
- The shell→game replies `rydr/world.listResult` and `rydr/world.getResult` (the `world.list` /
  `world.get` responses added in 1.8.0) were missing from the inbound message guard, so they were
  rejected before reaching the game. Added them to the allowlist; world lookups now resolve.

### Migration / Action required
- **Remove any `session.setChrome(...)` calls.** They no longer compile against this SDK. There is
  no replacement: the shell navbar is always hidden during gameplay automatically. If you were
  hiding the in-game menu, use `session.setMenu(false)` / `session.setMenu(true)` instead.
  `RYDR_PROTOCOL_VERSION` bumps `3 → 4` for the removed message. At runtime the removal is
  backward-compatible — an older game that still posts `rydr/ui.setChrome` is silently ignored by
  the shell (as it already was) — but the symbol is gone from the typed API, so update any caller.

## [1.8.1] — 2026-06-09
### Changed
- **Docs only.** Clarified that an in-game editor is **always opened inside the shell** and authors
  through the session, gated on `session.identity.isAdmin` — a game never handles the `ADMIN_SECRET`.
  Removed the guidance that suggested a "standalone" editor page sending the admin Bearer.
  `createAdminContentBackend` is now documented as **platform-owner out-of-band tooling only**, never
  a game or its editor. No code, API, or protocol change.

### Migration / Action required
- "None — documentation only." If your editor handles the `ADMIN_SECRET` itself (e.g. via
  `createAdminContentBackend`), move it into the shell and gate on `session.identity.isAdmin` instead
  — see README → "Build an in-game editor".

## [1.8.0] — 2026-06-09
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
- **Remove all admin-secret handling from your editor.** An editor is opened *inside* the shell (a
  guest at e.g. `/game/<your-game>/run-editor`) and authors through the session, gated on
  `isAdmin`. If your editor ever prompted for / stored the `ADMIN_SECRET` (including a "standalone"
  editor page using `createAdminContentBackend`), delete that — a game never handles the secret; the
  shell holds and relays it. A user becomes admin via the shell's `?admin` flow. `createAdminContentBackend`
  is for the platform owner's own out-of-band tooling only, never a game or its editor.

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

[Unreleased]: https://github.com/bdefrenne/rydr-game-sdk/compare/v1.9.0...HEAD
[1.9.0]: https://github.com/bdefrenne/rydr-game-sdk/releases/tag/v1.9.0
[1.8.1]: https://github.com/bdefrenne/rydr-game-sdk/releases/tag/v1.8.1
[1.8.0]: https://github.com/bdefrenne/rydr-game-sdk/releases/tag/v1.8.0
[1.7.1]: https://github.com/bdefrenne/rydr-game-sdk/releases/tag/v1.7.1
[1.7.0]: https://github.com/bdefrenne/rydr-game-sdk/releases/tag/v1.7.0
[1.6.0]: https://github.com/bdefrenne/rydr-game-sdk/releases/tag/v1.6.0
[1.5.0]: https://github.com/bdefrenne/rydr-game-sdk/releases/tag/v1.5.0
[1.4.0]: https://github.com/bdefrenne/rydr-game-sdk/releases/tag/v1.4.0
