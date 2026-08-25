import { afterEach, describe, expect, it } from "vitest";
import { ENV } from "./_core/env";
import { publicPortalUrl } from "./mongoAuth";

describe("Paystack callback URLs", () => {
  const originalBaseUrl = ENV.appBaseUrl;

  afterEach(() => {
    ENV.appBaseUrl = originalBaseUrl;
  });

  it("builds an absolute callback URL from the configured portal origin", () => {
    ENV.appBaseUrl = "https://portal.example.test/";
    expect(publicPortalUrl("/account?wallet_reference=WALLET-1")).toBe(
      "https://portal.example.test/account?wallet_reference=WALLET-1"
    );
  });

  it("rejects a missing public portal URL with an actionable error", () => {
    ENV.appBaseUrl = "";
    expect(() => publicPortalUrl("/account")).toThrow(
      "APP_BASE_URL is not configured"
    );
  });

  it("rejects a host-only public portal URL instead of returning Invalid URL", () => {
    ENV.appBaseUrl = "portal.example.test";
    expect(() => publicPortalUrl("/account")).toThrow(
      "APP_BASE_URL must be a valid absolute URL"
    );
  });
});

export {};
