#!/usr/bin/env node
/**
 * Promote `## [Unreleased]` → `## [<version>] — <date>` during `npm version` (the `version`
 * lifecycle hook), leaving a fresh empty Unreleased and updating the link refs. Coupled with the
 * `preversion` gate (check-changelog.mjs), this means the changelog is ALWAYS written as part of a
 * bump — never an afterthought. The version is read from package.json (already bumped at this hook).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { version } = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
const date = new Date().toISOString().slice(0, 10);
const repo = "https://github.com/bdefrenne/rydr-game-sdk";
const file = resolve(root, "CHANGELOG.md");
let md = readFileSync(file, "utf8");

// Promote: capture the Unreleased body, restamp it under the new version, leave a clean Unreleased.
const m = md.match(/(##\s*\[Unreleased\]\s*\n)([\s\S]*?)(\n##\s*\[)/);
if (!m) {
  console.error("[changelog] cannot find an Unreleased section to promote");
  process.exit(1);
}
const promoted =
  `## [Unreleased]\n\n_Nothing yet._\n\n` +
  `## [${version}] — ${date}\n${m[2].replace(/\s+$/, "")}\n${m[3]}`;
md = md.slice(0, m.index) + promoted + md.slice(m.index + m[0].length);

// Link refs: point Unreleased at v<new>...HEAD and add the new version's tag link.
md = md.replace(/(\[Unreleased\]:\s*\S*compare\/)v[\d.]+(\.\.\.HEAD)/, `$1v${version}$2`);
if (!new RegExp(`^\\[${version.replace(/\./g, "\\.")}\\]:`, "m").test(md)) {
  md = md.replace(/(\[Unreleased\]:[^\n]*\n)/, `$1[${version}]: ${repo}/releases/tag/v${version}\n`);
}

writeFileSync(file, md);
console.log(`[changelog] promoted Unreleased → [${version}] — ${date}`);
