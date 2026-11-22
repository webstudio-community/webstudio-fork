/**
 * SSG (Static Site Generation) compatibility registry for Webstudio components.
 * Components absent from this registry are considered compatible (true) by default.
 * Each entry documents why a component may require SSR mode.
 */

import type { Instances, Props, Resources } from "@webstudio-is/sdk";

export type SsgCompatibility = {
  /**
   * Whether the component is compatible with SSG mode.
   * - `boolean`: always compatible (true) or incompatible (false)
   * - Function: conditional based on instance props
   */
  compatible: boolean | ((ctx: SsgCompatibilityContext) => boolean);
  /** Explanation shown to users when incompatible with SSG mode */
  reason: string;
};

export type SsgCompatibilityContext = {
  instance: { component: string; id: string };
  props: Props;
  resources: Resources;
};

/**
 * Registry of components with SSG compatibility conditions.
 * Notable compatible components are listed for documentation.
 * Unlisted components are compatible by default.
 */
export const ssgCompatibilityRegistry: Record<string, SsgCompatibility> = {
  /**
   * WebhookForm is compatible with SSG when it has a resource configured.
   * Without a resource, it falls back to native GET navigation in SSG template.
   * With a resource, client-side POST submission works in SSG.
   */
  WebhookForm: {
    compatible: (ctx) => {
      const instance = ctx.instance;
      // Find the "action" prop for this WebhookForm instance
      const actionProp = Array.from(ctx.props.values()).find(
        (prop) =>
          prop.instanceId === instance.id &&
          prop.name === "action" &&
          prop.type === "resource"
      );
      // If action prop exists and has a valid resource ID, it's compatible
      if (
        actionProp &&
        actionProp.type === "resource" &&
        actionProp.value &&
        ctx.resources.has(actionProp.value)
      ) {
        return true;
      }
      // Without resource, falls back to GET in SSG template → false (server mail feature unavailable)
      return false;
    },
    reason:
      "Webhook Form requires a server endpoint to send emails when no resource is configured. Configure a resource action or switch to SSR mode.",
  },

  /**
   * ResourceForm (Form Beta) is compatible with SSG only when it uses
   * native GET navigation (no action configured). With form actions,
   * it submits via POST to a managed form endpoint that requires a server.
   * See packages/sdk/src/form/browser-client.ts:~140-150 for POST behavior.
   */
  ResourceForm: {
    compatible: (ctx) => {
      const instance = ctx.instance;
      // Find the "action" prop for this ResourceForm instance
      const actionProp = Array.from(ctx.props.values()).find(
        (prop) =>
          prop.instanceId === instance.id &&
          prop.name === "action" &&
          prop.type === "json"
      );
      // No action or empty action array → GET navigation mode → SSG-compatible
      if (!actionProp || actionProp.type !== "json") {
        return true;
      }
      // Check if the action is a valid FormSubmission (array of FormAction)
      const isValidFormSubmission =
        Array.isArray(actionProp.value) &&
        actionProp.value.every(
          (a) => typeof a === "object" && a !== null && "dataSourceId" in a
        );
      // If action is a valid non-empty FormSubmission, it requires a server handler
      if (isValidFormSubmission && actionProp.value.length > 0) {
        return false;
      }
      // Otherwise (undefined, null, empty array) → GET navigation → compatible
      return true;
    },
    reason:
      "Form with resource actions requires a server handler for managed submissions. Use native form submission or switch to SSR mode.",
  },

  /**
   * LottiePlayer is compatible with SSG.
   * Animations are loaded client-side via fetch; JSON is included as a static asset.
   */
  LottiePlayer: {
    compatible: true,
    reason: "Animations load client-side; JSON delivered as static asset.",
  },

  // Notable compatible components (documented for clarity, all true by default):
  // - Form (deprecated): same as ResourceForm
  // - All other sdk-components-react (Button, Input, Image, Video, etc.)
  // - All sdk-components-react-radix components (Accordion, Dialog, etc.)
  // - All sdk-components-animation (animation components, see self-host#29)
};

/**
 * Check if a component is compatible with SSG mode.
 * Returns undefined if compatible, or a reason string if incompatible.
 */
export const getSsgIncompatibility = (
  ctx: SsgCompatibilityContext
): string | undefined => {
  const rule = ssgCompatibilityRegistry[ctx.instance.component];

  if (rule === undefined) {
    // Not in registry → compatible by default
    return undefined;
  }

  const isCompatible =
    typeof rule.compatible === "function"
      ? rule.compatible(ctx)
      : rule.compatible;

  return isCompatible ? undefined : rule.reason;
};
