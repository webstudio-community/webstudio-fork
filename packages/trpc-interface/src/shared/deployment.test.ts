import { describe, expect, test, beforeEach, vi, afterEach } from "vitest";
import { strict as assert } from "node:assert";

describe("deployment log retrieval", () => {
  beforeEach(() => {
    // Mock fetch for all tests
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("getPublishLog returns unavailable when SELF_HOSTED_PUBLISHER_URL is not set", async () => {
    delete process.env.SELF_HOSTED_PUBLISHER_URL;
    const { deploymentRouter } = await import("./deployment");
    const caller = deploymentRouter.createCaller({} as unknown);

    const result = await caller.getPublishLog({
      buildId: "test-build-id",
      logHandle: "test-build-id",
    });

    expect(result).toEqual({ availability: "unavailable" });
  });

  test("getPublishLog maps pending response from publisher", async () => {
    process.env.SELF_HOSTED_PUBLISHER_URL = "http://publisher:4000";
    process.env.TRPC_SERVER_API_TOKEN = "test-token";

    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ availability: "pending" }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const { deploymentRouter } = await import("./deployment");
    const caller = deploymentRouter.createCaller({} as unknown);

    const result = await caller.getPublishLog({
      buildId: "test-build-id",
      logHandle: "test-build-id",
    });

    expect(result).toEqual({ availability: "pending" });
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/logs/test-build-id"),
      expect.objectContaining({
        headers: { Authorization: "Bearer test-token" },
      })
    );
  });

  test("getPublishLog maps available succeeded response with log", async () => {
    process.env.SELF_HOSTED_PUBLISHER_URL = "http://publisher:4000";
    process.env.TRPC_SERVER_API_TOKEN = "test-token";

    const logContent = Buffer.from(
      "[12:34:56] [sync] Syncing build data"
    ).toString("base64url");
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        availability: "available",
        outcome: "succeeded",
        logAvailability: "available",
        startedAt: "2026-01-01T12:00:00Z",
        completedAt: "2026-01-01T12:05:00Z",
        log: {
          encoding: "base64url",
          chunk: logContent,
          complete: true,
        },
      }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const { deploymentRouter } = await import("./deployment");
    const caller = deploymentRouter.createCaller({} as unknown);

    const result = await caller.getPublishLog({
      buildId: "test-build-id",
      logHandle: "test-build-id",
    });

    expect(result.availability).toBe("available");
    assert(result.availability === "available");
    expect(result.outcome).toBe("succeeded");
    expect(result.log?.chunk).toBe(logContent);
    expect(result.log?.complete).toBe(true);
  });

  test("getPublishLog maps available failed response with failedStage", async () => {
    process.env.SELF_HOSTED_PUBLISHER_URL = "http://publisher:4000";
    process.env.TRPC_SERVER_API_TOKEN = "test-token";

    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        availability: "available",
        outcome: "failed",
        logAvailability: "available",
        startedAt: "2026-01-01T12:00:00Z",
        completedAt: "2026-01-01T12:05:00Z",
        failedStage: "deploy",
      }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const { deploymentRouter } = await import("./deployment");
    const caller = deploymentRouter.createCaller({} as unknown);

    const result = await caller.getPublishLog({
      buildId: "test-build-id",
      logHandle: "test-build-id",
    });

    expect(result.availability).toBe("available");
    assert(result.availability === "available");
    expect(result.outcome).toBe("failed");
    expect(result.failedStage).toBe("deploy");
  });

  test("getPublishLog returns unavailable on HTTP error", async () => {
    process.env.SELF_HOSTED_PUBLISHER_URL = "http://publisher:4000";
    process.env.TRPC_SERVER_API_TOKEN = "test-token";

    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 404,
    });
    vi.stubGlobal("fetch", mockFetch);

    const { deploymentRouter } = await import("./deployment");
    const caller = deploymentRouter.createCaller({} as unknown);

    const result = await caller.getPublishLog({
      buildId: "test-build-id",
      logHandle: "test-build-id",
    });

    expect(result).toEqual({ availability: "unavailable" });
  });

  test("getPublishLog returns unavailable on network error", async () => {
    process.env.SELF_HOSTED_PUBLISHER_URL = "http://publisher:4000";
    process.env.TRPC_SERVER_API_TOKEN = "test-token";

    const mockFetch = vi.fn().mockRejectedValueOnce(new Error("Network error"));
    vi.stubGlobal("fetch", mockFetch);

    const { deploymentRouter } = await import("./deployment");
    const caller = deploymentRouter.createCaller({} as unknown);

    const result = await caller.getPublishLog({
      buildId: "test-build-id",
      logHandle: "test-build-id",
    });

    expect(result).toEqual({ availability: "unavailable" });
  });

  test("getPublishLog passes cursor parameter to publisher", async () => {
    process.env.SELF_HOSTED_PUBLISHER_URL = "http://publisher:4000";
    process.env.TRPC_SERVER_API_TOKEN = "test-token";

    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        availability: "available",
        outcome: "succeeded",
        logAvailability: "available",
        log: {
          encoding: "base64url",
          chunk: "...",
          complete: false,
          nextCursor: 300000,
        },
      }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const { deploymentRouter } = await import("./deployment");
    const caller = deploymentRouter.createCaller({} as unknown);

    await caller.getPublishLog({
      buildId: "test-build-id",
      logHandle: "test-build-id",
      cursor: 300000,
    });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("cursor=300000"),
      expect.any(Object)
    );
  });

  test("getPublishLog respects includeLog parameter", async () => {
    process.env.SELF_HOSTED_PUBLISHER_URL = "http://publisher:4000";
    process.env.TRPC_SERVER_API_TOKEN = "test-token";

    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        availability: "available",
        outcome: "succeeded",
        logAvailability: "available",
      }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const { deploymentRouter } = await import("./deployment");
    const caller = deploymentRouter.createCaller({} as unknown);

    // includeLog not set — should not add parameter
    await caller.getPublishLog({
      buildId: "test-build-id",
      logHandle: "test-build-id",
    });
    expect(mockFetch).toHaveBeenCalledWith(
      expect.not.stringContaining("includeLog"),
      expect.any(Object)
    );
  });

  test("publish tolerates older publishers without logHandle", async () => {
    process.env.SELF_HOSTED_PUBLISHER_URL = "http://publisher:4000";

    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true }), // no logHandle
    });
    vi.stubGlobal("fetch", mockFetch);

    const { deploymentRouter } = await import("./deployment");
    const caller = deploymentRouter.createCaller({} as unknown);

    const result = await caller.publish({
      buildId: "test-id",
      builderOrigin: "http://builder",
      destination: "static",
      branchName: "main",
      logProjectName: "test-project",
    });

    expect(result).toEqual({ success: true });
  });

  test("publish handles non-JSON response gracefully", async () => {
    process.env.SELF_HOSTED_PUBLISHER_URL = "http://publisher:4000";

    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => {
        throw new Error("Not valid JSON");
      },
    });
    vi.stubGlobal("fetch", mockFetch);

    const { deploymentRouter } = await import("./deployment");
    const caller = deploymentRouter.createCaller({} as unknown);

    const result = await caller.publish({
      buildId: "test-id",
      builderOrigin: "http://builder",
      destination: "static",
      branchName: "main",
      logProjectName: "test-project",
    });

    expect(result).toEqual({ success: true });
  });

  test("getPublishLog returns available even if failedStage is invalid", async () => {
    process.env.SELF_HOSTED_PUBLISHER_URL = "http://publisher:4000";
    process.env.TRPC_SERVER_API_TOKEN = "test-token";

    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        availability: "available",
        outcome: "failed",
        logAvailability: "available",
        startedAt: "2026-01-01T12:00:00Z",
        completedAt: "2026-01-01T12:05:00Z",
        failedStage: "unknown", // Invalid enum value from publisher
      }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const { deploymentRouter } = await import("./deployment");
    const caller = deploymentRouter.createCaller({} as unknown);

    const result = await caller.getPublishLog({
      buildId: "test-build-id",
      logHandle: "test-build-id",
    });

    assert(result.availability === "available");
    expect(result.outcome).toBe("failed");
    expect(result.logAvailability).toBe("available");
    expect(result.startedAt).toBe("2026-01-01T12:00:00Z");
    expect(result.failedStage).toBeUndefined();
  });
});
