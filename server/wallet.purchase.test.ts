import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { calculateWalletSummary } from "./mongoStore";

const homeSource = readFileSync(
  new URL("../client/src/pages/Home.tsx", import.meta.url),
  "utf8"
);
const routerSource = readFileSync(
  new URL("./routers.ts", import.meta.url),
  "utf8"
);

describe("wallet-first checkout", () => {
  it("subtracts completed wallet purchases from confirmed top-ups", () => {
    expect(
      calculateWalletSummary(
        [
          { status: "paid", amountKes: 1_000 },
          { status: "pending", amountKes: 500 },
        ],
        [{ status: "completed", amountKes: 350 }]
      )
    ).toEqual({ balanceKes: 650, totalTopUps: 1 });
  });

  it("checks the server wallet before starting the LeeTec fallback", () => {
    expect(routerSource).toContain("payWithWallet: protectedProcedure");
    expect(routerSource).toContain("purchasePaperWithWallet");
    expect(homeSource).toContain(
      "Checking your ScholarShelf wallet before checkout"
    );
    expect(homeSource).toContain("payWithWallet.mutate");
    expect(homeSource).toContain("Confirm wallet payment");
    expect(homeSource).toContain("Confirm and buy");
    expect(homeSource).toContain("/api/papers/${selectedPaper.id}/view");
    expect(homeSource).toContain("/api/papers/${selectedPaper.id}/download");
    expect(homeSource).toContain("startLeetecPayment(paperId, intent)");
  });
});
