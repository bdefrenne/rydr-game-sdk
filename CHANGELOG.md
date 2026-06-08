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

## [Unreleased]

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

[Unreleased]: https://github.com/bdefrenne/rydr-game-sdk/compare/v1.4.0...HEAD
[1.4.0]: https://github.com/bdefrenne/rydr-game-sdk/releases/tag/v1.4.0
