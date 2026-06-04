# @rydr/game-sdk

The client SDK for building games on the **RYDR** indoor-cycling platform.

A RYDR game runs as a sandboxed cross-origin `<iframe>` embedded by the platform shell. The shell owns the hardware (BLE trainer, HRM, Zwift Play, phone) and the user; the game receives **scoped** hardware data and identity over a versioned `postMessage` wire protocol and never touches BLE or PII directly.

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

const session = await connectToPlatform({
  gameId: "racing",
  capabilities: ["power", "cadence", "heartRate", "buttons", "identity"],
});

session.hardware.subscribe((hw) => render(hw.power, hw.heartRate));
session.onButton(({ name, edge }) => handleInput(name, edge));
session.setSimulation(4.2); // request 4.2% grade on the trainer
session.ready();
```

## Versioning

`RYDR_PROTOCOL_VERSION` is the wire version. The shell supports a range and adapts older messages. Breaking shape changes are forbidden; evolve additively.
