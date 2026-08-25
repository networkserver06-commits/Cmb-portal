import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("student dashboard tab workspace", () => {
  const accountSource = readFileSync(
    resolve(process.cwd(), "client/src/pages/Account.tsx"),
    "utf8"
  );

  it("defines the core student workspace sections", () => {
    for (const label of [
      "Overview",
      "Downloads",
      "Purchase history",
      "Submissions",
      "Activity",
      "Wallet & funds",
      "Account & security",
      "Support",
    ]) {
      expect(accountSource).toContain(`label: "${label}"`);
    }
    expect(accountSource).not.toContain(
      'aria-label="Student dashboard sections"'
    );
    expect(accountSource).not.toContain(
      'aria-current={active ? "page" : undefined}'
    );
    expect(accountSource).toContain('aria-label="Open student dashboard menu"');
    expect(accountSource).toContain('DropdownMenuContent align="end"');
    expect(accountSource).toMatch(/Dashboard menu\s*<\/span>/);
    expect(accountSource).toContain("useTheme()");
    expect(accountSource).toContain(
      'aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}'
    );
    expect(accountSource).toContain("Personal profile");
    expect(accountSource).toContain("trpc.student.wallet.useQuery(undefined)");
    expect(accountSource).toContain(
      "trpc.student.initializeWalletTopUp.useMutation"
    );
    expect(accountSource).toContain("trpc.student.walletTopUpStatus.useQuery");
    expect(accountSource).toContain(
      "trpc.student.activity.useQuery(undefined)"
    );
    expect(accountSource).toContain("trpc.student.updateProfile.useMutation");
    expect(accountSource).toContain("Editable profile");
    expect(accountSource).toContain("Your account activity");
    expect(accountSource).toContain("Personal profile");
    expect(accountSource).toContain("Published papers");
    expect(accountSource).toContain("Student workspace");
    expect(accountSource).toMatch(
      /dashboardTabs\.map\(tab => \(\s*<DropdownMenuItem/
    );
  });

  it("keeps one responsive menu container and removes the earlier duplicate navigation", () => {
    expect(accountSource).not.toContain("lg:grid-cols-[240px_minmax(0,1fr)]");
    expect(accountSource).toContain('aria-label="Open student dashboard menu"');
    expect(accountSource).toContain(
      'className="flex h-12 w-full items-center justify-between'
    );
    expect(accountSource).not.toContain(
      "hidden gap-2 lg:mt-3 lg:grid lg:grid-cols-1"
    );
    expect(accountSource).not.toContain("lg:hidden");
    expect(accountSource).toContain("Contact WhatsApp support");
    expect(accountSource).toContain("Reset password");
  });
});
