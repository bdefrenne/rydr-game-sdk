# @rydr/game-sdk

The client SDK for building games on the **RYDR** indoor-cycling platform.

A RYDR game runs as a sandboxed cross-origin `<iframe>` embedded by the platform shell. The shell owns the hardware (BLE trainer, HRM, Zwift Play, phone) and the user; the game receives **scoped** hardware data and identity over a versioned `postMessage` wire protocol and never touches BLE or PII directly.

Beyond bridging hardware and identity, the shell also **backs a set of services** a game can call: leaderboards, opaque run records, a scoped game-data store (dev-authored content, per-player saves, and world-readable UGC), asset hosting, and realtime rooms — see [Backend services](#backend-services). A game rarely needs its own backend.

This package is the **public contract** between platform and game:

- `protocol/` — the versionless wire protocol: handshake, capabilities, scoped identity, hardware/lifecycle messages, type guards. **Treat as a public API — additive changes only.**
- `client/` — `connectToPlatform()` → a `PlatformSession` exposing a reactive hardware store, scoped identity, and trainer-control commands.
- `host/` — `createPlatformHost()`: the **platform side** of the protocol (used by the shell to embed a game).
- `dev/` — `createDevHarness()`: a stand-in platform (power/HR/cadence sliders, fake profile) so a game runs standalone with no shell and no trainer.

## Install

Public git dependency (no registry, no token):

```jsonc
// package.json
"dependencies": { "@rydr/game-sdk": "github:bdefrenne/rydr-game-sdk#semver:^1.0.0" }
```

**Starting a new game?** Don't wire this by hand — scaffold from
[`create-rydr-game`](https://github.com/bdefrenne/create-rydr-game) (`npx degit
bdefrenne/create-rydr-game my-game`), which comes with the SDK wired, a dev script, and an
agent-runnable `SETUP.md`.

## The boundary

```
platform shell  ──(SDK wire protocol)──▶  game iframe
  owns BLE/HRM/profile/FIT                 receives scoped power/HR/cadence/buttons + identity
```

The game↔engine protocol *inside* a game (e.g. racing's Three.js engine iframe) is the game's private business and is not part of this SDK.

## Usage (game side)

```ts
import { connectToPlatform } from "@rydr/game-sdk";

// Games get FULL access — you don't pick capabilities. Just pass your gameId.
const session = await connectToPlatform({ gameId: "racing" });

session.hardware.subscribe((hw) => render(hw.power, hw.heartRate));
session.onButton(({ name, edge }) => handleInput(name, edge));
session.setSimulation(4.2); // request 4.2% grade on the trainer
session.ready();
```

## API reference

`connectToPlatform(options)` → `Promise<PlatformSession>`. Options:
`{ gameId: string; platformOrigin?: string; target?: Window; handshakeTimeoutMs?: number }`.
**Games get full access — there's no capability selection.** (`capabilities?: Capability[]`
exists but defaults to ALL; you don't set it.)

### PlatformSession
- `identity: ScopedIdentity` — `{ playerId, displayName: string; weightKg, ftp: number }` (PII-free).
- `grantedCapabilities: readonly Capability[]` · `initialPath: string | undefined`.
- `hardware: HardwareStore` — `current: HardwareSnapshot`, and `subscribe(cb) => () => void` (fires immediately, then on every change).
- `ready()` · `reportLoadProgress(0..100)` · `reportError(message)`.
- `setSimulation(gradePercent)` · `setTargetPower(watts)` · `setErgMode(enabled)` — trainer control.
- `setRoute(path)` · `setChrome(visible)` · `requestExit()` · `requestHardwareModal()`.

> **No activity/FIT API.** The platform records every session automatically from its own hardware stream — games do nothing for recording.

- `boards: readonly BoardDefinition[]` · `runId: string` · `dataHost: string` — the game's leaderboard catalog (from its manifest), the run this session is recorded under, and the realtime backend host.
- **Backend services** (detailed below): `submitScore` · `getLeaderboard` · `saveRun` · `getContent`/`listContent` · `getData`/`listData`/`saveData`/`deleteData` · `saveContent`/`deleteContent` · `getUploadUrl` · `joinRoom`.
- `onButton(cb)` · `onPause(cb)` · `onResume(cb)` · `onIdentityChange(cb)` — each returns an unsubscribe fn.
- `dispose()`.

`HardwareSnapshot` = `{ power, cadence, heartRate, speed: number; trainerConnected, ergSupported: boolean; updatedAt: number }`
— power W · cadence rpm · heartRate bpm (0 with no HRM) · speed m/s · updatedAt ms.

`ButtonEvent` = `{ name: ButtonName; edge: "down" | "up" }` (see `protocol/buttons.ts` for the `ButtonName` union).

### Standalone dev
`createDevHarness(options?)` stands up a mock platform (sliders + fake identity) so a game runs with no shell:
`{ ui?: boolean; grant?: Capability[]; identity?: Partial<ScopedIdentity>; initialPath?: string; streamHz?: number }`.

> The compiled types in `dist/index.d.ts` are authoritative — this section is the overview.

## Backend services

The shell backs a handful of services so a game rarely needs its own backend. All calls go through the SDK; the platform stamps `playerId` + `runId` and enforces access. (`dist/index.d.ts` is authoritative for exact types.)

### Leaderboards

Boards are **declarative game config** — each declares an id and how it ranks/formats, not created at runtime. They come from the game's manifest; the shell hands the catalog to the game at handshake as `session.boards: BoardDefinition[]`. **`submitScore` to an unknown `boardId` is rejected** — the board must be declared in the manifest first. (How a game declares boards in its manifest is part of its scaffolding, not the SDK.)

```ts
// session.boards = [{ id: "waves", valueType: "count", sort: "desc", aggregate: "best" }, …]
const { rank, isPersonalBest, total } = await session.submitScore("waves", wavesCleared);
const page = await session.getLeaderboard("waves", { limit: 10 }); // { entries, you? }
```

- `submitScore(boardId, value, { key? })` → `{ rank, isPersonalBest, total }` — for a results screen. `key` selects a parameterized board family member (e.g. per-track).
- `getLeaderboard(boardId, { key?, limit? })` → `{ entries: BoardEntry[], you? }` — top-N plus the requester's own row.
- `formatBoardValue(valueType, value)` formats a raw value for display. It is a **standalone package export, not a session method** — `import { formatBoardValue } from "@rydr/game-sdk"`, then `formatBoardValue(board.valueType, entry.value)`.

### Run records

```ts
session.saveRun({ outcome: "win", waves: 12 }); // fire-and-forget — returns void, do NOT await
```

`saveRun(breakdown)` stores an opaque, game-specific object against this session's `runId` (which links to the FIT activity).

### Game-data store (opaque docs)

Three scopes. `data` is opaque to the platform — the game owns the shape. Docs are `GameDoc` (`{ id, data, updatedAt, ownerId?, draft? }`).

| Scope | Who can read / write | Methods |
|-------|----------------------|---------|
| `player` *(default)* | the player only — private saves | `getData` · `listData` · `saveData` · `deleteData` |
| `public` | owner writes, **world-readable** — player UGC | same methods, with `{ scope: "public" }` |
| `shared` | **world-readable, author-gated write** — dev-authored content | `getContent` · `listContent` (read) · `saveContent` · `deleteContent` (write) |

```ts
await session.saveData("saves", "slot1", { level: 4, hp: 80 }); // player-private (default scope)
const slot = await session.getData("saves", "slot1");           // → GameDoc | null
const tracks = await session.listContent("tracks");             // dev-authored shared content
```

> **Player content uses `public`, not `shared`.** `saveContent`/`deleteContent`/`getUploadUrl` are gated by the game's **author allowlist** (checked by `playerId`) — a normal player calling them is **rejected**. Route player-generated content through `saveData(collection, id, value, { scope: "public" })`. Reserve `saveContent`/`getUploadUrl` for in-game **author/admin tooling** (level/chart/song editors).

### Asset upload

For binaries (MP3s, images) backing `shared` content. **Author-gated** (same allowlist as `saveContent`).

```ts
const { uploadUrl, url } = await session.getUploadUrl({ collection: "songs", filename: "track.mp3" });
await fetch(uploadUrl, { method: "PUT", body: file }); // PUT the bytes directly
await session.saveContent("songs", "track-1", { title: "…", audioUrl: url }); // store the public url
```

### Realtime rooms

```ts
const room = session.joinRoom("lobby");
const off = room.on("message", (data, from) => render(data, from));
room.on("presence", (members) => updateRoster(members));
room.send({ kick: true });          // relay to other members
room.setState({ phase: "racing" }); // merge into shared opaque state (last-write-wins)
// room.members · room.state · room.leave()
```

`joinRoom(roomId)` → `RoomHandle` over a direct WebSocket (presence + relay + opaque shared state; the server is dumb — the game defines what messages/state mean). Events: `message`, `presence`, `state`, `open`, `close`; each `on(...)` returns an unsubscribe fn. In **standalone dev** (no shell) it falls back to a local single-member loopback room, so room code runs without a backend.

## Versioning

`RYDR_PROTOCOL_VERSION` is the wire version. The shell supports a range and adapts older messages. Breaking shape changes are forbidden; evolve additively.
