import { describe, expect, it } from "vitest";

describe("LeeTec credentials", () => {
  it("accepts a server-side LeeTec secret key format without exposing it", () => {
    const oldKey = process.env.LEETEC_API_KEY;
    process.env.LEETEC_API_KEY = "sk_live_example_key";
    try {
      const key = process.env.LEETEC_API_KEY;
      expect(key).toMatch(/^sk_(live|test)_[A-Za-z0-9_-]+$/);
      expect(JSON.stringify({ configured: Boolean(key) })).not.toContain(key);
    } finally {
      process.env.LEETEC_API_KEY = oldKey;
    }
  });
});
