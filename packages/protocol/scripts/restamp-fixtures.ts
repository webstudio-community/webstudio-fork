// Fork schema patches change the bundleVersion contract hash, so the
// upstream-generated fixtures fail fixtures.test.ts. Rewrite only that field;
// the test still checks the data parses under the fork schema.
//
// pnpm fixtures:restamp [--check]
import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { bundleVersion } from "../src/schema";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const fixturesRoot = resolve(scriptDir, "../../../fixtures");
const check = process.argv.includes("--check");

const target = JSON.stringify(bundleVersion);
const pattern = /("bundleVersion"\s*:\s*)("[^"]*"|\d+)/;

let drift = 0;
let updated = 0;

for (const entry of readdirSync(fixturesRoot, { withFileTypes: true })) {
  if (entry.isDirectory() === false) {
    continue;
  }
  const file = join(fixturesRoot, entry.name, ".webstudio", "data.json");
  if (existsSync(file) === false) {
    continue;
  }
  const text = readFileSync(file, "utf8");
  const match = text.match(pattern);
  if (match === null) {
    continue;
  }
  if (match[2] === target) {
    continue;
  }
  drift += 1;
  if (check) {
    console.error(`drift: ${entry.name} has ${match[2]}, expected ${target}`);
    continue;
  }
  writeFileSync(file, text.replace(pattern, `$1${target}`));
  updated += 1;
  console.info(`re-stamped ${entry.name} → ${target}`);
}

if (check) {
  if (drift > 0) {
    console.error(
      `${drift} fixture bundle(s) out of date. Run: pnpm fixtures:restamp`
    );
    process.exit(1);
  }
  console.info(`fixtures bundleVersion up to date (${target})`);
} else {
  console.info(
    updated === 0
      ? `fixtures already current (${target})`
      : `re-stamped ${updated} fixture bundle(s) → ${target}`
  );
}
