#!/usr/bin/env node
/**
 * Packs the fork-built Webstudio CLI as a standalone npm tarball that the
 * self-hosted builder serves itself (see apps/builder/Dockerfile, stage `cli`).
 *
 * Why: the npm `webstudio` CLI is built from upstream and its API contract
 * hash drifts from a self-hosted instance as soon as either side moves, which
 * makes MCP writes fail. Serving a CLI built from the instance's own commit
 * keeps both in lockstep by construction. MCP clients then run:
 *
 *   npx -y --@webstudio-community:registry=https://<builder>/npm/ \
 *     @webstudio-community/cli mcp
 *
 * Input: a built `packages/cli` (lib/ present, version already stamped as
 * `<upstream version>-fork-<commit>`). Every `@webstudio-is/*` workspace
 * package is bundled into lib/ by the CLI's Vite config, so they are dropped
 * from `dependencies`; only third-party deps are resolved from npm.
 *
 * Output (`--out`): `<name>-<version>.tgz` + `cli-meta.json`
 * ({ name, version, filename, integrity, manifest }) read by the builder's npm
 * route. `manifest` is the packed package.json: npm resolves dependencies and
 * bins from the registry metadata, not from the tarball.
 *
 * Usage: node scripts/pack-instance-cli.mjs --out <dir>
 *          [--cli-dir packages/cli] [--name @webstudio-community/cli]
 */

import { execFileSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: {
    "cli-dir": { type: "string", default: "packages/cli" },
    out: { type: "string" },
    name: { type: "string", default: "@webstudio-community/cli" },
  },
});

if (values.out === undefined) {
  console.error("Missing --out <dir>");
  process.exit(1);
}

const cliDir = resolve(values["cli-dir"]);
const outDir = resolve(values.out);

// Fields kept from the CLI manifest; scripts/devDependencies are build-only.
const keptFields = [
  "description",
  "author",
  "homepage",
  "type",
  "bin",
  "exports",
  "files",
  "license",
  "engines",
];

const createManifest = (source) => {
  const manifest = { name: values.name, version: source.version };
  for (const field of keptFields) {
    if (source[field] !== undefined) {
      manifest[field] = source[field];
    }
  }
  const dependencies = {};
  for (const [name, range] of Object.entries(source.dependencies ?? {})) {
    if (name.startsWith("@webstudio-is/")) {
      continue;
    }
    if (range.startsWith("workspace:")) {
      throw new Error(`Unbundled workspace dependency: ${name}@${range}`);
    }
    dependencies[name] = range;
  }
  manifest.dependencies = dependencies;
  return manifest;
};

const source = JSON.parse(readFileSync(join(cliDir, "package.json"), "utf8"));

if (/-fork-[0-9a-z]+$/.test(source.version) === false) {
  throw new Error(
    `CLI version "${source.version}" is not stamped as <version>-fork-<commit>`
  );
}
if (existsSync(join(cliDir, "lib", "cli.js")) === false) {
  throw new Error(`CLI is not built: ${join(cliDir, "lib", "cli.js")} missing`);
}

const stagingDir = mkdtempSync(join(tmpdir(), "instance-cli-"));
try {
  // Copy the published entries; npm pack still applies `files` (and its
  // negations) on top of this.
  const entries = (source.files ?? [])
    .filter((entry) => entry.startsWith("!") === false)
    .map((entry) => entry.replace(/\/\*$/, ""));
  for (const entry of entries) {
    const from = join(cliDir, entry);
    if (existsSync(from)) {
      cpSync(from, join(stagingDir, entry), { recursive: true });
    }
  }
  const manifest = createManifest(source);
  writeFileSync(
    join(stagingDir, "package.json"),
    `${JSON.stringify(manifest, null, 2)}\n`
  );

  mkdirSync(outDir, { recursive: true });
  const [packed] = JSON.parse(
    execFileSync("npm", ["pack", "--json", "--pack-destination", outDir], {
      cwd: stagingDir,
      encoding: "utf8",
    })
  );
  const meta = {
    name: packed.name,
    version: packed.version,
    filename: packed.filename,
    integrity: packed.integrity,
    manifest,
  };
  writeFileSync(
    join(outDir, "cli-meta.json"),
    `${JSON.stringify(meta, null, 2)}\n`
  );
  console.info(`Packed ${meta.name}@${meta.version} → ${meta.filename}`);
} finally {
  rmSync(stagingDir, { recursive: true, force: true });
}
