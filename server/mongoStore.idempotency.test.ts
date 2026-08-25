import { describe, expect, it } from "vitest";
import { shouldCreateEntitlement } from "./mongoStore";

describe("MongoDB payment fulfilment idempotency", () => {
  it("does not create a second entitlement when an order already has one", () => {
    expect(
      shouldCreateEntitlement({
        _id: {} as never,
        legacyId: 42,
        userId: 7,
        paperId: 3,
        orderId: 91,
        source: "purchase",
        grantedAt: new Date(),
      })
    ).toBe(false);
  });

  it("allows entitlement creation for a new order", () => {
    expect(shouldCreateEntitlement(null)).toBe(true);
  });
});
