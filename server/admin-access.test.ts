import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = (file: string) =>
  readFileSync(resolve(process.cwd(), file), "utf8");

describe("role-aware administrator access", () => {
  const accountSource = source("client/src/pages/Account.tsx");
  const adminSource = source("client/src/pages/Admin.tsx");
  const controlsSource = source("client/src/pages/AdminControls.tsx");
  const adminOperationsSource = source("client/src/pages/AdminOperations.tsx");
  const layoutSource = source("client/src/components/DashboardLayout.tsx");
  const appSource = source("client/src/App.tsx");
  const mainSource = source("client/src/main.tsx");
  const roleSource = source("server/db.ts");
  const trpcSource = source("server/_core/trpc.ts");
  const routerSource = source("server/routers.ts");

  it("detects admin accounts inside the normal authenticated account workspace", () => {
    expect(accountSource).toContain('user.role === "admin"');
    expect(accountSource).toContain(
      'aria-label="Administrator access detected"'
    );
    expect(accountSource).toContain('href="/admin"');
    expect(adminSource).toContain("Administrator role detected");
    expect(adminSource).not.toContain(
      'aria-label="Administrator management pages"'
    );
    expect(adminSource).toContain('href="/"');
    expect(adminSource).toContain("Visit home");
    expect(adminSource).toContain('href="/account"');
    expect(adminSource).toContain("Profile");
    expect(layoutSource).toContain("Sign out");
    expect(accountSource).toContain("AdminWorkspaceTransition");
    expect(accountSource).toContain("Opening administrator workspace");
    expect(accountSource).toContain("setDashboardTransition(destination)");
    expect(accountSource).toContain(
      'destination === "administrator" ? "/admin" : "/account"'
    );
  });

  it("keeps the administrator route registered and the workspace controls live", () => {
    expect(appSource).toContain('<Route path={"/admin"} component={Admin} />');
    expect(appSource).toContain(
      '<Route path={"/admin/:section"} component={Admin} />'
    );
    expect(adminSource).toContain('if (user.role !== "admin")');
    expect(adminSource).toContain("trpc.admin.summary.useQuery()");
    expect(adminSource).toContain('id="admin-controls"');
    expect(adminSource).toContain('id="admin-overview"');
    expect(adminSource).toContain('id="storage-management"');
    expect(adminSource).toContain('id="admin-settings"');
    expect(adminSource).toContain('id="admin-funds"');
    expect(adminSource).toContain("walletSummary.useQuery()");
    expect(adminSource).toContain("Live wallet ledger");
    expect(adminSource).toContain("Confirmed volume");
    expect(adminSource).toContain('id="admin-analytics"');
    expect(adminSource).toContain("analyticsSummary.useQuery()");
    for (const label of ["visitors", "devices", "activity", "suggestions"])
      expect(adminSource).toContain(`analyticsTab === "${label}"`);
    expect(adminSource).toContain("setActiveSection(tab)");
    expect(adminSource).toContain("sectionTargets");
    expect(adminSource).not.toContain("setMenuOpen");
    expect(adminSource).toContain('id="admin-operations"');
    expect(adminSource).toContain('id="storage-management"');
    expect(adminSource).not.toContain("const rows = [");
    expect(routerSource).toContain("walletSummary: adminProcedure.query");
    expect(routerSource).toContain("walletSummaryForAdmin");
    expect(routerSource).toContain("analyticsSummary: adminProcedure.query");
    expect(routerSource).toMatch(/recordVisit:\s*publicProcedure\s*\.input/);
    expect(routerSource).toContain("analytics_events");
    expect(appSource).toContain("recordVisit.mutate");
  });

  it("keeps permanent paper deletion confirmation-gated and access-cleaning", () => {
    expect(routerSource).toContain("deletePaper: adminProcedure");
    expect(routerSource).toContain('confirmation: z.literal("DELETE_PAPER")');
    expect(routerSource).toContain("deleteMany({ paperId: paper.legacyId })");
    expect(routerSource).toContain("unlinkPortalFile");
    expect(routerSource).toContain('eventType: "paper.permanently_deleted"');
  });

  it("publishes approved submissions and refreshes the public catalogue", () => {
    expect(routerSource).toContain('status: "approved"');
    expect(routerSource).toContain("paperId,");
    expect(routerSource).toContain('accessMode: "free"');
    expect(adminOperationsSource).toContain(
      "utils.admin.listPapers.invalidate()"
    );
  });

  it("keeps all admin mutations protected on the server", () => {
    expect(roleSource).toContain(
      'user.openId === process.env.OWNER_OPEN_ID ? "admin" : "user"'
    );
    expect(trpcSource).toMatch(/ctx\.user\.role\s*!==\s*["']admin["']/);
    expect(trpcSource).toContain("NOT_ADMIN_ERR_MSG");
  });

  it("routes unauthenticated administrator access through the account login page", () => {
    expect(layoutSource).toContain('setLocation("/login")');
    expect(layoutSource).toContain(
      'user?.role === "admin" ? "Administrator" : "Navigation"'
    );
    expect(layoutSource).toContain(
      'user?.role === "admin" ? "Administrator · " : ""'
    );
    for (const label of [
      "Dashboard",
      "Papers",
      "Posts",
      "Students",
      "Funds",
      "Analytics",
      "Settings & security",
      "Maintenance",
      "Storage",
    ])
      expect(layoutSource).toContain(`label: "${label}"`);
    expect(adminSource).toContain('id="admin-maintenance"');
    expect(adminSource).toContain("operationalStatus.useQuery()");
    expect(adminSource).toContain("Paystack readiness");
    expect(adminSource).toContain(
      'activeSection !== "overview" ? "hidden" : ""'
    );
    expect(adminSource).toContain('activeSection !== "analytics" ? "hidden"');
    expect(adminSource).toContain('activeSection !== "settings" ? "hidden"');
    expect(adminSource).toContain('activeSection !== "maintenance" ? "hidden"');
    expect(adminSource).toContain('activeSection !== "storage" ? "hidden"');
    expect(controlsSource).toContain("Catalogue upload station");
    expect(controlsSource).toContain(
      "Student submissions are handled in Operations."
    );
    expect(controlsSource).not.toContain("Posts studio");
    expect(controlsSource).not.toContain("Administrator document publisher");
    expect(controlsSource).toContain('from "sonner"');
    expect(controlsSource).toContain(
      "await utils.admin.listPapers.invalidate()"
    );
    expect(layoutSource).toContain("const menuGroups = [");
    expect(layoutSource).toContain("Learners & finance");
    expect(layoutSource).toContain("System");
    expect(layoutSource).toContain("CollapsibleTrigger");
    expect(mainSource).toContain('Toaster position="top-right"');
    expect(controlsSource).toContain("accept={acceptedDocuments}");
    expect(controlsSource).toContain('purpose: "paper"');
    expect(routerSource).toMatch(
      /publishPost:\s*adminProcedure\s*\.input\(postInput\)/
    );
    expect(routerSource).toMatch(
      /accessMode:\s*input\.mode === "free" \? "free" : "purchase"/
    );
    expect(routerSource).toContain(
      "Paid posts must have a price greater than zero."
    );
    expect(routerSource).toContain("Free posts must have a zero price.");
  });
});
