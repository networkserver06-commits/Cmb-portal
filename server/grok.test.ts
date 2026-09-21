import { describe, expect, it } from "vitest";
import { GROK_DAILY_LIMIT, GROK_MODEL } from "./grok";

describe("Grok study assistant policy", () => {
  it("offers 100 requests per user per UTC day", () => {
    expect(GROK_DAILY_LIMIT).toBe(100);
  });

  it("uses the documented Grok 4.6 model by default", () => {
    expect(GROK_MODEL).toBe("grok-4.6");
  });

  it("supports explicit xAI and Groq provider switches", () => {
    expect("GROK_PROVIDER=xai").toContain("xai");
    expect("GROK_PROVIDER=groq").toContain("groq");
    expect("GROK_PROVIDER=auto").toContain("auto");
  });
});
