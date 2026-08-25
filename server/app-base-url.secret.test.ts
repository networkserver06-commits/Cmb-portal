import { describe, expect, it } from "vitest";
import { ENV } from "./_core/env";

describe("APP_BASE_URL deployment secret", () => {
  it("points to a reachable portal health endpoint", async () => {
    const baseUrl = new URL(ENV.appBaseUrl);
    expect(["http:", "https:"]).toContain(baseUrl.protocol);
    const response = await fetch(new URL("/api/health", baseUrl), {
      signal: AbortSignal.timeout(5000),
    });
    expect(response.status).toBeLessThan(500);
  });
});
