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

const isBareSpecifier = (specifier) =>
  specifier.length > 0 &&
  !specifier.startsWith(".") &&
  !specifier.startsWith("/") &&
  !specifier.startsWith("node:") &&
  !specifier.startsWith("data:") &&
  !specifier.startsWith("file:");

const isIdentChar = (ch) => ch !== undefined && /[\w$]/.test(ch);

// Any of these means a declaration, not a from-clause: stop tracking so a later
// string literal is not mistaken for a specifier.
const clauseBreakingKeywords = new Set([
  "function",
  "class",
  "const",
  "let",
  "var",
  "async",
  "default",
  "new",
  "return",
  "if",
  "else",
  "for",
  "while",
  "typeof",
  "instanceof",
  "in",
  "of",
  "yield",
  "await",
  "try",
  "catch",
  "finally",
  "throw",
  "switch",
  "case",
  "break",
  "continue",
  "do",
  "super",
  "this",
  "void",
  "delete",
  "extends",
  "static",
  "get",
  "set",
  "true",
  "false",
  "null",
  "undefined",
]);

// Hand-rolled scanner aware of strings, comments and regexes: the bundled acorn
// source is full of import-like text (`kw("import")`, `copyRange(from, to)`)
// that a regex misreads. Interpolated dynamic imports are skipped.
const extractSpecifiers = (source) => {
  const specifiers = new Set();
  const n = source.length;
  let i = 0;
  // null | "clause" | "from" | "call-paren" | "call-string"
  let pending = null;
  let prevSignificant = "";

  while (i < n) {
    const ch = source[i];

    if (ch === "/" && source[i + 1] === "/") {
      i += 2;
      while (i < n && source[i] !== "\n") {
        i++;
      }
      continue;
    }

    if (ch === "/" && source[i + 1] === "*") {
      i += 2;
      while (i < n && !(source[i] === "*" && source[i + 1] === "/")) {
        i++;
      }
      i += 2;
      continue;
    }

    if (ch === '"' || ch === "'" || ch === "`") {
      const quote = ch;
      let j = i + 1;
      let value = "";
      while (j < n && source[j] !== quote) {
        if (source[j] === "\\") {
          value += source[j + 1] ?? "";
          j += 2;
          continue;
        }
        value += source[j];
        j++;
      }
      if (pending === "from" || pending === "call-string") {
        if (quote !== "`") {
          specifiers.add(value);
        }
      }
      pending = null;
      prevSignificant = quote;
      i = j + 1;
      continue;
    }

    // A `/` not after an identifier, number, `)` or `]` starts a regex, so quotes
    // inside it (e.g. /["']/) are not read as strings.
    if (ch === "/" && !/[\w$)\]]/.test(prevSignificant)) {
      let j = i + 1;
      let inClass = false;
      let closed = false;
      while (j < n) {
        if (source[j] === "\\") {
          j += 2;
          continue;
        }
        if (source[j] === "\n") {
          break;
        }
        if (source[j] === "[") {
          inClass = true;
        } else if (source[j] === "]") {
          inClass = false;
        } else if (source[j] === "/" && !inClass) {
          closed = true;
          break;
        }
        j++;
      }
      if (closed) {
        i = j + 1;
        while (i < n && /[a-z]/i.test(source[i])) {
          i++; // flags
        }
        pending = null;
        prevSignificant = "/";
        continue;
      }
      // No closing "/" before a newline: not a regex.
    }

    if (isIdentChar(ch)) {
      let j = i;
      while (j < n && isIdentChar(source[j])) {
        j++;
      }
      const word = source.slice(i, j);

      if (word === "import" || word === "require") {
        let k = j;
        while (k < n && /\s/.test(source[k])) {
          k++;
        }
        if (source[k] === "(") {
          pending = "call-paren";
        } else if (
          word === "import" &&
          (source[k] === '"' || source[k] === "'" || source[k] === "`")
        ) {
          // Side-effect import: `import "x";`
          pending = "from";
        } else {
          pending = word === "import" ? "clause" : null;
        }
        i = j;
        prevSignificant = word;
        continue;
      }
      if (word === "export") {
        pending = "clause";
        i = j;
        prevSignificant = word;
        continue;
      }
      if (word === "from" && pending === "clause") {
        pending = "from";
        i = j;
        prevSignificant = word;
        continue;
      }
      if (pending === "clause") {
        if (clauseBreakingKeywords.has(word)) {
          pending = null;
        }
      } else if (
        pending !== "from" &&
        pending !== "call-paren" &&
        pending !== "call-string"
      ) {
        pending = null;
      }
      i = j;
      prevSignificant = word;
      continue;
    }

    if (!/\s/.test(ch)) {
      if (pending === "clause") {
        if (!/[{}, *]/.test(ch)) {
          pending = null;
        }
      } else if (pending === "call-paren") {
        pending = ch === "(" ? "call-string" : null;
      } else if (pending === "from" || pending === "call-string") {
        pending = null; // non-whitespace before the string: bail
      }
      prevSignificant = ch;
    }

    i++;
  }

  return specifiers;
};

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
  for (const specifier of extractSpecifiers(content)) {
    if (isBareSpecifier(specifier)) {
      specifiers.add(specifier);
    }
  }
}

// Same lookup Node runs from the deployed bundle.
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
