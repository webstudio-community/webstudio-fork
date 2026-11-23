import type { z } from "zod";
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

// An unknown value (e.g. an older publisher's failedStage) drops that field
// instead of hiding the whole log.
export const parsePublishLog = (
  data: unknown
): z.infer<typeof publishLogOutput> => {
  const result = publishLogOutput.safeParse(data);
  if (result.success) {
    return result.data;
  }
  console.warn(
    `Invalid publish log from publisher: ${result.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ")}`
  );
  if (typeof data !== "object" || data === null) {
    return { availability: "unavailable" };
  }
  const invalidKeys = new Set(
    result.error.issues.map((issue) => String(issue.path[0]))
  );
  const retry = publishLogOutput.safeParse(
    Object.fromEntries(
      Object.entries(data).filter(([key]) => invalidKeys.has(key) === false)
    )
  );
  return retry.success ? retry.data : { availability: "unavailable" };
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
    } catch {}
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

        // Older publishers return no logHandle.
        try {
          const responseBody = (await response.json()) as unknown;
          if (
            typeof responseBody === "object" &&
            responseBody !== null &&
            "logHandle" in responseBody
          ) {
            const logHandle = (responseBody as Record<string, unknown>)
              .logHandle;
            if (typeof logHandle === "string") {
              return { success: true, logHandle };
            }
          }
          return { success: true };
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

        const responseBody = (await response.json()) as unknown;
        if (
          typeof responseBody === "object" &&
          responseBody !== null &&
          "logHandle" in responseBody
        ) {
          const logHandle = (responseBody as Record<string, unknown>).logHandle;
          if (typeof logHandle === "string") {
            return { success: true, logHandle };
          }
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

          const data = (await response.json()) as unknown;
          return parsePublishLog(data);
        } finally {
          clearTimeout(timeoutHandle);
        }
      } catch {
        return { availability: "unavailable" as const };
      }
    }),
});
