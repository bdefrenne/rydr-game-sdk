# @rydr/game-sdk

The client SDK for building games on the **RYDR** indoor-cycling platform.

A RYDR game runs as a sandboxed cross-origin `<iframe>` embedded by the platform shell. The shell owns the hardware (BLE trainer, HRM, Zwift Play, phone) and the user; the game receives **scoped** hardware data and identity over a versioned `postMessage` wire protocol and never touches BLE or PII directly.

This package is the **public contract** between platform and game:

- `protocol/` — the versionless wire protocol: handshake, capabilities, scoped identity, hardware/lifecycle messages, type guards. **Treat as a public API — additive changes only.**
- `client/` — `connectToPlatform()` → a `PlatformSession` exposing a reactive hardware store, scoped identity, and trainer-control commands.
- `dev/` — `createDevHarness()`: a stand-in platform (power/HR/cadence sliders, fake profile) so a game runs standalone with no shell and no trainer.

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
