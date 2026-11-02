import type { Plugin } from "vite";
import { sitemap } from "__SITEMAP__";

// Sitemaps need absolute <loc> URLs under the serving host, which a prerender
// can't know: the origin comes from WEBSTUDIO_SITEMAP_ORIGIN (a host may pass
// an internal origin and rewrite it per domain). Unset → no sitemap, since
// search engines ignore relative or wrong origins.

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
      // Only the client build is served.
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
