import { useEffect, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link, useLocation } from "wouter";
import AdminControls from "./AdminControls";
import AdminOperations from "./AdminOperations";
import StorageManagement from "./StorageManagement";
import {
  Activity,
  BarChart3,
  Lightbulb,
  Smartphone,
  AlertTriangle,
  ArrowUpRight,
  BookOpen,
  CheckCircle2,
  Clock3,
  CreditCard,
  FileText,
  Loader2,
  Plus,
  ShieldCheck,
  Home,
  Users,
  XCircle,
  WalletCards,
} from "lucide-react";

function AccessDenied() {
  return (
    <div className="grid min-h-screen place-items-center bg-[#f7f8f6] p-6 text-center">
      <div className="max-w-md">
        <ShieldCheck className="mx-auto h-12 w-12 text-[#b88327]" />
        <h1 className="mt-5 font-serif text-3xl font-semibold text-[#173e35]">
          Administrator access only
        </h1>
        <p className="mt-2 text-sm leading-6 text-[#718780]">
          This signed-in account is a student account. Administrator controls
          are only available to accounts with the MongoDB role of{" "}
          <strong>admin</strong>.
        </p>
        <Link
          href="/account"
          className="mt-6 inline-flex items-center justify-center rounded-full bg-[#1d5146] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#153c34]"
        >
          Return to my account
        </Link>
      </div>
    </div>
  );
}

