import { describe, expect, it } from "vitest";
import {
  ledgerPaymentData,
  paymentMatchesOrder,
  paymentStatus,
} from "./leetec";

describe("wallet LeeTec reconciliation", () => {
  it("settles a successful transaction only after exact matching", () => {
    const transaction = {
      accountReference: "WALabc123",
      amount: 30,
      currency: "KES",
      status: "SUCCESS",
    };
    expect(paymentStatus(transaction)).toBe("paid");
    expect(
      paymentMatchesOrder(transaction, "WALabc123", 30)
    ).toBe(true);
    expect(ledgerPaymentData(transaction).amount).toBe(3000);
  });

  it("does not credit failed or cancelled transactions", () => {
    expect(paymentStatus({ status: "FAILED" })).toBe("failed");
    expect(paymentStatus({ status: "CANCELLED" })).toBe("failed");
    expect(paymentStatus({ status: "PENDING" })).toBe("pending");
  });
});
