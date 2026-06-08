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

1. **Gate every change on "is this breaking for clients?"** `src/protocol/` is the public API
   across independently-deployed games. Before making a change, decide whether it breaks
   existing clients (changed/removed message shape or capability meaning, changed method
   signature/return, etc.):
   - **Breaking → STOP and ask the user first.** Do not ship it unprompted. If they decline,
     either do nothing or find a retro-compatible path. If they approve, bump
     `RYDR_PROTOCOL_VERSION` and spell out the required migration in `CHANGELOG.md` under
     **Migration / Action required**. (We're in R&D with no prod consumers, so the host need
     not keep accepting old shapes — every game updates to the new version.)
   - **Non-breaking → proceed,** but still add a `CHANGELOG.md` entry explaining what's new.

   The changelog is the **complete migration path**: a game on any version reaches latest by
   reading each entry between its version and `HEAD` and following the **Migration / Action
   required** callout. So every callout must be self-contained and concrete (old → new code,
   exact symbols) or say "None — additive, no action" — never assume the reader saw another entry.
2. **Both sides share one definition.** Client and host import the same protocol types — the
   protocol is defined once, here.
3. **Scoped + minimal.** Identity is PII-free; games request a capability subset and the host
   grants least-privilege.
4. **Build:** `prepare` runs `tsc` so git-dependency consumers get `dist/` on install. Publish
   = bump `version` + add a `CHANGELOG.md` entry for that version + tag `vX.Y.Z`. Never bump
   the version without a matching changelog entry.

## Keep the game template in sync (REQUIRED)

`create-rydr-game` (`github:bdefrenne/create-rydr-game`) is the skeleton every new game is
scaffolded from, and it mirrors this SDK's surface. **When you change anything a guest sees,
update the template in the SAME change:**
- capability change (`src/protocol/capabilities.ts`) → template `src/main.ts` + `SETUP.md`.
- session method / message change (`src/client/PlatformClient.ts`, `src/protocol/messages.ts`)
  → template `src/main.ts` usage/comments + `CLAUDE.md`.
- `protocolVersion` / handshake change → note it in the template.

A drifted template silently teaches every new game the wrong shape.
