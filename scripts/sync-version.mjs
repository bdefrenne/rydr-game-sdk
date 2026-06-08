#!/usr/bin/env node
/**
 * Single-source the wire-reported SDK version: rewrite RYDR_SDK_VERSION in
 * src/protocol/version.ts to match package.json's `version`.
 *
 * Wired into npm's `version` lifecycle (see package.json), so `npm version <patch|minor>`
 * keeps the handshake's SDK version in lockstep with the package version automatically —
 * they used to be hand-edited in two places and drifted.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { version } = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
const file = resolve(root, "src/protocol/version.ts");
const src = readFileSync(file, "utf8");

const next = src.replace(
  /export const RYDR_SDK_VERSION = "[^"]*";/,
  `export const RYDR_SDK_VERSION = "${version}";`,
);
if (next === src && !src.includes(`RYDR_SDK_VERSION = "${version}"`)) {
  console.error("[sync-version] could not find the RYDR_SDK_VERSION literal to update");
  process.exit(1);
}
writeFileSync(file, next);
console.log(`[sync-version] RYDR_SDK_VERSION = "${version}"`);
