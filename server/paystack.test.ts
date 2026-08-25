import crypto from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  createPaymentReference,
  createWalletTopUpReference,
  getPaystackReadiness,
  initializePaystackCheckout,
  isValidPaystackSignature,
  paymentMatchesOrder,
} from "./paystack";

describe("Paystack payment safeguards", () => {
  it("creates unique order references", () => {
    const first = createPaymentReference(12, 7);
    const second = createPaymentReference(12, 7);
    expect(first).not.toBe(second);
    expect(first).toMatch(/^CBM-12-7-/);
  });

  it("validates the signed raw webhook payload", () => {
    const old = process.env.PAYSTACK_SECRET_KEY;
    process.env.PAYSTACK_SECRET_KEY = "test-secret";
    const payload = JSON.stringify({
      event: "charge.success",
      data: { reference: "CBM-1" },
    });
    const signature = crypto
      .createHmac("sha512", "test-secret")
      .update(payload)
      .digest("hex");
    expect(isValidPaystackSignature(payload, signature)).toBe(true);
    expect(isValidPaystackSignature(payload, "invalid")).toBe(false);
    process.env.PAYSTACK_SECRET_KEY = old;
  });

  it("reports safe Paystack readiness without exposing configured secrets", async () => {
    const oldSecret = process.env.PAYSTACK_SECRET_KEY;
    const oldPublic = process.env.VITE_PAYSTACK_PUBLIC_KEY;
    const oldFetch = globalThis.fetch;
    process.env.PAYSTACK_SECRET_KEY = "sk_test_example_key";
    process.env.VITE_PAYSTACK_PUBLIC_KEY = "pk_test_example_key";
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
    })) as unknown as typeof fetch;
    try {
      const result = await getPaystackReadiness();
      expect(result.ready).toBe(true);
      expect(result.mode).toBe("test");
      expect(result.publicMode).toBe("test");
      expect(result.checks).toEqual({
        serverSecret: true,
        publicKey: true,
        modeMatch: true,
        hostedCheckout: true,
      });
      expect(JSON.stringify(result)).not.toContain("sk_test_example_key");
      expect(JSON.stringify(result)).not.toContain("pk_test_example_key");
    } finally {
      process.env.PAYSTACK_SECRET_KEY = oldSecret;
      process.env.VITE_PAYSTACK_PUBLIC_KEY = oldPublic;
      globalThis.fetch = oldFetch;
    }
  });

  it("initializes Paystack-hosted checkout without sending custom payer details", async () => {
    const oldSecret = process.env.PAYSTACK_SECRET_KEY;
    const oldFetch = globalThis.fetch;
    let requestBody: any;
    process.env.PAYSTACK_SECRET_KEY = "sk_test_example_key";
    globalThis.fetch = vi.fn(async (_url, init) => {
      requestBody = JSON.parse(String(init?.body));
      return {
        ok: true,
        status: 200,
        json: async () => ({
          status: true,
          data: {
            status: "pending",
            reference: requestBody.reference,
            authorization_url: "https://checkout.paystack.example/authorize",
          },
        }),
      };
    }) as unknown as typeof fetch;
    try {
      const reference = createWalletTopUpReference(7);
      expect(reference).toMatch(/^WALLET-7-\d+-[A-Za-z0-9]+$/);
      const checkout = await initializePaystackCheckout({
        email: "student@example.com",
        amountKes: 100,
        reference,
        callbackUrl: "https://portal.example.com/payment-result",
      });
      expect(requestBody).toMatchObject({
        amount: 10000,
        currency: "KES",
        reference,
        callback_url: "https://portal.example.com/payment-result",
      });
      expect(requestBody.mobile_money).toBeUndefined();
      expect(checkout).toEqual({
        reference,
        authorizationUrl: "https://checkout.paystack.example/authorize",
      });
    } finally {
      process.env.PAYSTACK_SECRET_KEY = oldSecret;
      globalThis.fetch = oldFetch;
    }
  });

  it("rejects Paystack hosted-checkout provider errors", async () => {
    const oldSecret = process.env.PAYSTACK_SECRET_KEY;
    const oldFetch = globalThis.fetch;
    let requestBody: any;
    process.env.PAYSTACK_SECRET_KEY = "sk_test_example_key";
    globalThis.fetch = vi.fn(async (_url, init) => {
      requestBody = JSON.parse(String(init?.body));
      return {
        ok: true,
        status: 200,
        json: async () => ({
          status: false,
          message: "Checkout is unavailable",
        }),
      };
    }) as unknown as typeof fetch;
    try {
      const reference = createPaymentReference(7, 9);
      await expect(
        initializePaystackCheckout({
          email: "student@example.com",
          amountKes: 100,
          reference,
          callbackUrl: "https://portal.example.com/payment-result",
        })
      ).rejects.toThrow("Checkout is unavailable");
      expect(requestBody.mobile_money).toBeUndefined();
    } finally {
      process.env.PAYSTACK_SECRET_KEY = oldSecret;
      globalThis.fetch = oldFetch;
    }
  });

  it("requires matching KES amount and reference before fulfilment", () => {
    expect(
      paymentMatchesOrder(
        { reference: "CBM-1", amount: 25000, currency: "KES" },
        "CBM-1",
        250
      )
    ).toBe(true);
    expect(
      paymentMatchesOrder(
        { reference: "CBM-1", amount: 24900, currency: "KES" },
        "CBM-1",
        250
      )
    ).toBe(false);
    expect(
      paymentMatchesOrder(
        { reference: "CBM-2", amount: 25000, currency: "KES" },
        "CBM-1",
        250
      )
    ).toBe(false);
  });
});
