import semver from "semver";
import { isPlainRecord } from "./type-utils";

const latestPackageUrl = "https://registry.npmjs.org/webstudio/latest";
const requestTimeoutMs = 1_500;

// The self-hosted builder image packs and serves its own CLI, stamped
// `<upstream version>-fork-<commit>` (see scripts/pack-instance-cli.mjs).
// That CLI must stay in lockstep with the instance it came from, so an npm
// `webstudio` release is never an update for it: recommending one would point
// users back to an upstream CLI that the instance's API may reject.
const instanceServedVersionPattern = /-fork-[0-9a-z]+$/;

export const isInstanceServedCliVersion = (version: string) =>
  instanceServedVersionPattern.test(version);

export type CliUpdate = {
  currentVersion: string;
  latestVersion: string;
};

export const checkForCliUpdate = async ({
  currentVersion,
  request = fetch,
}: {
  currentVersion: string;
  request?: typeof fetch;
}): Promise<CliUpdate | undefined> => {
  if (
    currentVersion === "0.0.0-webstudio-version" ||
    isInstanceServedCliVersion(currentVersion) ||
    semver.valid(currentVersion) === null
  ) {
    return;
  }

  try {
    const response = await request(latestPackageUrl, {
      signal: AbortSignal.timeout(requestTimeoutMs),
    });
    if (response.ok === false) {
      return;
    }

    const latestPackage: unknown = await response.json();
    if (isPlainRecord(latestPackage) === false) {
      return;
    }
    const latestVersion =
      typeof latestPackage.version === "string"
        ? semver.valid(latestPackage.version)
        : null;
    if (
      latestVersion === null ||
      semver.gt(latestVersion, currentVersion) === false
    ) {
      return;
    }

    return { currentVersion, latestVersion };
  } catch {
    return;
  }
};
