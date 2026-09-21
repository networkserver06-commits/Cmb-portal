import { afterEach, describe, expect, it } from "vitest";
import {
  activeGrokProvider,
  GROK_DAILY_LIMIT,
  GROK_MODEL,
  grokConfigured,
  grokProviderOrder,
} from "./grok";

const originalEnv = {
  GROK_PROVIDER: process.env.GROK_PROVIDER,
  XAI_API_KEY: process.env.XAI_API_KEY,
  GROQ_API_KEY: process.env.GROQ_API_KEY,
  GROK_API_KEY: process.env.GROK_API_KEY,
};

afterEach(() => {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("Grok study assistant policy", () => {
  it("offers 100 requests per user per UTC day", () => {
    expect(GROK_DAILY_LIMIT).toBe(100);
  });

  it("uses the documented Grok 4.6 model by default", () => {
    expect(GROK_MODEL).toBe("grok-4.6");
  });

  it("forces xAI when GROK_PROVIDER is xai", () => {
    process.env.GROK_PROVIDER = "xai";
    process.env.XAI_API_KEY = "xai-test-key";
    process.env.GROQ_API_KEY = "groq-test-key";

    expect(activeGrokProvider()).toBe("xai");
    expect(grokProviderOrder()).toEqual(["xai"]);
  });

  it("forces Groq when GROK_PROVIDER is groq", () => {
    process.env.GROK_PROVIDER = "groq";
    process.env.XAI_API_KEY = "xai-test-key";
    process.env.GROQ_API_KEY = "groq-test-key";

    expect(activeGrokProvider()).toBe("groq");
    expect(grokProviderOrder()).toEqual(["groq"]);
  });

  it("prefers xAI and keeps Groq as an automatic failover", () => {
    process.env.GROK_PROVIDER = "auto";
    process.env.XAI_API_KEY = "xai-test-key";
    process.env.GROQ_API_KEY = "groq-test-key";

    expect(activeGrokProvider()).toBe("xai");
    expect(grokProviderOrder()).toEqual(["xai", "groq"]);
    expect(grokConfigured()).toBe(true);
  });

  it("uses Groq automatically when xAI is not configured", () => {
    process.env.GROK_PROVIDER = "auto";
    delete process.env.XAI_API_KEY;
    process.env.GROQ_API_KEY = "groq-test-key";

    expect(activeGrokProvider()).toBe("groq");
    expect(grokProviderOrder()).toEqual(["groq"]);
    expect(grokConfigured()).toBe(true);
  });
});
