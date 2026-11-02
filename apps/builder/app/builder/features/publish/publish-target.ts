/**
 * Self-hosting publish target — two orthogonal axes, mirrored by the publisher
 * service and by the `deployment` schema in `@webstudio-is/sdk`:
 *   renderMode — what to build
 *   host       — where it is served
 */

export type RenderMode = "ssg" | "ssr";
export type PublishHost = "local" | "cloudflare" | "coolify" | "ssh";

export type PublisherCapabilities = {
  cloudflare: boolean;
  coolify: boolean;
  ssh: boolean;
  /**
   * `${renderMode}:${host}` pairs the publisher can run right now, e.g.
   * `["ssg:local", "ssr:local", "ssg:cloudflare"]`. Empty from a publisher that
   * predates the field — callers then fall back to the `cloudflare` flag.
   */
  targets: string[];
};

export const publishHosts = ["local", "cloudflare", "coolify", "ssh"] as const;

export const publishHostLabels: Record<PublishHost, string> = {
  local: "This Webstudio instance",
  cloudflare: "Cloudflare Pages",
  coolify: "Coolify (remote)",
  ssh: "Remote server (SSH)",
};

export const publishHostDescriptions: Record<PublishHost, string> = {
  local: "Served by this self-hosted instance",
  cloudflare: "Deploy to the Cloudflare edge",
  coolify: "Deploy as a Coolify application",
  ssh: "Copy static files to a remote server over SSH",
};

/**
 * Whether the publisher can run this `renderMode × host` pair right now.
 * Prefers the publisher's own `targets` list; falls back to the pre-`targets`
 * contract (local always, cloudflare only for SSG when configured).
 */
export const isPublishTargetAvailable = (
  capabilities: PublisherCapabilities | undefined,
  renderMode: RenderMode,
  host: PublishHost
) => {
  if (capabilities?.targets != null && capabilities.targets.length > 0) {
    return capabilities.targets.includes(`${renderMode}:${host}`);
  }
  if (host === "local") {
    return true;
  }
  if (host === "cloudflare") {
    return renderMode === "ssg" && capabilities?.cloudflare === true;
  }
  return false;
};

export const publishHostUnavailableReason = (
  capabilities: PublisherCapabilities | undefined,
  renderMode: RenderMode,
  host: PublishHost
): string | undefined => {
  if (isPublishTargetAvailable(capabilities, renderMode, host)) {
    return undefined;
  }
  if (host === "coolify" || host === "ssh") {
    return "Coming soon";
  }
  if (host === "cloudflare") {
    return renderMode === "ssr"
      ? "Cloudflare Pages only hosts static (SSG) sites"
      : "Set CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID on the publisher to enable";
  }
  return "Not available on this publisher";
};
