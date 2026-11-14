// Minimal npm registry serving the CLI built from this instance's commit.
// Unlike a tarball URL, npx re-checks dist-tags.latest on every run, so an
// update is picked up at once. Public: the CLI holds no secrets.
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
    // No CLI packed in this build (e.g. local dev).
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

// `/npm/<name>` → packument, `/npm/-/<filename>` → tarball
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
    return new Response(new Uint8Array(tarball), {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Length": String(tarball.byteLength),
        // The filename embeds the version, so the content never changes.
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  }

  if (path === meta.name) {
    const etag = `"${meta.version}"`;
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
