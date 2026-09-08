import { z } from "zod";

export const templates = z.enum([
  "docker",
  "vercel",
  "netlify",
  "ssg",
  "ssg-netlify",
  "ssg-vercel",
]);

export type Templates = z.infer<typeof templates>;

export const deployment = z.union([
  z.object({
    destination: z.literal("static"),
    name: z.string(),
    assetsDomain: z.string(),
    // Must be validated very strictly
    templates: z.array(templates),
  }),
  z.object({
    destination: z.literal("saas").optional(),
    target: z.enum(["staging", "production"]).optional(),
    domains: z.array(z.string()),
    assetsDomain: z.string().optional(),
    /**
     * @deprecated This field is deprecated, use `domains` instead.
     */
    projectDomain: z.string().optional(),
    excludeWstdDomainFromSearch: z.boolean().optional(),
    // Self-hosting only, two orthogonal axes describing how this deployment was
    // published. Recorded so the Publish dialog can warn when republishing to a
    // different host — a domain's DNS record targets the old host and may need
    // updating. `renderMode` alone never changes DNS, so the warning keys on
    // `host`.
    //   renderMode — "ssg" (static) | "ssr" (Node server)
    //   host       — "local" (this self-host instance) | "cloudflare" | "coolify" | "ssh"
    renderMode: z.enum(["ssg", "ssr"]).optional(),
    host: z.enum(["local", "cloudflare", "coolify", "ssh"]).optional(),
  }),
]);

export type Deployment = z.infer<typeof deployment>;
