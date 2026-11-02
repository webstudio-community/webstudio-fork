import {
  createContext,
  forwardRef,
  useContext,
  type ComponentProps,
  type ElementRef,
  type FormEvent,
} from "react";
import type { ResourceRequest } from "@webstudio-is/sdk";
import { navigationFormActionUrl } from "@webstudio-is/sdk/form";
import { loadResource } from "@webstudio-is/sdk/runtime";

// Lives in the generated site: SSG sites install upstream's
// sdk-components-react, whose form submits to a server action the static output
// lacks. Resources come from +data.ts `actionResources`.
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
    { children, action, state, onStateChange, onSubmit, ...props },
    ref
  ) => {
    const actionResources = useContext(ActionResourcesContext);
    const resource =
      action === undefined ? undefined : actionResources.get(action);

    const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
      onSubmit?.(event);
      // No resource resolved: fall back to a native submission.
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
      <form
        {...props}
        // No resource: a native GET submission works without JS.
        {...(resource === undefined
          ? { action: navigationFormActionUrl, method: "get" as const }
          : undefined)}
        data-state={state === undefined || state === "initial" ? undefined : state}
        onSubmit={handleSubmit}
        ref={ref}
      >
        {children}
      </form>
    );
  }
);

Form.displayName = "Form";
