import { expect, test } from "vitest";
import {
  getInstanceCliServerCommand,
  isInstanceServedCliVersion,
} from "./instance-cli";

test("recognizes instance-served CLI versions", () => {
  expect(isInstanceServedCliVersion("0.300.0-fork-abc1234")).toBe(true);
  expect(isInstanceServedCliVersion("0.300.0-fork-local20261114203000")).toBe(
    true
  );
  expect(isInstanceServedCliVersion("0.300.0")).toBe(false);
  expect(isInstanceServedCliVersion("0.300.0-beta.1")).toBe(false);
});

test("starts MCP from the instance registry", () => {
  expect(getInstanceCliServerCommand("https://builder.example.com")).toBe(
    "npx -y --@webstudio-community:registry=https://builder.example.com/npm/ @webstudio-community/cli mcp"
  );
});
