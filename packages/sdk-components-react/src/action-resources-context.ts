import { createContext } from "react";
import type { ResourceRequest } from "@webstudio-is/sdk";

/**
 * Maps action resource names (e.g. Webhook Form's "action" prop) to their
 * evaluated ResourceRequest (url, method, headers, ...). Populated by the
 * SSG template so client-only builds can resolve and fetch the resource
 * without a server-side action handler.
 */
export const ActionResourcesContext = createContext<
  Map<string, ResourceRequest>
>(new Map());
