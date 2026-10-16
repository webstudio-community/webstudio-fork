import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, expect, test } from "vitest";
import { formBotFieldName } from "@webstudio-is/sdk/runtime";
import { WebhookForm } from "./webhook-form";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = undefined;
  document.body.innerHTML = "";
});

const render = async (children: React.ReactNode) => {
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);

  await act(async () => {
    root?.render(children);
  });
};

const getBotInputs = (form: HTMLFormElement) =>
  form.querySelectorAll<HTMLInputElement>(`input[name="${formBotFieldName}"]`);

test("keeps a single bot field and refreshes it on every submit", async () => {
  const router = createMemoryRouter([
    {
      path: "/",
      action: async () => ({ success: true }),
      element: (
        <WebhookForm action="action">
          <input name="email" defaultValue="a@b.co" />
          <button>Submit</button>
        </WebhookForm>
      ),
    },
  ]);

  await render(<RouterProvider router={router} />);

  const form = document.querySelector("form") as HTMLFormElement;
  expect(getBotInputs(form).length).toBe(0);

  await act(async () => {
    form.requestSubmit();
  });
  expect(getBotInputs(form).length).toBe(1);

  // A stale value left behind by a previous submit is what the server reads
  // first and rejects after 5 minutes; the next submit must overwrite it.
  const [botInput] = getBotInputs(form);
  botInput.value = "stale";

  await act(async () => {
    form.requestSubmit();
  });
  const botInputs = getBotInputs(form);
  expect(botInputs.length).toBe(1);
  expect(botInputs[0]).toBe(botInput);
  expect(botInputs[0].value).not.toBe("stale");
});
