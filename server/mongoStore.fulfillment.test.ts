import { describe, expect, it } from "vitest";
import { ObjectId } from "mongodb";
import { fulfillPayment, mongo, nextId } from "./mongoStore";

describe("MongoDB payment fulfilment replay", () => {
  it("creates one payment and one entitlement when the same verified event is replayed", async () => {
    if (!process.env.MONGODB_URI) return;
    const database = await mongo();
    const reference = `TEST-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const orderId = await nextId("test-orders");
    const paperId = await nextId("test-papers");
    const userId = await nextId("test-users");
    await database.collection("orders").insertOne({
      _id: new ObjectId(),
      legacyId: orderId,
      userId,
      paperId,
      reference,
      amountKes: 10,
      status: "pending",
      createdAt: new Date(),
    });
    try {
      const provider = {
        reference,
        amount: 1000,
        currency: "KES",
        channel: "leetec-stkpush",
      };
      const first = await fulfillPayment(
        reference,
        provider,
        JSON.stringify({ event: "charge.success", data: provider })
      );
      const second = await fulfillPayment(
        reference,
        provider,
        JSON.stringify({ event: "charge.success", data: provider })
      );
      const payments = await database
        .collection("payments")
        .countDocuments({ providerReference: reference });
      const entitlements = await database
        .collection("entitlements")
        .countDocuments({ orderId });
      expect(first.fulfilled).toBe(true);
      expect(second.fulfilled).toBe(false);
      expect(payments).toBe(1);
      expect(entitlements).toBe(1);
    } finally {
      await database.collection("orders").deleteMany({ reference });
      await database
        .collection("payments")
        .deleteMany({ providerReference: reference });
      await database.collection("entitlements").deleteMany({ orderId });
    }
  }, 30000);
});
