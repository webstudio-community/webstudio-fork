// A self-hosted builder serves its own CLI at `<builder>/npm/`, versioned
// `<upstream version>-fork-<commit>`. The npm `webstudio` CLI follows upstream,
// whose API contract the instance rejects.
const instanceServedVersionPattern = /-fork-[0-9a-z]+$/;

export const instanceCliScope = "@webstudio-community";
export const instanceCliPackage = `${instanceCliScope}/cli`;

export const isInstanceServedCliVersion = (version: string) =>
  instanceServedVersionPattern.test(version);

// npx re-checks the registry on every start, so a redeployed instance is picked up.
export const getInstanceCliServerCommand = (origin: string) =>
  `npx -y --${instanceCliScope}:registry=${new URL("/npm/", origin).href} ${instanceCliPackage} mcp`;
