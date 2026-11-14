// A self-hosted builder image packs and serves its own CLI as a minimal npm
// registry at `<builder>/npm/`, stamped `<upstream version>-fork-<commit>`
// (see scripts/pack-instance-cli.mjs). That CLI must stay in lockstep with the
// instance it came from: the npm `webstudio` CLI follows upstream and its API
// contract drifts from the instance, which then rejects MCP writes.
const instanceServedVersionPattern = /-fork-[0-9a-z]+$/;

export const instanceCliScope = "@webstudio-community";
export const instanceCliPackage = `${instanceCliScope}/cli`;

export const isInstanceServedCliVersion = (version: string) =>
  instanceServedVersionPattern.test(version);

/**
 * MCP server command that keeps running the CLI of the instance at `origin`.
 * Only the scope is routed to the instance; `npx` re-checks its registry on
 * every start, so a redeployed instance is picked up automatically.
 */
export const getInstanceCliServerCommand = (origin: string) =>
  `npx -y --${instanceCliScope}:registry=${new URL("/npm/", origin).href} ${instanceCliPackage} mcp`;
