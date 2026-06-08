#!/usr/bin/env node
/**
 * CHANGELOG gate — makes it impossible to release without a documented entry. Two modes:
 *
 *  - no arg (the `preversion` hook): the `## [Unreleased]` section must be non-empty AND carry a
 *    `### Migration / Action required` callout. So `npm version` aborts before bumping unless you
 *    documented the change.
 *  - `<version>` (CI on a pushed tag): a `## [<version>]` entry must already exist. So a release
 *    can't publish without its changelog entry even if the local hook was bypassed (e.g. a manual
 *    `git tag`). Run in publish CI: `node scripts/check-changelog.mjs "$(node -p "require('./package.json').version")"`.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const md = readFileSync(resolve(root, "CHANGELOG.md"), "utf8");
const want = process.argv[2]?.replace(/^v/, "");

const die = (msg) => {
  console.error(`\n[changelog] ${msg}\n`);
  process.exit(1);
};

if (want) {
  // CI mode: the tagged version must have an entry.
  if (!new RegExp(`^##\\s*\\[${want.replace(/\./g, "\\.")}\\]`, "m").test(md)) {
    die(`No '## [${want}]' entry in CHANGELOG.md — every published version must be documented.`);
  }
  console.log(`[changelog] entry for ${want} present ✓`);
} else {
  // preversion mode: Unreleased must be real + carry the Migration callout.
  const m = md.match(/##\s*\[Unreleased\]\s*\n([\s\S]*?)(?=\n##\s*\[)/);
  if (!m) die("No '## [Unreleased]' section found in CHANGELOG.md.");
  const body = m[1].trim();
  const norm = body.replace(/[_*]/g, "").trim().toLowerCase(); // strip markdown italics
  if (norm === "" || norm === "nothing yet." || norm === "nothing yet") {
    die(
      "## [Unreleased] is empty — document the change there before `npm version`\n" +
        "(Added/Changed/Removed + a '### Migration / Action required' callout).",
    );
  }
  if (!/###\s*Migration\s*\/\s*Action required/i.test(body)) {
    die("## [Unreleased] is missing its '### Migration / Action required' callout.");
  }
  console.log("[changelog] Unreleased entry present ✓");
}
