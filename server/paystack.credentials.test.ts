import { describe, expect, it } from "vitest";

describe("Paystack credentials", () => {
  it("accepts a configured server secret without contacting production APIs", () => {
    const secret = process.env.PAYSTACK_SECRET_KEY;
    expect(secret, "PAYSTACK_SECRET_KEY must be configured").toBeTruthy();
    expect(secret).toMatch(/^(sk|pk)_[A-Za-z0-9_\-]+$/);
  });
});
