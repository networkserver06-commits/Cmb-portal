import { describe, expect, it } from "vitest";
import { GROK_DAILY_LIMIT, GROK_MODEL } from "./grok";

describe("Grok study assistant policy", () => {
  it("offers 100 requests per user per UTC day", () => {
    expect(GROK_DAILY_LIMIT).toBe(100);
  });

  it("uses the documented Grok 4.6 model by default", () => {
    expect(GROK_MODEL).toBe("grok-4.6");
  });
});
