/**
 * Minimal npm registry serving this instance's own CLI.
 *
 * The self-hosted image packs a CLI built from the same commit as the builder
 * (apps/builder/Dockerfile, stage `cli`; scripts/pack-instance-cli.mjs). Unlike
 * a bare tarball URL — which `npx` installs once and never refreshes — a
 * registry lets `npx` compare `dist-tags.latest` with its cache on every run
 * and fetch the new CLI right after the instance is updated:
 *
 *   npx -y --@webstudio-community:registry=https://<builder>/npm/ \
 *     @webstudio-community/cli mcp
 *
 * Only the CLI's scope is routed here; its third-party deps still come from
 * the public npm registry. Public on purpose: the CLI holds no secrets.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export type InstanceCliMeta = {
  name: string;
  version: string;
  filename: string;
  integrity: string;
  manifest: Record<string, unknown>;
};

export const defaultInstanceCliDirectory = join(process.cwd(), "cli");

const notFound = () =>
  Response.json(
    { error: "Not found" },
    { status: 404, headers: { "Cache-Control": "no-store" } }
  );

const parseMeta = (value: unknown): InstanceCliMeta | undefined => {
  if (typeof value !== "object" || value === null) {
    return;
  }
  const meta = value as Partial<InstanceCliMeta>;
  if (
    typeof meta.name !== "string" ||
    typeof meta.version !== "string" ||
    typeof meta.filename !== "string" ||
    typeof meta.integrity !== "string" ||
    typeof meta.manifest !== "object" ||
    meta.manifest === null
  ) {
    return;
  }
  return meta as InstanceCliMeta;
};

const loadMeta = async (directory: string) => {
  try {
    const content = await readFile(join(directory, "cli-meta.json"), "utf8");
    return parseMeta(JSON.parse(content));
  } catch {
    // No CLI packed into this build (e.g. local dev): the registry is empty.
    return;
  }
};

export const createInstanceCliPackument = ({
  meta,
  registryUrl,
}: {
  meta: InstanceCliMeta;
  registryUrl: string;
}) => ({
  name: meta.name,
  "dist-tags": { latest: meta.version },
  versions: {
    [meta.version]: {
      ...meta.manifest,
      name: meta.name,
      version: meta.version,
      dist: {
        tarball: `${registryUrl}-/${meta.filename}`,
        integrity: meta.integrity,
      },
    },
  },
});

/**
 * Handles `GET /npm/*`:
 * - `/npm/<name>` (scoped name with `/` or `%2f`) → packument
 * - `/npm/-/<filename>` → tarball
 */
export const handleInstanceCliRegistryRequest = async (
  request: Request,
  { directory = defaultInstanceCliDirectory }: { directory?: string } = {}
) => {
  const url = new URL(request.url);
  const prefix = "/npm/";
  if (url.pathname.startsWith(prefix) === false) {
    return notFound();
  }
  const meta = await loadMeta(directory);
  if (meta === undefined) {
    return notFound();
  }

  let path: string;
  try {
    path = decodeURIComponent(url.pathname.slice(prefix.length));
  } catch {
    return notFound();
  }

  if (path === `-/${meta.filename}`) {
    const tarball = await readFile(join(directory, meta.filename));
    // Node's Buffer is typed over ArrayBufferLike, which BodyInit rejects.
    return new Response(new Uint8Array(tarball), {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Length": String(tarball.byteLength),
        // The filename embeds the unique version: its content never changes.
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  }

  if (path === meta.name) {
    const etag = `"${meta.version}"`;
    // Always revalidate so a redeployed instance is picked up on the next run.
    const headers = { ETag: etag, "Cache-Control": "no-cache" };
    if (request.headers.get("If-None-Match") === etag) {
      return new Response(null, { status: 304, headers });
    }
    return Response.json(
      createInstanceCliPackument({
        meta,
        registryUrl: `${url.origin}${prefix}`,
      }),
      { headers }
    );
  }

  return notFound();
};
