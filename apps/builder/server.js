// Replaces remix-serve to enable "trust proxy": behind Traefik, req.protocol
// must be https or the canvas OAuth redirect_uri breaks the token exchange.
import { createRequestHandler } from "@remix-run/express";
import compression from "compression";
import express from "express";
import { pathToFileURL } from "node:url";

// @remix-run/web-fetch creates 204 responses with a non-null body, which undici
// rejects (null body status): null the body for 204/205/304.
const _OriginalResponse = globalThis.Response;
globalThis.Response = class Response extends _OriginalResponse {
  constructor(body, init) {
    super([101, 204, 205, 304].includes(init?.status) ? null : body, init);
  }
};

const BUILD_PATH = "/app/build/server/index.js";

const build = await import(pathToFileURL(BUILD_PATH).href);

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", true);

app.use(compression());

app.use(
  build.publicPath,
  express.static(build.assetsBuildDirectory, { immutable: true, maxAge: "1y" })
);

app.use(express.static("public", { maxAge: "1h" }));

app.get("/health", (_req, res) => res.sendStatus(200));

app.all("*", createRequestHandler({ build, mode: process.env.NODE_ENV }));

const port = parseInt(process.env.PORT || "3000", 10);
app.listen(port, () => {
  console.info(`[server] http://localhost:${port}`);
});
