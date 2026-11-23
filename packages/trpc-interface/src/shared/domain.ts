/**
 * Self-hosting domain router: verifies TXT ownership records with real DNS lookups.
 */
import { resolveTxt } from "node:dns/promises";
import { z } from "zod";
import { router, procedure } from "./trpc";

const createInput = z.object({ domain: z.string(), txtRecord: z.string() });
const input = z.object({ domain: z.string() });

const createOutput = <T extends z.ZodType>(data: T) =>
  z.discriminatedUnion("success", [
    z.object({ success: z.literal(true), data }),
    z.object({ success: z.literal(false), error: z.string() }),
  ]);

declare global {
  // eslint-disable-next-line no-var
  var verifiedDomains: Map<string, boolean>;
}

// Remix purges the require cache in dev.
globalThis.verifiedDomains =
  globalThis.verifiedDomains ?? new Map<string, boolean>();

export const domainRouter = router({
  /**
   * Expects a TXT record at _webstudio-challenge.<domain>.
   */
  create: procedure
    .input(createInput)
    .output(createOutput(z.optional(z.undefined())))
    .mutation(async ({ input }) => {
      const txtHost = `_webstudio_is.${input.domain}`;
      try {
        const records = await resolveTxt(txtHost);
        const flat = records.flat();
        if (flat.includes(input.txtRecord) === false) {
          return {
            success: false,
            error: `TXT record mismatch at ${txtHost}. Expected "${input.txtRecord}" but got: ${flat.join(", ") || "nothing"}`,
          };
        }
        verifiedDomains.set(input.domain, true);
        return { success: true };
      } catch (error) {
        return {
          success: false,
          error: `DNS lookup failed for ${txtHost}: ${error instanceof Error ? error.message : "unknown error"}. Make sure the TXT record has propagated.`,
        };
      }
    }),

  refresh: procedure
    .input(input)
    .output(createOutput(z.optional(z.undefined())))
    .mutation(async () => {
      return { success: true };
    }),
  remove: procedure
    .input(input)
    .output(createOutput(z.optional(z.undefined())))
    .mutation(async ({ input }) => {
      verifiedDomains.delete(input.domain);
      return { success: true };
    }),

  /**
   * Re-checks DNS for domains not in the verified set (e.g. after a restart).
   */
  getStatus: procedure
    .input(input)
    .output(
      createOutput(
        z.discriminatedUnion("status", [
          z.object({ status: z.enum(["active", "pending"]) }),
          z.object({ status: z.enum(["error"]), error: z.string() }),
        ])
      )
    )
    .query(async ({ input }) => {
      if (verifiedDomains.get(input.domain) === true) {
        return {
          success: true,
          data: { status: "active" as const },
        };
      }

      return {
        success: true,
        data: {
          status: "error" as const,
          error: `Domain ${input.domain} has not been verified. Please complete the TXT verification step first.`,
        },
      };
    }),
});
