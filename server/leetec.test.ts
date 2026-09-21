import { describe, expect, it, vi } from "vitest";
import {
  createPaymentReference,
  createWalletTopUpReference,
  initializeLeetecStkPush,
  ledgerPaymentData,
  normalizeKenyanPhone,
  paymentMatchesOrder,
  paymentStatus,
} from "./leetec";

describe("LeeTec payment safeguards", () => {
  it("normalizes Kenyan mobile numbers to the API format", () => {
    expect(normalizeKenyanPhone("0712 345 678")).toBe("254712345678");
    expect(normalizeKenyanPhone("+254712345678")).toBe("254712345678");
    expect(() => normalizeKenyanPhone("0201234567")).toThrow(
      "valid Kenyan mobile number"
    );
  });

  it("creates scoped wallet and paper references", () => {
    expect(createPaymentReference(12, 7)).toMatch(/^CBM-12-7-/);
    expect(createWalletTopUpReference(7)).toMatch(/^WALLET-7-/);
  });

  it("sends a documented STK Push request with KES units", async () => {
    const oldKey = process.env.LEETEC_API_KEY;
    const oldFetch = globalThis.fetch;
    process.env.LEETEC_API_KEY = "sk_test_example";
    let requestBody: any;
    globalThis.fetch = vi.fn(async (_url, init) => {
      requestBody = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ status: true, message: "Accepted" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    try {
      const result = await initializeLeetecStkPush({
        phoneNumber: "0712345678",
        amountKes: 100,
        accountReference: "CBM-1-2-reference",
        transactionDesc: "ScholarShelf paper",
      });
      expect(requestBody).toEqual({
        phoneNumber: "254712345678",
        amount: 100,
        accountReference: "CBM-1-2-reference",
        transactionDesc: "ScholarShelf paper",
      });
      expect(result.phoneNumber).toBe("254712345678");
    } finally {
      process.env.LEETEC_API_KEY = oldKey;
      globalThis.fetch = oldFetch;
    }
  });

  it("matches only the exact reference, KES currency, and whole-KES amount", () => {
    const transaction = {
      accountReference: "CBM-1-2-reference",
      amount: 250,
      currency: "KES",
      status: "SUCCESS",
    };
    expect(paymentMatchesOrder(transaction, "CBM-1-2-reference", 250)).toBe(true);
    expect(paymentMatchesOrder(transaction, "CBM-1-2-other", 250)).toBe(false);
    expect(paymentMatchesOrder({ ...transaction, amount: 249 }, "CBM-1-2-reference", 250)).toBe(false);
  });

  it("maps documented transaction statuses and ledger units safely", () => {
    expect(paymentStatus({ status: "PENDING" })).toBe("pending");
    expect(paymentStatus({ status: "SUCCESS" })).toBe("paid");
    expect(paymentStatus({ status: "FAILED" })).toBe("failed");
    expect(ledgerPaymentData({ accountReference: "WALLET-1", amount: 100, currency: "KES" })).toMatchObject({
      reference: "WALLET-1",
      amount: 10000,
      currency: "KES",
    });
  });
});
