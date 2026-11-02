import { router, procedure } from "./trpc";
import {
  publishInput,
  unpublishInput,
  output,
  publishLogInput,
  publishLogOutput,
} from "./deployment-contract";

/**
 * Forwards publishes to SELF_HOSTED_PUBLISHER_URL when set; otherwise publish
 * returns NOT_IMPLEMENTED and the CLI instructions are shown.
 **/
export type PublisherCapabilities = {
  cloudflare: boolean;
  coolify: boolean;
  ssh: boolean;
  // Empty from publishers that predate it: fall back to `cloudflare`.
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
  getPublishLog: procedure
    .input(publishLogInput)
    .output(publishLogOutput)
    .query(() => ({ availability: "unavailable" as const })),
});
