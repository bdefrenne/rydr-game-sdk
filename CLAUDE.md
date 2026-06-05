# @rydr/game-sdk — AI Operating Manual

> The **public contract** between the RYDR platform shell and a game. A game runs as a
> sandboxed cross-origin iframe; the shell owns hardware + identity + FIT and bridges scoped
> data to the game over a versioned `postMessage` protocol. Consumed as a **public git
> dependency** (`github:bdefrenne/rydr-game-sdk#semver:^1`); see `README.md` for usage.

## Module map

| Area | Path | What |
|------|------|------|
| Wire protocol | `src/protocol/` | messages, capabilities, scoped identity, buttons, guards, `version` |
| Game side | `src/client/` | `connectToPlatform()` → `PlatformSession` (+ reactive `HardwareStore`) |
| Platform side | `src/host/` | `createPlatformHost()` — what the shell uses to embed a game |

## Contract rules (don't break)

1. **Additive only.** `src/protocol/` is a public API across independently-deployed games.
   Never change/remove a message shape or capability meaning — add. Breaking changes bump
   `RYDR_PROTOCOL_VERSION` and require the host to keep accepting the old shape.
2. **Both sides share one definition.** Client and host import the same protocol types — the
   protocol is defined once, here.
3. **Scoped + minimal.** Identity is PII-free; games request a capability subset and the host
   grants least-privilege.
4. **Build:** `prepare` runs `tsc` so git-dependency consumers get `dist/` on install. Publish
   = bump `version` + tag `vX.Y.Z`.

## Keep the game template in sync (REQUIRED)

`create-rydr-game` (`github:bdefrenne/create-rydr-game`) is the skeleton every new game is
scaffolded from, and it mirrors this SDK's surface. **When you change anything a guest sees,
update the template in the SAME change:**
- capability change (`src/protocol/capabilities.ts`) → template `src/main.ts` + `SETUP.md`.
- session method / message change (`src/client/PlatformClient.ts`, `src/protocol/messages.ts`)
  → template `src/main.ts` usage/comments + `CLAUDE.md`.
- `protocolVersion` / handshake change → note it in the template.

A drifted template silently teaches every new game the wrong shape.