function AdminWorkspace() {
  const summary = trpc.admin.summary.useQuery();
  const papers = trpc.admin.listPapers.useQuery();
  const users = trpc.admin.listUsers.useQuery();
  const payments = trpc.admin.listPayments.useQuery();
  const walletSummary = trpc.admin.walletSummary.useQuery();
  const files = trpc.admin.files.useQuery();
  const operationalRecords = trpc.admin.operationalRecords.useQuery();

  const isLoading =
    summary.isLoading ||
    papers.isLoading ||
    users.isLoading ||
    payments.isLoading ||
    walletSummary.isLoading;
  const paperRows = papers.data?.slice(0, 6) ?? [];
  const paymentCounts = payments.data?.reduce(
    (counts, row) => {
      const status = String(row.payment.status).toLowerCase();
      if (status === "paid" || status === "success" || status === "successful")
        counts.successful += 1;
      else if (status === "pending" || status === "processing")
        counts.pending += 1;
      else counts.failed += 1;
      return counts;
    },
    { successful: 0, pending: 0, failed: 0 }
  ) ?? { successful: 0, pending: 0, failed: 0 };

  const [location] = useLocation();
  const [activeSection, setActiveSection] = useState("overview");
  const [analyticsTab, setAnalyticsTab] = useState<
    "visitors" | "devices" | "activity" | "suggestions"
  >("visitors");
  const analytics = trpc.admin.analyticsSummary.useQuery();
  const sectionTargets: Record<string, string> = {
    overview: "admin-overview",
    catalogue: "admin-controls",
    students: "admin-operations",
    payments: "admin-operations",
    submissions: "admin-operations",
    announcements: "admin-controls",
    reports: "admin-overview",
    storage: "storage-management",
    settings: "admin-settings",
    posts: "admin-controls",
    funds: "admin-funds",
    analytics: "admin-analytics",
    maintenance: "admin-maintenance",
  };
  const operational = trpc.admin.operationalStatus.useQuery();
  useEffect(() => {
    const path = location.split("?")[0];
    const pathMap: Record<string, string> = {
      "/admin": "overview",
      "/admin/papers": "catalogue",
      "/admin/posts": "posts",
      "/admin/students": "students",
      "/admin/funds": "funds",
      "/admin/analytics": "analytics",
      "/admin/settings": "settings",
      "/admin/maintenance": "maintenance",
      "/admin/storage": "storage",
    };
    const selected = pathMap[path];
    if (!selected) return;
    setActiveSection(selected);
    if (path !== "/admin")
      window.setTimeout(
        () =>
          document
            .getElementById(sectionTargets[selected] ?? "")
            ?.scrollIntoView({ behavior: "smooth", block: "start" }),
        0
      );
  }, [location]);

  const jumpTo = (id: string, tab?: string) => {
    if (tab) setActiveSection(tab);
    document
      .getElementById(id)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const stats = [
    {
      label: "Catalogue papers",
      value: summary.data?.papers ?? "—",
      Icon: BookOpen,
      detail: isLoading ? "Syncing MongoDB…" : "Live catalogue total",
    },
    {
      label: "Paid orders",
      value: summary.data?.paidOrders ?? "—",
      Icon: CreditCard,
      detail: isLoading ? "Syncing MongoDB…" : "Verified payment orders",
    },
    {
      label: "Revenue",
      value: summary.data
        ? `KES ${summary.data.revenueKes.toLocaleString()}`
        : "—",
      Icon: Activity,
      detail: isLoading ? "Syncing MongoDB…" : "Paid order total",
    },
    {
      label: "Registered accounts",
      value: users.data?.length ?? "—",
      Icon: Users,
      detail: isLoading ? "Syncing MongoDB…" : "Student and admin accounts",
    },
  ];

  return (
    <div className="min-h-screen bg-[#f7f8f6] px-4 py-6 text-[#19312c] md:px-8 md:py-8">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col justify-between gap-5 md:flex-row md:items-center">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-[#4b8876]">
              <ShieldCheck size={15} /> Administrator workspace
            </div>
            <h1 className="mt-3 font-serif text-4xl font-semibold tracking-tight text-[#173e35]">
              Your control centre.
            </h1>
            <p className="mt-2 max-w-2xl text-[#718780]">
              Manage the live examination-paper catalogue, students, payments,
              free submissions, announcements, and storage from one protected
              workspace.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3 md:ml-auto">
            <Link
              href="/"
              className="inline-flex items-center gap-2 rounded-full border border-[#c8d9d2] bg-white px-4 py-2 text-sm font-semibold text-[#1d5146] transition hover:bg-[#f5f9f6]"
            >
              <Home size={16} /> Visit home
            </Link>
            <Link
              href="/account"
              className="inline-flex items-center gap-2 rounded-full border border-[#c8d9d2] bg-white px-4 py-2 text-sm font-semibold text-[#1d5146] transition hover:bg-[#f5f9f6]"
            >
              <Users size={16} /> Profile
            </Link>
            <Button
              className="w-fit rounded-full bg-[#1d5146] hover:bg-[#153c34]"
              onClick={() => jumpTo("admin-controls", "catalogue")}
            >
              <Plus size={16} /> Add examination paper
            </Button>
          </div>
        </div>

        <div className="mt-8 flex items-start gap-3 rounded-2xl border border-[#e6d49c] bg-[#fff9e8] p-4 text-[#7a5b16]">
          <ShieldCheck size={19} className="mt-0.5 shrink-0" />
          <div>
            <div className="text-sm font-semibold">
              Administrator role detected
            </div>
            <div className="mt-1 text-xs leading-5 text-[#987b37]">
              You signed in through the normal account page, and your MongoDB
              user role grants access to the controls below.
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="ml-auto hidden rounded-full border-[#e5ce89] bg-transparent text-[#7a5b16] md:inline-flex"
            onClick={() => jumpTo("admin-operations")}
          >
            Manage operations
          </Button>
        </div>

        <section
          aria-label="Administrator quick actions"
          className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5"
        >
          {[
            ["Upload catalogue paper", "admin-controls", "catalogue", Plus],
            [
              "Review student submissions",
              "admin-operations",
              "submissions",
              FileText,
            ],
            ["Review payments", "admin-operations", "payments", CreditCard],
            ["Open storage", "storage-management", "storage", ArrowUpRight],
            [
              "Check maintenance",
              "admin-maintenance",
              "maintenance",
              ShieldCheck,
            ],
          ].map(([label, target, tab, Icon]) => (
            <button
              key={label as string}
              type="button"
              onClick={() => jumpTo(target as string, tab as string)}
              className="group flex items-center gap-3 rounded-2xl border border-[#dfe9e3] bg-white p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-[#b8d8c8] hover:shadow-md"
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#e8f1ed] text-[#2d7965]">
                <Icon size={16} />
              </span>
              <span className="min-w-0 text-xs font-semibold text-[#274d43]">
                {label as string}
              </span>
            </button>
          ))}
        </section>

        <div
          id="admin-overview"
          className={`scroll-mt-6 mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-4 ${activeSection !== "overview" ? "hidden" : ""}`}
        >
          {stats.map(({ label, value, Icon, detail }) => (
            <div
              key={label}
              className="rounded-2xl border border-[#dfe9e3] bg-white p-5 shadow-sm"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#789087]">
                  {label}
                </span>
                <div className="grid h-9 w-9 place-items-center rounded-xl bg-[#e8f1ed] text-[#2d7965]">
                  <Icon size={17} />
                </div>
              </div>
              <div className="mt-5 text-2xl font-semibold tracking-tight text-[#173e35]">
                {value}
              </div>
              <div className="mt-2 text-xs font-medium text-[#6d8a7e]">
                {detail}
              </div>
            </div>
          ))}
        </div>

        <section
          className={`mt-6 grid gap-5 lg:grid-cols-[.85fr_1.15fr] ${activeSection !== "overview" ? "hidden" : ""}`}
          aria-label="Portal file and activity overview"
        >
          <article className="rounded-3xl border border-[#dfe9e3] bg-white p-6 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#4b8876]">
                  MongoDB GridFS
                </p>
                <h2 className="mt-2 font-serif text-2xl font-semibold text-[#173e35]">
                  File inventory
                </h2>
                <p className="mt-2 text-xs leading-5 text-[#82958e]">
                  Files are stored with lifecycle and access metadata, not
                  browser-trusted object keys.
                </p>
              </div>
              <div className="grid h-10 w-10 place-items-center rounded-2xl bg-[#e8f1ed] text-[#2d7965]">
                <FileText size={18} />
              </div>
            </div>
            <div className="mt-6 grid grid-cols-3 gap-3">
              <div className="rounded-2xl bg-[#f5f9f6] p-3">
                <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#789087]">
                  Stored
                </div>
                <div className="mt-1 text-xl font-semibold text-[#173e35]">
                  {files.isLoading ? "—" : (files.data?.length ?? 0)}
                </div>
              </div>
              <div className="rounded-2xl bg-[#fff9e8] p-3">
                <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#987b37]">
                  Pending
                </div>
                <div className="mt-1 text-xl font-semibold text-[#7a5b16]">
                  {files.isLoading
                    ? "—"
                    : (files.data?.filter(file => file.lifecycle === "pending")
                        .length ?? 0)}
                </div>
              </div>
              <div className="rounded-2xl bg-[#e5f2eb] p-3">
                <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#34745f]">
                  Linked
                </div>
                <div className="mt-1 text-xl font-semibold text-[#1d5146]">
                  {files.isLoading
                    ? "—"
                    : (files.data?.filter(file => file.lifecycle === "linked")
                        .length ?? 0)}
                </div>
              </div>
            </div>
            <Button
              variant="outline"
              className="mt-5 rounded-full border-[#c8d9d2] text-[#1d5146]"
              onClick={() => jumpTo("storage-management", "storage")}
            >
              Manage secure files <ArrowUpRight size={15} />
            </Button>
          </article>
          <article className="rounded-3xl border border-[#dfe9e3] bg-white p-6 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#4b8876]">
                  Operational records
                </p>
                <h2 className="mt-2 font-serif text-2xl font-semibold text-[#173e35]">
                  Recent protected activity
                </h2>
                <p className="mt-2 text-xs leading-5 text-[#82958e]">
                  Uploads, downloads, cleanup events, and key workflow actions
                  are recorded for administrator review.
                </p>
              </div>
              <Activity className="mt-1 text-[#2d7965]" size={20} />
            </div>
            <div className="mt-5 space-y-2">
              {operationalRecords.isLoading ? (
                <div className="rounded-2xl bg-[#f5f9f6] p-4 text-sm text-[#718780]">
                  Loading recent activity…
                </div>
              ) : (
                operationalRecords.data?.slice(0, 5).map(record => (
                  <div
                    key={String(record._id)}
                    className="flex items-center justify-between gap-4 rounded-2xl bg-[#f5f9f6] px-4 py-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-[#274d43]">
                        {String(record.eventType).replace(/\./g, " · ")}
                      </p>
                      <p className="mt-0.5 text-xs text-[#82958e]">
                        {record.subjectType
                          ? `${record.subjectType} record`
                          : "Portal event"}
                        {record.actorId ? ` · actor ${record.actorId}` : ""}
                      </p>
                    </div>
                    <time className="shrink-0 text-xs text-[#82958e]">
                      {record.createdAt
                        ? new Date(record.createdAt).toLocaleString()
                        : "—"}
                    </time>
                  </div>
                ))
              )}
              {!operationalRecords.isLoading &&
                !operationalRecords.data?.length && (
                  <div className="rounded-2xl border border-dashed border-[#cdded7] p-5 text-center text-sm text-[#82958e]">
                    Activity will appear after protected portal actions occur.
                  </div>
                )}
            </div>
          </article>
        </section>

        <section
          id="admin-analytics"
          className={`mt-8 rounded-3xl border border-[#dfe9e3] bg-white p-6 shadow-sm transition ${activeSection !== "analytics" ? "hidden" : "ring-2 ring-[#b8d8c8] ring-offset-4"}`}
        >
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
            <div>
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-[#4b8876]">
                <BarChart3 size={15} /> Analytics centre
              </div>
              <h2 className="mt-2 font-serif text-2xl font-semibold text-[#173e35]">
                Understand how learners arrive.
              </h2>
              <p className="mt-1 max-w-2xl text-xs leading-5 text-[#82958e]">
                Privacy-safe visitor activity from the last 30 days. No names,
                emails, raw IP addresses, or secret payment data are stored.
              </p>
            </div>
            <Badge className="w-fit border-0 bg-[#e8f1ed] text-[#34745f]">
              {analytics.isLoading ? "Syncing" : "Live collection"}
            </Badge>
          </div>
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl bg-[#f5f9f6] p-4">
              <div className="text-xs font-semibold text-[#789087]">
                Unique visitors
              </div>
              <div className="mt-2 font-serif text-2xl font-semibold text-[#173e35]">
                {analytics.isLoading
                  ? "—"
                  : (analytics.data?.uniqueVisitors ?? 0)}
              </div>
              <div className="mt-1 text-[11px] text-[#82958e]">
                Distinct privacy-safe sessions
              </div>
            </div>
            <div className="rounded-2xl bg-[#f5f9f6] p-4">
              <div className="text-xs font-semibold text-[#789087]">
                Page views
              </div>
              <div className="mt-2 font-serif text-2xl font-semibold text-[#173e35]">
                {analytics.isLoading ? "—" : (analytics.data?.pageViews ?? 0)}
              </div>
              <div className="mt-1 text-[11px] text-[#82958e]">
                Recorded route visits
              </div>
            </div>
            <div className="rounded-2xl bg-[#f5f9f6] p-4">
              <div className="text-xs font-semibold text-[#789087]">
                Top device
              </div>
              <div className="mt-2 font-serif text-2xl font-semibold capitalize text-[#173e35]">
                {analytics.isLoading
                  ? "—"
                  : (Object.entries(analytics.data?.devices ?? {}).sort(
                      (a, b) => b[1] - a[1]
                    )[0]?.[0] ?? "—")}
              </div>
              <div className="mt-1 text-[11px] text-[#82958e]">
                By page-view share
              </div>
            </div>
            <div className="rounded-2xl bg-[#f5f9f6] p-4">
              <div className="text-xs font-semibold text-[#789087]">Window</div>
              <div className="mt-2 font-serif text-2xl font-semibold text-[#173e35]">
                30 days
              </div>
              <div className="mt-1 text-[11px] text-[#82958e]">
                Rolling activity window
              </div>
            </div>
          </div>
          <div
            className="mt-6 flex flex-wrap gap-2"
            role="tablist"
            aria-label="Analytics views"
          >
            {(["visitors", "devices", "activity", "suggestions"] as const).map(
              tab => (
                <button
                  key={tab}
                  type="button"
                  role="tab"
                  aria-selected={analyticsTab === tab}
                  onClick={() => setAnalyticsTab(tab)}
                  className={`rounded-full px-4 py-2 text-xs font-semibold capitalize transition ${analyticsTab === tab ? "bg-[#1d5146] text-white" : "border border-[#d9e6df] text-[#607a70] hover:bg-[#f5f9f6]"}`}
                >
                  {tab}
                </button>
              )
            )}
          </div>
          <div
            className="mt-5 rounded-2xl border border-[#edf2ef] p-5"
            role="tabpanel"
            aria-live="polite"
          >
            {analyticsTab === "visitors" && (
              <div className="grid gap-5 md:grid-cols-[1fr_.8fr]">
                <div>
                  <h3 className="font-serif text-xl font-semibold text-[#173e35]">
                    Visitor reach
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-[#718780]">
                    The dashboard counts unique browser sessions without storing
                    personally identifying information.
                  </p>
                  <div className="mt-5 flex items-end gap-3">
                    <span className="font-serif text-5xl font-semibold text-[#1d5146]">
                      {analytics.data?.uniqueVisitors ?? 0}
                    </span>
                    <span className="pb-2 text-xs text-[#82958e]">
                      unique sessions
                    </span>
                  </div>
                </div>
                <div className="rounded-2xl bg-[#173f36] p-5 text-[#edf7f1]">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <Users size={16} className="text-[#e5c66f]" /> Engagement
                    snapshot
                  </div>
                  <p className="mt-3 text-xs leading-5 text-[#b5cec2]">
                    {analytics.data?.pageViews
                      ? `${analytics.data.pageViews} page views have been recorded in this window.`
                      : "Visitor activity will appear here as learners explore the portal."}
                  </p>
                </div>
              </div>
            )}
            {analyticsTab === "devices" && (
              <div>
                <h3 className="font-serif text-xl font-semibold text-[#173e35]">
                  Device mix
                </h3>
                <p className="mt-2 text-sm text-[#718780]">
                  Use this view to prioritize mobile readability and desktop
                  management workflows.
                </p>
                <div className="mt-5 space-y-4">
                  {["mobile", "desktop", "tablet"].map(device => {
                    const count = analytics.data?.devices?.[device] ?? 0;
                    const total = analytics.data?.pageViews ?? 0;
                    const width = total
                      ? Math.max(4, Math.round((count / total) * 100))
                      : 4;
                    return (
                      <div key={device}>
                        <div className="mb-1 flex justify-between text-xs font-semibold capitalize text-[#506c63]">
                          <span className="flex items-center gap-2">
                            {device === "mobile" ? (
                              <Smartphone size={14} />
                            ) : (
                              <BarChart3 size={14} />
                            )}
                            {device}
                          </span>
                          <span>{count} views</span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-[#edf2ef]">
                          <div
                            className="h-full rounded-full bg-[#4b8876]"
                            style={{ width: `${width}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            {analyticsTab === "activity" && (
              <div>
                <h3 className="font-serif text-xl font-semibold text-[#173e35]">
                  Most visited routes
                </h3>
                <p className="mt-2 text-sm text-[#718780]">
                  Real route activity helps identify which parts of the portal
                  deserve the clearest navigation.
                </p>
                <div className="mt-5 space-y-2">
                  {Object.entries(analytics.data?.routes ?? {})
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 5)
                    .map(([route, count]) => (
                      <div
                        key={route}
                        className="flex items-center justify-between rounded-xl bg-[#f5f9f6] px-4 py-3 text-sm"
                      >
                        <span className="font-mono text-xs text-[#506c63]">
                          {route}
                        </span>
                        <span className="font-semibold text-[#1d5146]">
                          {count} views
                        </span>
                      </div>
                    ))}
                  {!Object.keys(analytics.data?.routes ?? {}).length && (
                    <div className="rounded-xl border border-dashed border-[#cdded7] p-6 text-center text-sm text-[#82958e]">
                      No route activity recorded yet.
                    </div>
                  )}
                </div>
              </div>
            )}
            {analyticsTab === "suggestions" && (
              <div>
                <div className="flex items-center gap-2">
                  <Lightbulb size={18} className="text-[#b88327]" />
                  <h3 className="font-serif text-xl font-semibold text-[#173e35]">
                    Actionable suggestions
                  </h3>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  <div className="rounded-2xl bg-[#fff9e8] p-4">
                    <div className="text-sm font-semibold text-[#7a5b16]">
                      Keep the catalogue discoverable
                    </div>
                    <p className="mt-2 text-xs leading-5 text-[#987b37]">
                      Use the Catalogue tab to keep paper titles, units, and
                      availability current.
                    </p>
                  </div>
                  <div className="rounded-2xl bg-[#f5f9f6] p-4">
                    <div className="text-sm font-semibold text-[#274d43]">
                      Prioritize the leading device
                    </div>
                    <p className="mt-2 text-xs leading-5 text-[#82958e]">
                      Review the Devices tab before changing responsive layouts
                      or publishing new controls.
                    </p>
                  </div>
                  <div className="rounded-2xl bg-[#f5f9f6] p-4">
                    <div className="text-sm font-semibold text-[#274d43]">
                      Watch payment conversion
                    </div>
                    <p className="mt-2 text-xs leading-5 text-[#82958e]">
                      Compare visitor activity with the Funds and Payments tabs
                      before making commercial changes.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>

        <div className="mt-8 grid gap-6 lg:grid-cols-[1.35fr_.65fr]">
          <section
            className={`rounded-2xl border border-[#dfe9e3] bg-white shadow-sm ${activeSection !== "catalogue" ? "hidden" : ""}`}
          >
            <div className="flex items-center justify-between border-b border-[#edf2ef] p-5">
              <div>
                <h2 className="font-serif text-xl font-semibold text-[#173e35]">
                  Paper inventory
                </h2>
                <p className="mt-1 text-xs text-[#82958e]">
                  Recently updated resources from MongoDB
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="rounded-full text-[#2d7965]"
                onClick={() => jumpTo("admin-controls")}
              >
                Manage all <ArrowUpRight size={15} />
              </Button>
            </div>
            <div className="overflow-x-auto">
              {papers.isLoading ? (
                <div
                  className="flex items-center gap-2 p-8 text-sm text-[#718780]"
                  role="status"
                >
                  <Loader2 className="account-spinner" size={16} /> Loading
                  paper inventory…
                </div>
              ) : paperRows.length ? (
                <table className="w-full text-left text-sm">
                  <thead className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#9aaca6]">
                    <tr>
                      <th className="px-5 py-4">Paper</th>
                      <th className="px-5 py-4">Price</th>
                      <th className="px-5 py-4">Status</th>
                      <th className="px-5 py-4">Document</th>
                      <th className="px-5 py-4">Updated</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#edf2ef]">
                    {paperRows.map(paper => (
                      <tr key={paper.legacyId} className="text-[#506c63]">
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            <div className="grid h-9 w-9 place-items-center rounded-xl bg-[#eef4f1] text-[#3c7d6c]">
                              <FileText size={16} />
                            </div>
                            <div>
                              <div className="font-medium text-[#274d43]">
                                {paper.title}
                              </div>
                              <div className="mt-0.5 text-xs text-[#8aa098]">
                                {paper.unit} · {paper.level}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-4 font-medium">
                          KES {Number(paper.priceKes).toLocaleString()}
                        </td>
                        <td className="px-5 py-4">
                          <Badge
                            className={`border-0 ${paper.isAvailable ? "bg-[#e5f2eb] text-[#34745f]" : "bg-[#fff4d5] text-[#94701d]"}`}
                          >
                            {paper.isAvailable ? "Available" : "Paused"}
                          </Badge>
                        </td>
                        <td className="px-5 py-4">
                          {paper.fileId ? (
                            <a
                              href={`/api/files/${encodeURIComponent(paper.fileId)}/view`}
                              target="_blank"
                              rel="noreferrer"
                              aria-label={`View document for ${paper.title}`}
                              className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-[#c8d9d2] px-3 py-1.5 text-xs font-semibold text-[#1d5146] transition hover:bg-[#f5f9f6]"
                            >
                              View document <ArrowUpRight size={13} />
                            </a>
                          ) : (
                            <span className="text-xs text-[#9aaca6]">
                              No file
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-4 text-xs text-[#82958e]">
                          {paper.updatedAt
                            ? new Date(paper.updatedAt).toLocaleDateString()
                            : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="p-8 text-center text-sm text-[#82958e]">
                  No papers have been published yet.
                </div>
              )}
            </div>
          </section>

          <section
            id="admin-funds"
            className={`rounded-2xl border border-[#dfe9e3] bg-[#173f36] p-6 text-[#edf7f1] ${activeSection !== "funds" ? "hidden" : ""}`}
          >
            <div className="flex items-center justify-between">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-[#e5c66f] text-[#1d443a]">
                <WalletCards size={19} />
              </div>
              <Badge className="border-0 bg-white/10 text-[#c6ddd2]">
                Live wallet ledger
              </Badge>
            </div>
            <h2 className="mt-7 font-serif text-2xl font-semibold">
              Funds & wallet activity
            </h2>
            <p className="mt-2 text-sm leading-6 text-[#afc9bd]">
              Wallet funds are counted only after Paystack confirms the matching
              hosted-checkout reference, amount, and KES currency. Client-side
              balances are never trusted.
            </p>
            <div className="mt-7 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl bg-white/10 p-4">
                <div className="text-xs text-[#c7dbd2]">Confirmed volume</div>
                <div className="mt-2 font-serif text-2xl font-semibold">
                  {walletSummary.isLoading
                    ? "—"
                    : `KES ${Number(walletSummary.data?.fundedKes ?? 0).toLocaleString()}`}
                </div>
              </div>
              <div className="rounded-2xl bg-white/10 p-4">
                <div className="text-xs text-[#c7dbd2]">Funded students</div>
                <div className="mt-2 font-serif text-2xl font-semibold">
                  {walletSummary.isLoading
                    ? "—"
                    : (walletSummary.data?.fundedStudents ?? 0)}
                </div>
              </div>
              <div className="rounded-2xl bg-white/10 p-4">
                <div className="text-xs text-[#c7dbd2]">Confirmed top-ups</div>
                <div className="mt-2 font-serif text-2xl font-semibold">
                  {walletSummary.isLoading
                    ? "—"
                    : (walletSummary.data?.paidTopUps ?? 0)}
                </div>
              </div>
              <div className="rounded-2xl bg-white/10 p-4">
                <div className="text-xs text-[#c7dbd2]">Pending / failed</div>
                <div className="mt-2 font-serif text-2xl font-semibold">
                  {walletSummary.isLoading
                    ? "—"
                    : `${walletSummary.data?.pendingTopUps ?? 0} / ${walletSummary.data?.failedTopUps ?? 0}`}
                </div>
              </div>
            </div>
            <div className="mt-7">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold">Recent top-ups</h3>
                <span className="text-[11px] text-[#afc9bd]">Latest 8</span>
              </div>
              {walletSummary.isLoading ? (
                <div className="rounded-xl bg-white/10 p-5 text-sm text-[#c7dbd2]">
                  Loading wallet activity…
                </div>
              ) : walletSummary.data?.recentTopUps.length ? (
                <div className="space-y-2">
                  {walletSummary.data.recentTopUps.map(row => (
                    <div
                      key={row.legacyId}
                      className="flex items-center justify-between gap-3 rounded-xl bg-white/10 px-4 py-3 text-xs"
                    >
                      <span>
                        <span className="block font-semibold">
                          KES {Number(row.amountKes).toLocaleString()}
                        </span>
                        <span className="text-[#afc9bd]">
                          Paystack checkout ·{" "}
                          {new Date(row.createdAt).toLocaleDateString()}
                        </span>
                      </span>
                      <Badge
                        className={`border-0 ${row.status === "paid" ? "bg-[#d7f0df] text-[#34745f]" : row.status === "pending" ? "bg-[#fff4d5] text-[#94701d]" : "bg-[#ffe3df] text-[#a44e49]"}`}
                      >
                        {row.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-xl bg-white/10 p-5 text-sm text-[#c7dbd2]">
                  No wallet top-ups have been recorded yet.
                </div>
              )}
            </div>
            <Button
              variant="outline"
              className="mt-8 w-full rounded-full border-white/20 bg-transparent text-white hover:bg-white/10"
              onClick={() => jumpTo("admin-operations")}
            >
              Open payment review
            </Button>
          </section>
        </div>

        <section
          id="admin-maintenance"
          className={`scroll-mt-6 mt-8 rounded-3xl border border-[#dfe9e3] bg-white p-6 shadow-sm transition ${activeSection !== "maintenance" ? "hidden" : "ring-2 ring-[#b8d8c8] ring-offset-4"}`}
        >
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
            <div>
              <p className="section-eyebrow">Operations desk</p>
              <h2 className="mt-1 font-serif text-2xl font-semibold text-[#173e35]">
                Maintenance &amp; live checks
              </h2>
              <p className="mt-1 max-w-2xl text-xs leading-5 text-[#82958e]">
                Review service status before publishing papers or accepting
                payments. No live charge is initiated by this health check.
              </p>
            </div>
            <Badge
              className={`w-fit border-0 ${operational.data?.maintenanceMode ? "bg-[#fff4d5] text-[#94701d]" : "bg-[#e5f2eb] text-[#34745f]"}`}
            >
              {operational.isLoading
                ? "Checking"
                : operational.data?.maintenanceMode
                  ? "Maintenance mode"
                  : "Operational"}
            </Badge>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl bg-[#f5f9f6] p-4">
              <div className="text-xs font-semibold text-[#789087]">
                Environment
              </div>
              <div className="mt-2 font-semibold capitalize text-[#173e35]">
                {operational.data?.environment ?? "—"}
              </div>
              <div className="mt-1 text-[11px] text-[#82958e]">
                Server runtime
              </div>
            </div>
            <div className="rounded-2xl bg-[#f5f9f6] p-4">
              <div className="text-xs font-semibold text-[#789087]">
                Database
              </div>
              <div className="mt-2 flex items-center gap-2 font-semibold capitalize text-[#34745f]">
                <CheckCircle2 size={15} />
                {operational.data?.database ?? "Checking"}
              </div>
              <div className="mt-1 text-[11px] text-[#82958e]">
                MongoDB ping
              </div>
            </div>
            <div className="rounded-2xl bg-[#f5f9f6] p-4">
              <div className="text-xs font-semibold text-[#789087]">
                Paystack mode
              </div>
              <div className="mt-2 font-semibold capitalize text-[#173e35]">
                {operational.data?.paystack.mode ?? "—"}
              </div>
              <div className="mt-1 text-[11px] text-[#82958e]">
                Secret/public key match required
              </div>
            </div>
            <div className="rounded-2xl bg-[#f5f9f6] p-4">
              <div className="text-xs font-semibold text-[#789087]">
                Checkout flow
              </div>
              <div className="mt-2 font-semibold text-[#173e35]">Hosted</div>
              <div className="mt-1 text-[11px] text-[#82958e]">
                Paystack authorization URL
              </div>
            </div>
          </div>
          <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_.9fr]">
            <div className="rounded-2xl border border-[#edf2ef] p-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-[#274d43]">
                  Paystack readiness
                </h3>
                <Badge
                  className={`border-0 ${operational.data?.paystack.ready ? "bg-[#e5f2eb] text-[#34745f]" : "bg-[#fff4d5] text-[#94701d]"}`}
                >
                  {operational.isLoading
                    ? "Checking"
                    : operational.data?.paystack.ready
                      ? "Ready"
                      : "Review settings"}
                </Badge>
              </div>
              <p className="mt-2 text-xs text-[#82958e]">
                {operational.data?.paystack.apiMessage ??
                  "Checking secure Paystack API connectivity…"}
              </p>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {Object.entries(operational.data?.paystack.checks ?? {}).map(
                  ([name, passed]) => (
                    <div
                      key={name}
                      className="flex items-center gap-2 text-xs text-[#607a70]"
                    >
                      <span
                        className={`grid h-5 w-5 place-items-center rounded-full ${passed ? "bg-[#e5f2eb] text-[#34745f]" : "bg-[#fff4d5] text-[#94701d]"}`}
                      >
                        {passed ? (
                          <CheckCircle2 size={13} />
                        ) : (
                          <AlertTriangle size={13} />
                        )}
                      </span>
                      <span className="capitalize">
                        {name.replace(/([A-Z])/g, " $1")}
                      </span>
                    </div>
                  )
                )}
              </div>
            </div>
            <div className="rounded-2xl bg-[#173f36] p-5 text-[#edf7f1]">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <ShieldCheck size={16} className="text-[#e5c66f]" /> Security
                posture
              </div>
              <p className="mt-3 text-xs leading-5 text-[#b5cec2]">
                Keep secret keys in Vercel server-side environment variables,
                use matching test or live key pairs, and rely on webhook
                signatures plus server verification before granting downloads.
              </p>
            </div>
          </div>
        </section>
        <section
          id="admin-settings"
          className={`scroll-mt-6 mt-8 rounded-3xl border border-[#dfe9e3] bg-white p-6 shadow-sm transition ${activeSection !== "settings" ? "hidden" : "ring-2 ring-[#b8d8c8] ring-offset-4"}`}
        >
          <div className="flex items-start gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#e8f1ed] text-[#2d7965]">
              <ShieldCheck size={18} />
            </div>
            <div>
              <p className="section-eyebrow">Protected configuration</p>
              <h2 className="mt-1 font-serif text-xl font-semibold text-[#173e35]">
                Settings &amp; security
              </h2>
              <p className="mt-1 max-w-2xl text-xs leading-5 text-[#82958e]">
                Security guidance for the administrator workspace. Sensitive
                secrets remain server-side and all management mutations require
                the admin role.
              </p>
            </div>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl bg-[#f5f9f6] p-4">
              <div className="text-xs font-semibold text-[#274d43]">
                Role protection
              </div>
              <div className="mt-1 text-xs leading-5 text-[#82958e]">
                MongoDB role checks protect this workspace and its management
                procedures.
              </div>
            </div>
            <div className="rounded-2xl bg-[#f5f9f6] p-4">
              <div className="text-xs font-semibold text-[#274d43]">
                Secure payments
              </div>
              <div className="mt-1 text-xs leading-5 text-[#82958e]">
                Paystack secrets and webhook validation stay on the server.
              </div>
            </div>
            <div className="rounded-2xl bg-[#f5f9f6] p-4">
              <div className="text-xs font-semibold text-[#274d43]">
                Protected files
              </div>
              <div className="mt-1 text-xs leading-5 text-[#82958e]">
                Paper downloads remain entitlement-gated and storage references
                are audited.
              </div>
            </div>
          </div>
        </section>
        <div
          id="admin-controls"
          className={`scroll-mt-6 rounded-3xl transition ${activeSection !== "catalogue" && activeSection !== "announcements" && activeSection !== "posts" ? "hidden" : "ring-2 ring-[#b8d8c8] ring-offset-4"}`}
        >
          <AdminControls />
        </div>
        <div
          id="admin-operations"
          className={`scroll-mt-6 rounded-3xl transition ${activeSection !== "students" && activeSection !== "payments" && activeSection !== "submissions" ? "hidden" : "ring-2 ring-[#b8d8c8] ring-offset-4"}`}
        >
          <AdminOperations />
        </div>
        <div
          id="storage-management"
          className={`scroll-mt-6 rounded-3xl transition ${activeSection !== "storage" ? "hidden" : "ring-2 ring-[#b8d8c8] ring-offset-4"}`}
        >
          <StorageManagement />
        </div>
      </div>
    </div>
  );
}

export default function Admin() {
  const { loading, user } = useAuth();

  if (loading) {
    return (
      <DashboardLayout>
        <AdminWorkspace />
      </DashboardLayout>
    );
  }

  if (!user) {
    return (
      <DashboardLayout>
        <AdminWorkspace />
      </DashboardLayout>
    );
  }

  if (user.role !== "admin") {
    return <AccessDenied />;
  }

  return (
    <DashboardLayout>
      <AdminWorkspace />
    </DashboardLayout>
  );
}
