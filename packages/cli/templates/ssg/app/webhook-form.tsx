import {
  createContext,
  forwardRef,
  useContext,
  type ComponentProps,
  type ElementRef,
  type FormEvent,
} from "react";
import type { ResourceRequest } from "@webstudio-is/sdk";
import { loadResource } from "@webstudio-is/sdk/runtime";

/**
 * Maps a Webhook Form's `action` prop (the scoped resource name emitted by
 * the CLI, e.g. "action") to its evaluated ResourceRequest (url, method,
 * headers). Provided by the page template — see +Page.tsx — from the
 * `actionResources` bucket of +data.ts.
 *
 * This lives in the generated site rather than in
 * `@webstudio-is/sdk-components-react` because SSG sites install that package
 * from the public npm registry (upstream's build), which ships the plain
 * server-submit <form>. SSG output has no server-side action handler, so the
 * form has to resolve its resource and POST from the browser instead.
 */
export const ActionResourcesContext = createContext<
  Map<string, ResourceRequest>
>(new Map());

type State = "initial" | "success" | "error";

type Props = Omit<ComponentProps<"form">, "action"> & {
  encType?:
    | "application/x-www-form-urlencoded"
    | "multipart/form-data"
    | "text/plain";
  /** Use this property to reveal the Success and Error states on the canvas so they can be styled. The Initial state is displayed when the page first opens. The Success and Error states are displayed depending on whether the Form submits successfully or unsuccessfully. */
  state?: State;
  onStateChange?: (state: State) => void;
  action?: string;
};

export const Form = forwardRef<ElementRef<"form">, Props>(
  (
    { children, action, state = "initial", onStateChange, onSubmit, ...props },
    ref
  ) => {
    const actionResources = useContext(ActionResourcesContext);
    const resource =
      action === undefined ? undefined : actionResources.get(action);

    const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
      onSubmit?.(event);
      // No resource resolved in this environment (e.g. action not configured):
      // fall back to native form submission instead of silently doing nothing.
      if (resource === undefined) {
        return;
      }
      event.preventDefault();
      const formData = new FormData(event.currentTarget);
      const resourceRequest: ResourceRequest = {
        ...resource,
        body: Object.fromEntries(formData),
      };
      loadResource(fetch, resourceRequest).then((result) => {
        onStateChange?.(result.ok ? "success" : "error");
      });
    };

    return (
      <form {...props} data-state={state} onSubmit={handleSubmit} ref={ref}>
        {children}
      </form>
    );
  }
);

Form.displayName = "Form";
