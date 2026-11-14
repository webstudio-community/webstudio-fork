import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
  handleInstanceCliRegistryRequest,
  type InstanceCliMeta,
} from "./instance-cli-registry.server";

const meta: InstanceCliMeta = {
  name: "@webstudio-community/cli",
  version: "0.300.0-fork-abc1234",
  filename: "webstudio-community-cli-0.300.0-fork-abc1234.tgz",
  integrity: "sha512-test",
  manifest: {
    name: "@webstudio-community/cli",
    version: "0.300.0-fork-abc1234",
    bin: { webstudio: "./bin.js" },
    dependencies: { yargs: "^17.7.2" },
  },
};

const origin = "https://builder.example.com";

let directory: string;

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "instance-cli-registry-"));
});

afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
});

const writeCli = () => {
  writeFileSync(join(directory, "cli-meta.json"), JSON.stringify(meta));
  writeFileSync(join(directory, meta.filename), "tarball-bytes");
};

const request = (path: string, headers?: HeadersInit) =>
  handleInstanceCliRegistryRequest(
    new Request(`${origin}${path}`, { headers }),
    { directory }
  );

describe("instance CLI registry", () => {
  test.each([
    "/npm/@webstudio-community%2fcli",
    "/npm/@webstudio-community/cli",
  ])("serves the packument at %s", async (path) => {
    writeCli();
    const response = await request(path);

    expect(response.status).toBe(200);
    expect(response.headers.get("ETag")).toBe(`"${meta.version}"`);
    expect(response.headers.get("Cache-Control")).toBe("no-cache");
    expect(await response.json()).toEqual({
      name: meta.name,
      "dist-tags": { latest: meta.version },
      versions: {
        [meta.version]: {
          ...meta.manifest,
          dist: {
            tarball: `${origin}/npm/-/${meta.filename}`,
            integrity: meta.integrity,
          },
        },
      },
    });
  });

  test("answers 304 while the instance has not been updated", async () => {
    writeCli();
    const response = await request("/npm/@webstudio-community%2fcli", {
      "If-None-Match": `"${meta.version}"`,
    });

    expect(response.status).toBe(304);
  });

  test("serves the tarball as an immutable file", async () => {
    writeCli();
    const response = await request(`/npm/-/${meta.filename}`);

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toContain("immutable");
    expect(await response.text()).toBe("tarball-bytes");
  });

  test.each([
    "/npm/webstudio",
    "/npm/-/other.tgz",
    "/npm/-/..%2fcli-meta.json",
    "/npm/%E0%A4%A",
  ])("returns 404 for %s", async (path) => {
    writeCli();
    const response = await request(path);

    expect(response.status).toBe(404);
  });

  test("returns 404 when no CLI is packed into the build", async () => {
    const response = await request("/npm/@webstudio-community%2fcli");

    expect(response.status).toBe(404);
  });
});
