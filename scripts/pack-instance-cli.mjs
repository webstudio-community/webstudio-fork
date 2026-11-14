#!/usr/bin/env node
// Packs the fork-built CLI as a standalone tarball served by the builder at
// /npm/ (apps/builder/Dockerfile, stage `cli`), so MCP clients run a CLI that
// matches the instance's API. Workspace packages are bundled into lib/, so
// only third-party deps stay in `dependencies`. Writes the .tgz and
// cli-meta.json; `manifest` is needed because npm reads deps and bins from the
// registry metadata, not the tarball.
//
// Usage: node scripts/pack-instance-cli.mjs --out <dir> [--cli-dir packages/cli] [--name @webstudio-community/cli]

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
  // npm pack still applies `files` on top of this.
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
