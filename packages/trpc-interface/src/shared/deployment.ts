import { router, procedure } from "./trpc";
import {
  publishInput,
  unpublishInput,
  output,
  publishLogInput,
  publishLogOutput,
} from "./deployment-contract";

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

        // Tolerate older publishers that don't return logHandle
        try {
          const responseBody = (await response.json()) as {
            logHandle?: string;
          };
          return { success: true, logHandle: responseBody.logHandle };
        } catch {
          return { success: true };
        }
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

        const responseBody = await response.json();
        return { success: true, logHandle: responseBody.logHandle };
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
    .query(async ({ input }) => {
      const publisherUrl = process.env.SELF_HOSTED_PUBLISHER_URL;

      if (publisherUrl === undefined) {
        return { availability: "unavailable" as const };
      }

      try {
        const url = new URL(
          `${publisherUrl}/logs/${encodeURIComponent(input.buildId)}`
        );
        if (input.cursor !== undefined) {
          url.searchParams.set("cursor", String(input.cursor));
        }
        if (input.includeLog === true) {
          url.searchParams.set("includeLog", "true");
        }

        const controller = new AbortController();
        const timeoutHandle = setTimeout(() => controller.abort(), 10000); // 10s timeout

        try {
          const response = await fetch(url.toString(), {
            signal: controller.signal,
            headers: {
              Authorization: `Bearer ${process.env.TRPC_SERVER_API_TOKEN ?? ""}`,
            },
          });

          if (!response.ok) {
            return { availability: "unavailable" as const };
          }

          const data = await response.json();
          return publishLogOutput.parse(data);
        } finally {
          clearTimeout(timeoutHandle);
        }
      } catch {
        return { availability: "unavailable" as const };
      }
    }),
});
