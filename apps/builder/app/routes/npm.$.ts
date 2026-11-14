import type { LoaderFunctionArgs } from "@remix-run/server-runtime";
import { handleInstanceCliRegistryRequest } from "~/services/instance-cli-registry.server";

// Public npm registry serving this instance's own CLI (MCP clients).
export const loader = ({ request }: LoaderFunctionArgs) =>
  handleInstanceCliRegistryRequest(request);
