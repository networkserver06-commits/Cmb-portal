import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createWalletTopUpReference, paymentMatchesOrder } from "./leetec";
import { calculateWalletSummary } from "./mongoStore";

const source = (file: string) =>
  readFileSync(resolve(process.cwd(), file), "utf8");

describe("wallet security safeguards", () => {
  const routerSource = source("server/routers.ts");
  const storeSource = source("server/mongoStore.ts");
  const serverSource = source("server/_core/index.ts");
  const accountSource = source("client/src/pages/Account.tsx");

  it("creates compact provider references with a random suffix", () => {
    const first = createWalletTopUpReference(42);
    const second = createWalletTopUpReference(42);
    expect(first).toMatch(/^WAL[A-Za-z0-9]+$/);
    expect(first).not.toBe(second);
  });

  it("credits only confirmed top-ups in the wallet balance", () => {
    expect(
      calculateWalletSummary([
        { status: "paid", amountKes: 10 },
        { status: "paid", amountKes: 100 },
        { status: "pending", amountKes: 250 },
        { status: "failed", amountKes: 500 },
      ])
    ).toEqual({ balanceKes: 110, totalTopUps: 2 });
  });

  it("matches wallet payments only when reference, KES currency, and amount agree", () => {
    expect(
      paymentMatchesOrder(
        { accountReference: "WALabc123", amount: 100, currency: "KES" },
        "WALabc123",
        100
      )
    ).toBe(true);
    expect(
      paymentMatchesOrder(
        { accountReference: "WALabc123", amount: 99, currency: "KES" },
        "WALabc123",
        100
      )
    ).toBe(false);
    expect(
      paymentMatchesOrder(
        { accountReference: "WALabc123", amount: 100, currency: "USD" },
        "WALabc123",
        100
      )
    ).toBe(false);
  });

  it("does not prefill an automatic wallet amount and collects a phone", () => {
    expect(accountSource).toContain('useState<number | "">("")');
    expect(accountSource).not.toContain("useState(100)");
    expect(accountSource).toContain("amount < 100");
    expect(accountSource).toContain("KES 100 and KES 150,000");
    expect(accountSource).toContain("Pending or failed payments are not included");
    expect(accountSource).toContain("Kenyan phone number");
    expect(accountSource).toContain('"Confirmed"');
    expect(accountSource).toContain('"Pending"');
    expect(accountSource).toContain('"Failed"');
  });

  it("keeps reconciliation protected and verifies provider fields", () => {
    expect(routerSource).toContain("paymentStatus: protectedProcedure");
    expect(routerSource).toContain("verifyLeetecTransaction");
    expect(routerSource).toContain('paymentStatus(data) === "failed"');
    expect(routerSource).toContain("wallet: protectedProcedure");
    expect(routerSource).toContain("initializeWalletTopUp: protectedProcedure");
    expect(routerSource).toContain("walletTopUpStatus: protectedProcedure");
    expect(routerSource).toContain("walletTopUpByReference(userId, reference)");
    expect(routerSource).toContain("paymentMatchesOrder(");
    expect(routerSource).toContain("ledgerPaymentData(data!)");
    expect(routerSource).toContain("initializeLeetecStkPush");
    expect(storeSource).toContain(
      "createIndex({ reference: 1 }, { unique: true })"
    );
    expect(storeSource).toContain('status: "paid"');
    expect(storeSource).toContain('status: { $ne: "paid" }');
    expect(storeSource).toContain('eventType: "wallet.top_up_confirmed"');
    expect(serverSource).not.toContain("/api/paystack/webhook");
  });
});
