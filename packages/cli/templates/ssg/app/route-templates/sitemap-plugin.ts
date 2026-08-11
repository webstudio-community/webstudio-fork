import type { Plugin } from "vite";
import { sitemap } from "__SITEMAP__";

/**
 * Emits sitemap.xml into the client build output.
 *
 * The sitemaps protocol requires absolute <loc> URLs, and requires them to sit
 * under the location the sitemap itself is served from. A prerendered build has
 * no request to derive that host from, so the origin has to be supplied at
 * build time via WEBSTUDIO_SITEMAP_ORIGIN.
 *
 * Hosts that already rewrite absolute URLs after the build can point this at
 * their internal origin and rewrite it per domain afterwards, which is how a
 * single build serves several domains with a correct sitemap in each copy.
 * When the variable is unset the sitemap is skipped rather than emitted with a
 * wrong or relative origin, because search engines ignore both.
 */

const escapeXml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");

const renderSitemap = (origin: string) => {
  const urls = sitemap.map((page: { path: string; lastModified: string }) => {
    const loc = escapeXml(new URL(page.path, origin).href);
    const lastmod = page.lastModified.split("T")[0];
    return `  <url>\n    <loc>${loc}</loc>\n    <lastmod>${lastmod}</lastmod>\n  </url>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`;
};

export const sitemapPlugin = (): Plugin => {
  let isSsrBuild = false;

  return {
    name: "webstudio:sitemap",
    apply: "build",

    configResolved(config) {
      // vike runs a client build and an SSR build; only the client build is
      // copied to the serve directory, so emit there once.
      isSsrBuild = Boolean(config.build.ssr);
    },

    generateBundle() {
      if (isSsrBuild) {
        return;
      }
      const origin = process.env.WEBSTUDIO_SITEMAP_ORIGIN;
      if (origin === undefined || origin === "") {
        console.warn(
          "[webstudio] WEBSTUDIO_SITEMAP_ORIGIN is not set, skipping sitemap.xml"
        );
        return;
      }
      this.emitFile({
        type: "asset",
        fileName: "sitemap.xml",
        source: renderSitemap(origin),
      });
    },
  };
};
