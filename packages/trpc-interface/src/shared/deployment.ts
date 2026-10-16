import { z } from "zod";
import { router, procedure } from "./trpc";

// Has corresponding type in saas
export const publishInput = z.object({
  // used to load build data from the builder with build.loadProjectBundleByBuildId
  buildId: z.string(),
  builderOrigin: z.string(),
  githubSha: z.string().optional(),

  destination: z.enum(["saas", "static"]),
  // Self-hosting publish target, two orthogonal axes forwarded to the publisher:
  //   renderMode — "ssg" (static, default) | "ssr" (Node server)
  //   host       — "local" (default) | "cloudflare" | "coolify" | "ssh"
  renderMode: z.enum(["ssg", "ssr"]).default("ssg"),
  host: z.enum(["local", "cloudflare", "coolify", "ssh"]).default("local"),
  // host: "coolify" only — the target app's deploy webhook (per site, not stored)
  coolifyWebhookUrl: z.string().optional(),
  coolifyWebhookToken: z.string().optional(),
  // preview support
  branchName: z.string(),
  // action log helper (not used for deployment, but for action logs readablity)
  logProjectName: z.string(),
});

export const unpublishInput = z.object({
  domain: z.string(),
});

export const output = z.discriminatedUnion("success", [
  z.object({
    success: z.literal(true),
  }),
  z.object({
    success: z.literal(false),
    error: z.string(),
  }),
]);

/**
 * Self-hosting deployment router.
 *
 * When SELF_HOSTED_PUBLISHER_URL is set (e.g., http://publisher:4000), publish
 * requests are forwarded to that service which runs `webstudio sync + build`
 * and writes static files to the shared Nginx volume.
 *
 * When not set, publish returns NOT_IMPLEMENTED and the user is shown the CLI instructions.
 **/
export type PublisherCapabilities = {
  cloudflare: boolean;
  coolify: boolean;
  ssh: boolean;
  // `${renderMode}:${host}` pairs the publisher can run right now, e.g.
  // ["ssg:local", "ssr:local", "ssg:cloudflare"]. Empty from an older publisher
  // that predates the field — the builder then falls back to `cloudflare`.
  targets: string[];
};

const noCapabilities: PublisherCapabilities = {
  cloudflare: false,
  coolify: false,
  ssh: false,
  targets: [],
};

export const deploymentRouter = router({
  capabilities: procedure.query(async (): Promise<PublisherCapabilities> => {
    const publisherUrl = process.env.SELF_HOSTED_PUBLISHER_URL;
    if (publisherUrl === undefined) {
      return noCapabilities;
    }
    try {
      const response = await fetch(`${publisherUrl}/capabilities`);
      if (response.ok) {
        const data = (await response.json()) as Partial<PublisherCapabilities>;
        return {
          cloudflare: data.cloudflare ?? false,
          coolify: data.coolify ?? false,
          ssh: data.ssh ?? false,
          targets: data.targets ?? [],
        };
      }
    } catch {
      // publisher unreachable
    }
    return noCapabilities;
  }),

  publish: procedure
    .input(publishInput)
    .output(output)
    .mutation(async ({ input }) => {
      const publisherUrl = process.env.SELF_HOSTED_PUBLISHER_URL;

      if (publisherUrl === undefined) {
        return {
          success: false,
          error: "NOT_IMPLEMENTED",
        };
      }

      try {
        const response = await fetch(`${publisherUrl}/publish`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            buildId: input.buildId,
            builderOrigin: input.builderOrigin,
            renderMode: input.renderMode,
            host: input.host,
            coolifyWebhookUrl: input.coolifyWebhookUrl,
            coolifyWebhookToken: input.coolifyWebhookToken,
            destination: input.destination,
          }),
        });

        if (response.ok === false) {
          const message = await response.text();
          return {
            success: false,
            error: `Publisher error: ${message.slice(0, 500)}`,
          };
        }

        return { success: true };
      } catch (error) {
        return {
          success: false,
          error: `Failed to reach publisher service: ${error instanceof Error ? error.message : "unknown error"}`,
        };
      }
    }),
  unpublish: procedure
    .input(unpublishInput)
    .output(output)
    .mutation(async ({ input }) => {
      const publisherUrl = process.env.SELF_HOSTED_PUBLISHER_URL;

      if (publisherUrl === undefined) {
        return {
          success: false,
          error: "NOT_IMPLEMENTED",
        };
      }

      try {
        const response = await fetch(`${publisherUrl}/unpublish`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ domain: input.domain }),
        });

        if (response.ok === false) {
          const message = await response.text();
          return {
            success: false,
            error: `Publisher error: ${message.slice(0, 500)}`,
          };
        }

        return { success: true };
      } catch (error) {
        return {
          success: false,
          error: `Failed to reach publisher service: ${error instanceof Error ? error.message : "unknown error"}`,
        };
      }
    }),
});
