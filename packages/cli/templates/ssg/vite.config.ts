import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import vike from "vike/plugin";
import { sitemapPlugin } from "./app/route-templates/sitemap-plugin";

const sourceConditions =
  process.env.WEBSTUDIO_LOCAL_CLI_BOOTSTRAPPED === "1" ? ["webstudio"] : [];

export default defineConfig({
  plugins: [react(), vike(), sitemapPlugin()],
  resolve: {
    conditions: [...sourceConditions, "browser", "development|production"],
  },
  ssr: {
    resolve: {
      conditions: [...sourceConditions, "node", "development|production"],
    },
  },
});
