import { createRequire } from "node:module";
import { readdir, readFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";

const [, , bundleDirArg, nodeModulesDirArg] = process.argv;

if (!bundleDirArg || !nodeModulesDirArg) {
  console.error(
    "Usage: node verify-standalone-deps.mjs <bundle-dir> <node-modules-dir>"
  );
  process.exit(1);
}

const bundleDir = resolve(bundleDirArg);
const nodeModulesDir = resolve(nodeModulesDirArg);

// Heuristic, not a real parser — but anchored on tokens that can't appear
// by coincidence in arbitrary bundled data. A bare `\bfrom\s*["']` (with no
// requirement of an `import`/`export` keyword before it) previously matched
// unrelated `"from"` object keys embedded in bundled data (e.g. char-range
// tables), producing garbage "missing" specifiers. `import`/`export` are
// reserved words, so requiring one directly before `from`, with no quote or
// `;` in between (i.e. still inside the same import clause), is safe.
const specifierPatterns = [
  // import ... from "x" / export ... from "x"
  /\b(?:import|export)\b[^;'"]*?\bfrom\s*["']([^"']+)["']/g,
  // import "x" (side-effect) / import("x") (dynamic)
  /\bimport\s*\(?\s*["']([^"']+)["']/g,
  // require("x")
  /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g,
];

const isBareSpecifier = (specifier) =>
  !specifier.startsWith(".") &&
  !specifier.startsWith("/") &&
  !specifier.startsWith("node:") &&
  !specifier.startsWith("data:") &&
  !specifier.startsWith("file:");

const collectJsFiles = async (dir) => {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectJsFiles(path)));
    } else if ([".js", ".mjs", ".cjs"].includes(extname(entry.name))) {
      files.push(path);
    }
  }
  return files;
};

const files = await collectJsFiles(bundleDir);
if (files.length === 0) {
  console.error(`No .js files found under ${bundleDir}`);
  process.exit(1);
}

const specifiers = new Set();
for (const file of files) {
  const content = await readFile(file, "utf8");
  for (const pattern of specifierPatterns) {
    for (const match of content.matchAll(pattern)) {
      const specifier = match[1];
      if (isBareSpecifier(specifier)) {
        specifiers.add(specifier);
      }
    }
  }
}

// Resolution matches what the manual parse5 check used to confirm the fix
// (require.resolve(pkg, {paths: [...]})) — it walks the same node_modules
// lookup algorithm Node uses at runtime from the deployed bundle.
const require = createRequire(join(nodeModulesDir, "..", "package.json"));

const missing = [];
for (const specifier of [...specifiers].sort()) {
  try {
    require.resolve(specifier, { paths: [nodeModulesDir] });
  } catch {
    missing.push(specifier);
  }
}

if (missing.length > 0) {
  console.error(
    `verify-standalone-deps: ${missing.length} bare import(s) referenced by ` +
      `${bundleDir} do not resolve from ${nodeModulesDir}:\n`
  );
  for (const specifier of missing) {
    console.error(`  - ${specifier}`);
  }
  console.error(
    "\nThese are pulled in only as transitive dependencies, so `pnpm " +
      "--prod deploy` does not create a top-level node_modules symlink for " +
      "them (see the 'Standalone deploy gotcha' note in CLAUDE.md). Fix by " +
      "either declaring the package as a direct dependency in " +
      "apps/builder/package.json (see the parse5 precedent, PR #48), or by " +
      "adding an explicit symlink in the Dockerfile (see the " +
      "react-router-dom precedent)."
  );
  process.exit(1);
}

console.info(
  `verify-standalone-deps: all ${specifiers.size} bare imports resolve from ${nodeModulesDir}.`
);
