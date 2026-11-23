// Components that may need SSR. Unlisted components are SSG-compatible.

import type { Props, Resources } from "@webstudio-is/sdk";

export type SsgCompatibility = {
  compatible: boolean | ((ctx: SsgCompatibilityContext) => boolean);
  reason: string;
};

export type SsgCompatibilityContext = {
  instance: { component: string; id: string };
  props: Props;
  resources: Resources;
};

export const ssgCompatibilityRegistry: Record<string, SsgCompatibility> = {
  // Without a resource it falls back to a GET navigation, losing the server mail.
  WebhookForm: {
    compatible: (ctx) => {
      const instance = ctx.instance;
      const actionProp = Array.from(ctx.props.values()).find(
        (prop) =>
          prop.instanceId === instance.id &&
          prop.name === "action" &&
          prop.type === "resource"
      );
      if (
        actionProp &&
        actionProp.type === "resource" &&
        actionProp.value &&
        ctx.resources.has(actionProp.value)
      ) {
        return true;
      }
      return false;
    },
    reason:
      "Webhook Form requires a server endpoint to send emails when no resource is configured. Configure a resource action or switch to SSR mode.",
  },

  // A form action POSTs to a managed endpoint that needs a server; GET navigation
  // (no action) works statically.
  ResourceForm: {
    compatible: (ctx) => {
      const instance = ctx.instance;
      const actionProp = Array.from(ctx.props.values()).find(
        (prop) =>
          prop.instanceId === instance.id &&
          prop.name === "action" &&
          prop.type === "json"
      );
      if (!actionProp || actionProp.type !== "json") {
        return true;
      }
      if (!Array.isArray(actionProp.value)) {
        return true;
      }
      const isValidFormSubmission = actionProp.value.every(
        (a) => typeof a === "object" && a !== null && "dataSourceId" in a
      );
      if (isValidFormSubmission && actionProp.value.length > 0) {
        return false;
      }
      return true;
    },
    reason:
      "Form with resource actions requires a server handler for managed submissions. Use native form submission or switch to SSR mode.",
  },

  LottiePlayer: {
    compatible: true,
    reason: "Animations load client-side; JSON delivered as static asset.",
  },
};

// Returns the reason when the component is incompatible.
export const getSsgIncompatibility = (
  ctx: SsgCompatibilityContext
): string | undefined => {
  const rule = ssgCompatibilityRegistry[ctx.instance.component];

  if (rule === undefined) {
    return undefined;
  }

  const isCompatible =
    typeof rule.compatible === "function"
      ? rule.compatible(ctx)
      : rule.compatible;

  return isCompatible ? undefined : rule.reason;
};
