import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createWalletTopUpReference } from "./paystack";

const source = (file: string) =>
  readFileSync(resolve(process.cwd(), file), "utf8");

describe("wallet security safeguards", () => {
  const routerSource = source("server/routers.ts");
  const storeSource = source("server/mongoStore.ts");

  it("creates wallet references that are scoped by user and are not predictable-only", () => {
    const first = createWalletTopUpReference(42);
    const second = createWalletTopUpReference(42);
    expect(first).toMatch(/^WALLET-42-\d+-[A-Za-z0-9]+$/);
    expect(first).not.toBe(second);
  });

  it("keeps wallet operations protected and verifies ownership and payment fields", () => {
    expect(routerSource).toContain("paymentStatus: protectedProcedure");
    expect(routerSource).toMatch(
      /fulfillSuccessfulPayment\(\s*input\.reference,\s*data,\s*JSON\.stringify\(\s*verified\s*\)\s*\)/
    );
    expect(routerSource).toContain('["failed", "abandoned", "cancelled"]');
    expect(routerSource).toMatch(
      /status:\s*"pending"\s*\},\s*\{\s*\$set:\s*\{\s*status:\s*"failed"/
    );
    expect(routerSource).toContain("wallet: protectedProcedure");
    expect(routerSource).toContain("initializeWalletTopUp: protectedProcedure");
    expect(routerSource).toContain("walletTopUpStatus: protectedProcedure");
    expect(routerSource).toContain(
      "walletTopUpByReference(ctx.user.id, input.reference)"
    );
    expect(routerSource).toContain("paymentMatchesOrder(");
    expect(routerSource).toContain("topUp.amountKes");
    expect(routerSource).toMatch(
      /status:\s*"pending"\s*\},\s*\{\s*\$set:\s*\{\s*status:\s*"paid"/
    );
    expect(storeSource).toContain(
      "createIndex({ reference: 1 }, { unique: true })"
    );
    expect(storeSource).toContain('status: "paid"');
  });
});
