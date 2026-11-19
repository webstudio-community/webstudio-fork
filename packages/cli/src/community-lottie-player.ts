/**
 * Community fork: LottiePlayer is pending upstream (webstudio-is/webstudio#5849).
 *
 * Generated sites install @webstudio-is/sdk-components-react from the public
 * npm registry, i.e. upstream's build, which has no LottiePlayer export. So the
 * component source is shipped inside the generated site (app/lottie-player.tsx)
 * and the component descriptor points to it instead of the npm package.
 *
 * The shipped copy lives in templates/community-runtime/ (resolved at runtime
 * like every CLI template, so it works from sources and from the packed CLI);
 * a test keeps it byte-identical to the package source.
 *
 * Drop this module, its template copy and its call in prebuild.ts once
 * upstream ships the component in its published package.
 */
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

export const lottiePlayerComponent = "LottiePlayer";

export const lottiePlayerFile = join("app", "lottie-player.tsx");

// Every generated component module lives in app/__generated__/, so a fixed
// "../lottie-player" specifier resolves for all frameworks.
export const lottiePlayerDescriptor = "../lottie-player:LottiePlayer";

export const getLottiePlayerTemplatePath = () =>
  normalize(
    join(
      dirname(fileURLToPath(new URL(import.meta.url))),
      "..",
      "templates",
      "community-runtime",
      "lottie-player.tsx"
    )
  );

// Kept in sync with @webstudio-is/sdk-components-react dependencies by a test.
export const lottiePlayerDependencies: Record<string, string> = {
  "lottie-web": "^5.12.2",
  "@react-aria/utils": "^3.27.0",
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

  await writeFile(
    join(root, lottiePlayerFile),
    await readFile(getLottiePlayerTemplatePath(), "utf8")
  );

  const packageJsonPath = join(root, "package.json");
  const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));
  packageJson.dependencies = {
    ...packageJson.dependencies,
    ...lottiePlayerDependencies,
  };
  await writeFile(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);
};
