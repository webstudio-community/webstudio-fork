/**
 * Community fork: LottiePlayer is pending upstream (webstudio-is/webstudio#5849).
 *
 * Generated sites install @webstudio-is/sdk-components-react from the public
 * npm registry, i.e. upstream's build, which has no LottiePlayer export. So the
 * component source is shipped inside the generated site (app/lottie-player.tsx)
 * and the component descriptor points to it instead of the npm package.
 *
 * Drop this module (and its call in prebuild.ts) once upstream ships the
 * component in its published package.
 */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import lottiePlayerSource from "../../sdk-components-react/src/lottie-player.tsx?raw";
import sdkComponentsReactPackage from "../../sdk-components-react/package.json";

export const lottiePlayerComponent = "LottiePlayer";

export const lottiePlayerFile = join("app", "lottie-player.tsx");

// Every generated component module lives in app/__generated__/, so a fixed
// "../lottie-player" specifier resolves for all frameworks.
export const lottiePlayerDescriptor = "../lottie-player:LottiePlayer";

const runtimeDependencies = ["lottie-web", "@react-aria/utils"] as const;

export const getLottiePlayerDependencies = () => {
  const dependencies: Record<string, string> =
    sdkComponentsReactPackage.dependencies;
  return Object.fromEntries(
    runtimeDependencies.map((name) => {
      const version = dependencies[name];
      if (version === undefined) {
        throw new Error(
          `${name} is missing from @webstudio-is/sdk-components-react dependencies`
        );
      }
      return [name, version];
    })
  );
};

export const shipLottiePlayer = async ({
  root,
  components,
  instances,
}: {
  root: string;
  components: Record<string, string>;
  instances: Iterable<{ component: string }>;
}) => {
  if (components[lottiePlayerComponent] === undefined) {
    return;
  }
  components[lottiePlayerComponent] = lottiePlayerDescriptor;

  let isUsed = false;
  for (const instance of instances) {
    if (instance.component === lottiePlayerComponent) {
      isUsed = true;
      break;
    }
  }
  if (isUsed === false) {
    return;
  }

  await writeFile(join(root, lottiePlayerFile), lottiePlayerSource);

  const packageJsonPath = join(root, "package.json");
  const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));
  packageJson.dependencies = {
    ...packageJson.dependencies,
    ...getLottiePlayerDependencies(),
  };
  await writeFile(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);
};
