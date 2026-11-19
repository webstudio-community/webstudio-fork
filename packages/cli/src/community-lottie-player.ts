// LottiePlayer is pending upstream (webstudio-is/webstudio#5849) and missing from
// the npm sdk-components-react that sites install, so its source ships in the
// site (templates/community-runtime/, kept identical by a test). Drop this
// module, the template copy and its prebuild.ts call once upstream publishes it.
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

export const lottiePlayerComponent = "LottiePlayer";

export const lottiePlayerFile = join("app", "lottie-player.tsx");

// Generated component modules all live in app/__generated__/.
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

// Kept in sync with sdk-components-react by a test.
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
