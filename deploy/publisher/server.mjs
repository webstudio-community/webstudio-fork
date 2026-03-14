/**
 * Self-hosted Webstudio publisher service.
 *
 * Receives publish requests from the builder app and generates static HTML files
 * using the Webstudio CLI (webstudio sync + build + vite build).
 * The output is written to /var/publish/<domain>/ which Nginx serves.
 *
 * Workflow per project (keyed by domain):
 *   1. First publish: `webstudio sync` + `webstudio build --template ssg` +
 *      `npm install` (once) + `vite build` → copy dist/ to /var/publish/<domain>/
 *   2. Subsequent publishes: repeat from step 1, npm install is skipped if
 *      node_modules already exists.
 *
 * Environment variables:
 *   TRPC_SERVER_API_TOKEN  — service token to authenticate with the builder app
 *   BUILDER_INTERNAL_URL   — internal Docker URL for the builder (default: http://app:3000)
 *                            Used for REST API calls and webstudio sync --origin.
 *                            Avoids going through Traefik/TLS from within the container.
 *   PORT                   — HTTP port (default: 4000)
 */

import { createServer } from "node:http";
import { exec } from "node:child_process";
import { mkdir, cp, rm, access, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

const execAsync = promisify(exec);

const PORT = process.env.PORT ?? "4000";
const SERVICE_TOKEN = process.env.TRPC_SERVER_API_TOKEN ?? "";
const PUBLISHER_HOST = process.env.PUBLISHER_HOST ?? "";
// URL interne Docker pour joindre le builder sans passer par Traefik/TLS
const BUILDER_INTERNAL_URL = process.env.BUILDER_INTERNAL_URL ?? "http://app:3000";
const PUBLISH_DIR = "/var/publish";
const WORK_DIR = "/var/work";

const log = (msg) => console.info(`[publisher] ${msg}`);
const logErr = (msg) => console.error(`[publisher] ${msg}`);

/** Serialize publish jobs per domain to avoid concurrent vite builds. */
const projectQueues = new Map();

const getProjectQueue = (domain) => {
  const existing = projectQueues.get(domain);
  if (existing) {
    return existing;
  }
  const q = { current: Promise.resolve() };
  projectQueues.set(domain, q);
  return q;
};

/**
 * Fetch build data from the builder app and extract the project domain.
 */
const getProjectDomain = async (buildId) => {
  const url = new URL(`/rest/build/${buildId}`, BUILDER_INTERNAL_URL);
  const response = await fetch(url.href, {
    headers: { Authorization: SERVICE_TOKEN },
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to fetch build ${buildId}: ${text.slice(0, 500)}`);
  }
  const data = await response.json();
  if (!data.projectDomain) {
    throw new Error(`Build ${buildId} has no projectDomain`);
  }
  return data.projectDomain;
};

/**
 * Notify the builder app of the final publish status for a build.
 * Called after the vite build completes (PUBLISHED) or fails (FAILED).
 */
const notifyBuildStatus = async (buildId, publishStatus) => {
  const url = new URL(`/rest/build/${buildId}/status`, BUILDER_INTERNAL_URL);
  try {
    const response = await fetch(url.href, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: SERVICE_TOKEN,
      },
      body: JSON.stringify({ publishStatus }),
    });
    if (!response.ok) {
      const text = await response.text();
      logErr(`notifyBuildStatus(${buildId}, ${publishStatus}) failed: ${text.slice(0, 200)}`);
    } else {
      log(`notifyBuildStatus(${buildId}, ${publishStatus}) OK`);
    }
  } catch (err) {
    logErr(`notifyBuildStatus(${buildId}, ${publishStatus}) error: ${err.message}`);
  }
};

/**
 * Check if a path exists.
 */
const pathExists = async (p) => {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
};

/**
 * Patch generated +data.ts files so vike prerender gets a valid origin.
 *
 * During prerender (build time), pageContext.headers is empty → host="" →
 * url.origin becomes "https://url" (invalid) → loadResources fails silently →
 * no HTML files are generated.
 *
 * We replace the host-detection block with one that falls back to
 * WEBSTUDIO_PRERENDER_ORIGIN (set to BUILDER_INTERNAL_URL when running vite build).
 */
const PRERENDER_PATCH_FROM = [
  `  const host = headers.get("x-forwarded-host") || headers.get("host") || "";`,
  `  url.host = host;`,
  `  url.protocol = "https";`,
].join("\n");

const PRERENDER_PATCH_TO = [
  `  const host = headers.get("x-forwarded-host") || headers.get("host") || "";`,
  `  const prerenderOrigin = process.env.WEBSTUDIO_PRERENDER_ORIGIN;`,
  `  if (host) { url.host = host; url.protocol = "https:"; }`,
  `  else if (prerenderOrigin) { const o = new URL(prerenderOrigin); url.host = o.host; url.protocol = o.protocol; }`,
  `  else { url.protocol = "https:"; }`,
].join("\n");

const patchDataFilesForPrerender = async (dir) => {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      await patchDataFilesForPrerender(fullPath);
    } else if (entry.name === "+data.ts") {
      const content = await readFile(fullPath, "utf8");
      const patched = content.replace(PRERENDER_PATCH_FROM, PRERENDER_PATCH_TO);
      if (patched !== content) {
        await writeFile(fullPath, patched, "utf8");
        log(`  Patched prerender origin in ${fullPath}`);
      }
    }
  }
};

/**
 * Generate static files for the given build and write to /var/publish/<domain>/
 */
const publishBuild = async ({ buildId, builderOrigin }) => {
  log(`Starting publish for build ${buildId}`);

  const domain = await getProjectDomain(buildId);
  log(`Project domain: ${domain}`);

  // Nginx serves from /var/publish/$host — for wstd slugs (no dot), append PUBLISHER_HOST
  // to match the full hostname. Custom domains (contain a dot) are used as-is.
  const publishDomain =
    !domain.includes(".") && PUBLISHER_HOST
      ? `${domain}.${PUBLISHER_HOST}`
      : domain;

  const workDir = join(WORK_DIR, domain);
  await mkdir(workDir, { recursive: true });

  const run = async (cmd) => {
    log(`  $ ${cmd}`);
    const { stdout, stderr } = await execAsync(cmd, { cwd: workDir, maxBuffer: 10 * 1024 * 1024 });
    if (stdout) log(`  stdout: ${stdout.trim()}`);
    if (stderr) log(`  stderr: ${stderr.trim()}`);
  };

  // 1. Sync build data (via URL interne Docker, pas besoin de passer par Traefik/TLS)
  log(`Syncing build data for ${domain}...`);
  await run(
    `webstudio sync --buildId=${buildId} --origin=${BUILDER_INTERNAL_URL} --authToken=${SERVICE_TOKEN}`
  );

  // 2. Generate SSG project code (copies template + generates pages)
  log(`Generating SSG code for ${domain}...`);
  await run(`webstudio build --template ssg`);

  // DIAG: log installed vike version
  try {
    const vikePkg = await readFile(join(workDir, "node_modules", "vike", "package.json"), "utf8");
    log(`  [diag] vike version installed: ${JSON.parse(vikePkg).version}`);
  } catch { log(`  [diag] vike not yet installed (node_modules absent)`); }

  // DIAG: verify vite.config.ts has prerender enabled after webstudio build
  const viteConfigPath = join(workDir, "vite.config.ts");
  if (await pathExists(viteConfigPath)) {
    const viteConfigContent = await readFile(viteConfigPath, "utf8");
    const vikeCall = viteConfigContent.match(/vike\([^)]*\)/)?.[0] ?? "vike plugin not found";
    log(`  [diag] vite.config.ts vike() call: ${vikeCall}`);
  } else {
    log(`  [diag] vite.config.ts NOT FOUND`);
  }

  // 2b. Pin vike to the exact version the SSG template targets.
  // vike 0.4.230+ ignores prerender:true in vite.config.ts (migration warning).
  // vike 0.4.229 honours vike({ prerender: true }) in vite.config.ts reliably.
  // If the installed version doesn't match, delete node_modules and reinstall.
  const TARGET_VIKE = "0.4.229";
  const packageJsonPath = join(workDir, "package.json");
  const nodeModulesPath = join(workDir, "node_modules");

  let needsInstall = !(await pathExists(nodeModulesPath));
  if (!needsInstall) {
    try {
      const vikePkg = JSON.parse(
        await readFile(join(nodeModulesPath, "vike", "package.json"), "utf8")
      );
      if (vikePkg.version !== TARGET_VIKE) {
        log(`  vike ${vikePkg.version} installed but need ${TARGET_VIKE} — reinstalling`);
        await rm(nodeModulesPath, { recursive: true, force: true });
        needsInstall = true;
      }
    } catch {
      needsInstall = true;
    }
  }

  if (needsInstall) {
    // Pin vike in package.json before installing
    const pkg = JSON.parse(await readFile(packageJsonPath, "utf8"));
    if (pkg.dependencies?.vike) {
      pkg.dependencies.vike = TARGET_VIKE;
      await writeFile(packageJsonPath, JSON.stringify(pkg, null, 2) + "\n", "utf8");
      log(`  Pinned vike to ${TARGET_VIKE} in package.json`);
    }
  }

  // 2c. Patch generated +data.ts files so vike prerender uses a valid origin
  log(`Patching generated data files for prerender...`);
  const pagesDir = join(workDir, "pages");
  if (await pathExists(pagesDir)) {
    await patchDataFilesForPrerender(pagesDir);
    // DIAG: list +data.ts files found
    const listDataFiles = async (dir) => {
      const found = [];
      for (const e of await readdir(dir, { withFileTypes: true })) {
        const p = join(dir, e.name);
        if (e.isDirectory()) found.push(...await listDataFiles(p));
        else if (e.name === "+data.ts") found.push(p);
      }
      return found;
    };
    const dataFiles = await listDataFiles(pagesDir);
    log(`  [diag] +data.ts files: ${dataFiles.length > 0 ? dataFiles.map(f => f.replace(workDir, "")).join(", ") : "NONE"}`);
  } else {
    log(`  [diag] pages/ directory NOT FOUND`);
  }

  // 3. Install npm dependencies (first time, or after version pin change)
  if (needsInstall) {
    log(`Installing dependencies for ${domain}...`);
    await run(`npm install`);
  }

  // 4. Build static HTML with Vite
  // WEBSTUDIO_PRERENDER_ORIGIN is read by patched +data.ts files during prerender
  log(`Building static site for ${domain}...`);
  await run(`WEBSTUDIO_PRERENDER_ORIGIN=${BUILDER_INTERNAL_URL} npx vite build`);

  // DIAG: list HTML files in dist/client/ after build
  const distDir = join(workDir, "dist", "client");
  const findHtmlFiles = async (dir) => {
    const found = [];
    try {
      for (const e of await readdir(dir, { withFileTypes: true })) {
        const p = join(dir, e.name);
        if (e.isDirectory()) found.push(...await findHtmlFiles(p));
        else if (e.name.endsWith(".html")) found.push(p);
      }
    } catch { /* dir may not exist */ }
    return found;
  };
  const htmlFiles = await findHtmlFiles(distDir);
  if (htmlFiles.length > 0) {
    log(`  [diag] HTML files generated: ${htmlFiles.map(f => f.replace(distDir, "")).join(", ")}`);
  } else {
    log(`  [diag] NO HTML files in dist/client/ — prerender did not run or failed`);
    // List what IS in dist/client/ for further diagnosis
    await run(`find dist/client -type f | head -30`);
    throw new Error(`Prerender produced no HTML files. Check vite build stdout above for errors.`);
  }

  // 5. Copy built files to the Nginx serve directory
  // Vike (SSG) outputs static HTML to dist/client/, not dist/ directly.
  const destDir = join(PUBLISH_DIR, publishDomain);
  log(`Publishing ${domain} to ${destDir}...`);
  await rm(destDir, { recursive: true, force: true });
  await cp(distDir, destDir, { recursive: true });

  log(`Successfully published ${domain}`);
};

const server = createServer(async (req, res) => {
  if (req.method === "POST" && req.url === "/publish") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", async () => {
      let input;
      try {
        input = JSON.parse(body);
      } catch {
        res.writeHead(400);
        res.end("Invalid JSON");
        return;
      }

      const { buildId, builderOrigin } = input;
      if (!buildId || !builderOrigin) {
        res.writeHead(400);
        res.end("Missing buildId or builderOrigin");
        return;
      }

      // Accept immediately; queue the build in the background
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true }));

      // Get or create a per-domain queue so we don't run parallel vite builds for the same project
      const tempDomainKey = `${builderOrigin}:${buildId}`;
      const q = getProjectQueue(tempDomainKey);
      q.current = q.current
        .then(() => publishBuild({ buildId, builderOrigin }))
        .then(() => notifyBuildStatus(buildId, "PUBLISHED"))
        .catch((err) => {
          logErr(`Publish failed for build ${buildId}: ${err.message}`);
          notifyBuildStatus(buildId, "FAILED").catch((notifyErr) =>
            logErr(`Failed to notify FAILED status for ${buildId}: ${notifyErr.message}`)
          );
        });
    });
    return;
  }

  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200);
    res.end("ok");
    return;
  }

  res.writeHead(404);
  res.end("Not found");
});

server.listen(PORT, () => {
  log(`Publisher service listening on port ${PORT}`);
});
