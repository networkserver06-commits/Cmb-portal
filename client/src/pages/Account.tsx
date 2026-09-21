import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { filterAndSortLibrary, type LibrarySort } from "@/lib/libraryFilters";
import { educationLevelLabel } from "@shared/educationLevels";
import { resourceTypeLabel } from "@shared/resourceTypes";
import ShareDocumentButton from "@/components/ShareDocumentButton";
import GrokStudyAssistant from "@/components/GrokStudyAssistant";
import PublishPaper from "./PublishPaper";
import { useAuth } from "@/_core/hooks/useAuth";
import { useTheme } from "@/contexts/ThemeContext";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  AlertCircle,
  ArrowLeft,
  ArrowUpDown,
  BadgeCheck,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Download,
  Eye,
  EyeOff,
  FileText,
  Loader2,
  LockKeyhole,
  LogOut,
  MailCheck,
  Receipt,
  ShieldCheck,
  Sun,
  Moon,
  KeyRound,
  Mail,
  UserCircle2,
  LayoutDashboard,
  LifeBuoy,
  UserRound,
  WalletCards,
  Smartphone,
  Search,
  Sparkles,
  X,
} from "lucide-react";

function resourceSharePath(paper: {
  legacyId: number;
  accessMode?: string;
  priceKes?: number;
}) {
  const isFree = paper.accessMode === "free" || Number(paper.priceKes) === 0;
  return isFree
    ? `/paper/${encodeURIComponent(paper.legacyId)}`
    : `/?paper=${encodeURIComponent(paper.legacyId)}#catalogue`;
}

function LoadingLine({ className = "" }: { className?: string }) {
  return (
    <span aria-hidden="true" className={`account-skeleton-line ${className}`} />
  );
}

function AccountLoading() {
  return (
    <div
      className="min-h-screen bg-[#edf4f0] text-[#19312c]"
      aria-busy="true"
      aria-label="Loading your account"
    >
      <header className="border-b border-[#dce6e1] bg-white">
        <div className="container flex h-20 items-center justify-between">
          <LoadingLine className="h-4 w-36" />
          <LoadingLine className="h-3 w-32" />
        </div>
      </header>
      <main className="container grid max-w-5xl gap-10 py-12 md:grid-cols-[.85fr_1.15fr] md:items-center md:py-20">
        <section className="hidden md:block account-reveal">
          <LoadingLine className="h-3 w-28" />
          <LoadingLine className="mt-5 h-12 w-full max-w-md" />
          <LoadingLine className="mt-3 h-12 w-4/5 max-w-sm" />
          <LoadingLine className="mt-7 h-5 w-full max-w-md" />
          <LoadingLine className="mt-3 h-5 w-4/5 max-w-sm" />
        </section>
        <section className="rounded-3xl border border-[#d9e6df] bg-white p-6 shadow-xl shadow-[#1d5146]/8 sm:p-9 account-panel-loading">
          <LoadingLine className="h-10 w-full rounded-full" />
          <LoadingLine className="mt-8 h-9 w-56" />
          <LoadingLine className="mt-3 h-4 w-72" />
          <LoadingLine className="mt-8 h-11 w-full rounded-xl" />
          <LoadingLine className="mt-4 h-11 w-full rounded-xl" />
          <LoadingLine className="mt-4 h-11 w-full rounded-xl" />
          <LoadingLine className="mt-6 h-11 w-full rounded-full" />
        </section>
      </main>
      <p className="sr-only" role="status">
        Checking your account session…
      </p>
    </div>
  );
}

function AdminWorkspaceTransition({
  destination,
}: {
  destination: "administrator" | "student";
}) {
  const isAdmin = destination === "administrator";
  return (
    <div
      className="grid min-h-screen place-items-center bg-[#edf4f0] p-6 text-[#19312c]"
      aria-busy="true"
    >
      <section
        className="w-full max-w-md rounded-3xl border border-[#d9e6df] bg-white p-8 text-center shadow-xl shadow-[#1d5146]/10 account-panel-loading"
        role="status"
        aria-live="polite"
      >
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[#e8f1ed] text-[#2d7965]">
          <Loader2 className="account-spinner" size={24} />
        </div>
        <p className="section-eyebrow mt-6">Secure session ready</p>
        <h1 className="mt-2 font-serif text-3xl font-semibold text-[#173e35]">
          {isAdmin
            ? "Opening administrator workspace"
            : "Opening your study library"}
        </h1>
        <p className="mt-3 text-sm leading-6 text-[#718780]">
          {isAdmin
            ? "Your administrator role was detected. Loading protected management controls…"
            : "Loading your protected student resources…"}
        </p>
        <div className="mt-7 space-y-3" aria-hidden="true">
          <LoadingLine className="mx-auto h-3 w-3/4" />
          <LoadingLine className="mx-auto h-3 w-1/2" />
          <LoadingLine className="mx-auto mt-2 h-11 w-full rounded-full" />
        </div>
        <span className="sr-only">
          Please wait while your authenticated dashboard loads.
        </span>
      </section>
    </div>
  );
}

function LoadingCard({ message }: { message: string }) {
  return (
    <div
      className="rounded-2xl border border-[#dfe9e3] bg-white p-7 account-content-loading"
      aria-busy="true"
    >
      <div className="flex items-center gap-3 text-sm text-[#718780]">
        <Loader2 className="account-spinner h-4 w-4 text-[#4b8876]" />
        {message}
      </div>
      <LoadingLine className="mt-5 h-3 w-2/3" />
      <LoadingLine className="mt-3 h-3 w-1/2" />
    </div>
  );
}

function AccountDashboard({
  user,
  logout,
  loading,
}: {
  user: NonNullable<ReturnType<typeof useAuth>["user"]>;
  logout: () => Promise<void> | void;
  loading: boolean;
}) {
  const library = trpc.student.library.useQuery(undefined);
  const orders = trpc.student.orders.useQuery(undefined);
  const submissions = trpc.student.submissions.useQuery(undefined);
  const wallet = trpc.student.wallet.useQuery(undefined);
  const activity = trpc.student.activity.useQuery(undefined);
  const utils = trpc.useUtils();
  const available = library.data?.filter(item => item.paper) ?? [];
  const [libraryQuery, setLibraryQuery] = useState("");
  const [libraryLevel, setLibraryLevel] = useState("all");
  const [librarySort, setLibrarySort] = useState<LibrarySort>("recent");
  const filteredAvailable = filterAndSortLibrary(available, {
    query: libraryQuery,
    level: libraryLevel === "all" ? "" : libraryLevel,
    sort: librarySort,
  });
  const libraryLevels = Array.from(
    new Set(available.map(item => item.paper?.level).filter(Boolean))
  ).sort((left, right) => String(left).localeCompare(String(right)));
  const hasLibraryFilters =
    Boolean(libraryQuery.trim()) || libraryLevel !== "all";
  const requestedTab = new URLSearchParams(window.location.search).get("tab");
  const initialTab = dashboardTabs.some(tab => tab.id === requestedTab)
    ? (requestedTab as DashboardTab)
    : "overview";
  const [activeTab, setActiveTab] = useState<DashboardTab>(initialTab);
  const [profileName, setProfileName] = useState(user.name ?? "");
  const [profileNotice, setProfileNotice] = useState("");
  const [topupAmount, setTopupAmount] = useState<number | "">("");
  const [phoneNumber, setPhoneNumber] = useState(user.phone ?? "");
  const [topupReference, setTopupReference] = useState(
    () =>
      new URLSearchParams(window.location.search).get("wallet_reference") ?? ""
  );
  const [walletNotice, setWalletNotice] = useState("");
  const [topupInputError, setTopupInputError] = useState("");
  const activeTabDetails =
    dashboardTabs.find(tab => tab.id === activeTab) ?? dashboardTabs[0];
  const { theme, toggleTheme } = useTheme();
  const profileInitial = (user.name || user.email || "S")
    .trim()
    .charAt(0)
    .toUpperCase();
  const formatDate = (value: unknown) => {
    const date =
      value instanceof Date ? value : value ? new Date(String(value)) : null;
    return date && !Number.isNaN(date.getTime())
      ? date.toLocaleDateString(undefined, {
          year: "numeric",
          month: "short",
          day: "numeric",
        })
      : "Not available";
  };
  const walletTopUpStatus = trpc.student.walletTopUpStatus.useQuery(
    { reference: topupReference || "WALLET-0-0-placeholder" },
    { enabled: Boolean(topupReference), refetchInterval: 4000 }
  );
  const initializeWalletTopUp = trpc.student.initializeWalletTopUp.useMutation({
    onSuccess: data => {
      setTopupReference(data.reference);
      setWalletNotice(
        "LeeTec sent an M-Pesa payment prompt to your phone. Approve it to complete the top-up."
      );
    },
    onError: error => setWalletNotice(error.message),
  });
  const updateProfile = trpc.student.updateProfile.useMutation({
    onSuccess: async data => {
      setProfileName(data.name);
      setProfileNotice("Profile name updated securely.");
      await utils.auth.me.invalidate();
    },
    onError: error => setProfileNotice(error.message),
  });
  useEffect(() => {
    if (walletTopUpStatus.data?.status === "paid") {
      setWalletNotice(
        "Top-up confirmed. Your wallet balance has been updated."
      );
      void wallet.refetch();
      void utils.student.wallet.invalidate();
    }
    if (walletTopUpStatus.data?.status === "failed")
      setWalletNotice("The top-up was not completed. You can try again.");
  }, [walletTopUpStatus.data?.status, wallet]);

  return (
    <div className="account-dashboard min-h-screen bg-[#f7f8f6] text-[#19312c] account-route-shell">
      <header className="account-topbar border-b border-[#dce6e1] bg-white">
        <div className="container flex min-h-20 items-center justify-between gap-4">
          <div className="flex items-center gap-2 sm:gap-4">
            <Link
              href="/"
              className="flex items-center gap-2 text-sm font-semibold text-[#1d5146]"
            >
              <ArrowLeft size={16} /> Back to catalogue
            </Link>
            <Link
              href="/account?tab=assistant"
              className="inline-flex items-center gap-1.5 rounded-full border border-[#c8d9d2] px-3 py-2 text-sm font-semibold text-[#1d604f] transition hover:bg-[#e8f1ed]"
            >
              <Sparkles size={15} /> <span className="hidden sm:inline">AI Assistant</span><span className="sm:hidden">AI</span>
            </Link>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={() => toggleTheme?.()}
              className="account-theme-toggle grid h-10 w-10 place-items-center rounded-xl border border-[#c8d9d2] bg-transparent text-[#1d5146] transition hover:-translate-y-0.5 hover:bg-[#e8f1ed] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4b8876]"
              aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
              title={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
            >
              {theme === "light" ? <Moon size={17} /> : <Sun size={17} />}
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="account-profile-trigger flex items-center gap-2 rounded-2xl border border-[#c8d9d2] bg-transparent px-2 py-1.5 text-left transition hover:-translate-y-0.5 hover:bg-[#e8f1ed] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4b8876]"
                  aria-label="Open profile menu"
                >
                  <span className="grid h-8 w-8 place-items-center rounded-xl bg-[#1d5146] text-sm font-bold text-[#e8c979]">
                    {profileInitial}
                  </span>
                  <span className="hidden max-w-32 sm:block">
                    <span className="block truncate text-sm font-semibold text-[#274d43]">
                      {user.name || "Student"}
                    </span>
                    <span className="block truncate text-[11px] text-[#82958e]">
                      {user.role === "admin"
                        ? "Administrator"
                        : "Student account"}
                    </span>
                  </span>
                  <ChevronDown size={15} className="text-[#6c877d]" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64 rounded-2xl p-2">
                <DropdownMenuLabel className="rounded-xl bg-[#f2f7f4] px-3 py-3">
                  <div className="flex items-center gap-3">
                    <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#1d5146] text-base font-bold text-[#e8c979]">
                      {profileInitial}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">
                        {user.name || "Student"}
                      </p>
                      <p className="truncate text-xs font-normal text-muted-foreground">
                        {user.email}
                      </p>
                    </div>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => setActiveTab("account")}
                  className="cursor-pointer rounded-xl py-2.5"
                >
                  <UserCircle2 className="mr-2 h-4 w-4" /> Profile & security
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => toggleTheme?.()}
                  className="cursor-pointer rounded-xl py-2.5"
                >
                  {theme === "light" ? (
                    <Moon className="mr-2 h-4 w-4" />
                  ) : (
                    <Sun className="mr-2 h-4 w-4" />
                  )}{" "}
                  Use {theme === "light" ? "dark" : "light"} mode
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => logout()}
                  disabled={loading}
                  className="cursor-pointer rounded-xl py-2.5 text-destructive focus:text-destructive"
                >
                  {loading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <LogOut className="mr-2 h-4 w-4" />
                  )}
                  {loading ? "Signing out…" : "Sign out"}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <main className="container py-8 md:py-12">
        {user.role === "admin" && (
          <section
            className="mb-8 flex flex-col gap-4 rounded-3xl border border-[#e6d49c] bg-[#fff9e8] p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-6"
            aria-label="Administrator access detected"
          >
            <div className="flex items-start gap-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-[#f3df9d] text-[#7a5b16]">
                <ShieldCheck size={19} />
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#94701d]">
                  Administrator access detected
                </p>
                <p className="mt-1 text-sm leading-6 text-[#7a5b16]">
                  This account has administrator privileges. Open the management
                  workspace to manage resources, students, payments,
                  submissions, announcements, and storage.
                </p>
              </div>
            </div>
            <Link
              href="/admin"
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-[#1d5146] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#153c34]"
            >
              <LayoutDashboard size={16} /> Open admin workspace
            </Link>
          </section>
        )}
        <div
          className="account-workspace-nav mb-8 rounded-[2rem] border border-[#dfe9e3] bg-white p-4 shadow-[0_12px_30px_rgba(29,81,70,0.06)] ring-1 ring-white sm:p-5"
          aria-live="polite"
        >
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[#e8f1ed] text-[#2d7965] shadow-inner shadow-[#2d7965]/5">
                <activeTabDetails.icon size={18} />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#94aaa2]">
                  Student workspace
                </p>
                <p className="mt-0.5 truncate text-base font-bold text-[#274d43]">
                  Choose a destination
                </p>
                <p className="mt-0.5 truncate text-xs text-[#82958e]">
                  {activeTabDetails.label} · {activeTabDetails.description}
                </p>
              </div>
            </div>
            <div className="w-full md:max-w-sm">
              <span className="mb-2 block text-[10px] font-bold uppercase tracking-[0.16em] text-[#94aaa2]">
                Dashboard menu
              </span>
              <DropdownMenu>
              <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="group flex h-14 w-full items-center justify-between gap-3 rounded-2xl border border-[#c8d9d2] bg-[#fbfdfb] px-4 text-left text-sm font-semibold text-[#274d43] shadow-sm outline-none transition duration-200 hover:-translate-y-0.5 hover:border-[#4b8876] hover:bg-white hover:shadow-md focus-visible:ring-4 focus-visible:ring-[#4b8876]/15 data-[state=open]:border-[#4b8876] data-[state=open]:bg-white data-[state=open]:shadow-md"
                    aria-label="Open student dashboard menu"
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#e8f1ed] text-[#2d7965]">
                        <activeTabDetails.icon size={15} />
                      </span>
                      <span className="min-w-0 truncate text-[15px]">{activeTabDetails.label}</span>
                    </span>
                    <ChevronDown
                      size={16}
                      className="shrink-0 text-[#6c877d] transition-transform duration-200 group-data-[state=open]:rotate-180"
                    />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  className="account-menu-content z-50 w-[min(24rem,calc(100vw-2rem))] max-h-[min(70vh,34rem)] overflow-y-auto rounded-[1.35rem] border border-[#dfe9e3] bg-white p-2.5 shadow-[0_20px_50px_rgba(23,62,53,0.16)] ring-1 ring-black/[0.03]"
                >
                  <DropdownMenuLabel className="flex items-center justify-between px-3 pb-2 pt-1 text-[10px] font-bold uppercase tracking-[0.2em] text-[#94aaa2]">
                    <span>Student workspace</span>
                    <span className="rounded-full bg-[#f1f6f3] px-2 py-1 text-[9px] tracking-[0.12em] text-[#6b8f83]">
                      {dashboardTabs.length} tabs
                    </span>
                  </DropdownMenuLabel>
                  {dashboardTabs.map(tab => (
                    <DropdownMenuItem
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`account-menu-item group/item my-0.5 min-h-[4.25rem] cursor-pointer items-center gap-3 rounded-2xl px-3 py-2.5 outline-none transition-all duration-150 data-[highlighted]:bg-[#f4faf6] data-[highlighted]:shadow-sm ${activeTab === tab.id ? "bg-[#e8f1ed] shadow-sm ring-1 ring-[#c8ddd3]" : ""}`}
                    >
                      <span
                        className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl transition-colors ${activeTab === tab.id ? "bg-[#1d5146] text-[#e8c979] shadow-sm" : "bg-[#f4f6f4] text-[#6f8e84] group-data-[highlighted]/item:bg-[#e8f1ed] group-data-[highlighted]/item:text-[#2d7965]"}`}
                      >
                        <tab.icon size={16} />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-[14px] font-bold leading-5 text-[#274d43]">{tab.label}</span>
                        <span className="mt-0.5 block truncate text-xs leading-4 text-[#82958e]">
                          {tab.description}
                        </span>
                      </span>
                      {activeTab === tab.id && (
                        <CheckCircle2
                          size={16}
                          className="ml-auto shrink-0 text-[#34745f]"
                        />
                      )}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
        <div className="min-w-0">
          {activeTab === "assistant" && (
            <section
              className="account-reveal mb-8 rounded-3xl border border-[#c8ddd3] bg-[#f5fbf7] p-5 shadow-sm sm:p-7"
              aria-label="ScholarShelf Assistant"
            >
              <div className="mb-5">
                <p className="section-eyebrow">AI Assistant</p>
                <h1 className="mt-2 font-serif text-4xl font-semibold tracking-tight text-[#173e35]">
                  Your dedicated study desk
                </h1>
                <p className="mt-3 max-w-xl text-[#718780]">
                  Ask, learn, and revise with ScholarShelf Assistant without leaving your private student dashboard.
                </p>
              </div>
              <GrokStudyAssistant />
            </section>
          )}
          <section
            className={`account-reveal mb-8 rounded-[2rem] border border-[#c8ddd3] bg-white p-5 shadow-[0_12px_30px_rgba(29,81,70,0.06)] sm:p-8 ${activeTab !== "app" ? "hidden" : ""}`}
            aria-label="ScholarShelf Android app"
          >
            <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
              <div className="flex min-w-0 items-start gap-4">
                <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-[#1d5146] text-[#e8c979] shadow-sm">
                  <Smartphone size={25} />
                </div>
                <div>
                  <p className="section-eyebrow">ScholarShelf mobile</p>
                  <h1 className="mt-2 font-serif text-3xl font-semibold tracking-tight text-[#173e35] sm:text-4xl">
                    Install the ScholarShelf app
                  </h1>
                  <p className="mt-3 max-w-2xl text-sm leading-6 text-[#718780]">
                    Keep your library, dashboard, and ScholarShelf Assistant close at hand with the Android app installation guide.
                  </p>
                </div>
              </div>
              <Link
                href="/app"
                className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-[#1d5146] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#153c34] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#1d5146]/15"
              >
                <Download size={16} /> Open install guide
              </Link>
            </div>
            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-[#dfe9e3] bg-[#f7fbf8] p-4">
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#94aaa2]">Platform</p>
                <p className="mt-2 font-semibold text-[#274d43]">Android 7.0+</p>
                <p className="mt-1 text-xs leading-5 text-[#82958e]">Designed for phones and tablets.</p>
              </div>
              <div className="rounded-2xl border border-[#dfe9e3] bg-[#f7fbf8] p-4">
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#94aaa2]">Includes</p>
                <p className="mt-2 font-semibold text-[#274d43]">Library + AI Assistant</p>
                <p className="mt-1 text-xs leading-5 text-[#82958e]">Your study tools in one focused app.</p>
              </div>
              <div className="rounded-2xl border border-[#dfe9e3] bg-[#f7fbf8] p-4">
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#94aaa2]">Install help</p>
                <p className="mt-2 font-semibold text-[#274d43]">Step-by-step guide</p>
                <p className="mt-1 text-xs leading-5 text-[#82958e]">Permission and troubleshooting steps included.</p>
              </div>
            </div>
            <div className="mt-5 flex flex-col gap-3 rounded-2xl border border-[#e6d49c] bg-[#fff9e8] p-4 text-sm text-[#7a5b16] sm:flex-row sm:items-center sm:justify-between">
              <p className="leading-6"><strong>Ready to install?</strong> Open the guide to download the published Android package and follow the four steps.</p>
              <Link href="/app" className="inline-flex shrink-0 items-center justify-center rounded-full border border-[#d6b95e] px-4 py-2 text-xs font-bold text-[#7a5b16] transition hover:bg-[#fff3c9]">
                View instructions
              </Link>
            </div>
          </section>
          <section
            className={`account-reveal flex flex-col justify-between gap-6 md:flex-row md:items-end ${activeTab !== "overview" ? "hidden" : ""}`}
          >
            <div>
              <p className="section-eyebrow">Student dashboard</p>
              <h1 className="account-dashboard-heading mt-2 font-serif text-4xl font-semibold tracking-tight text-[#173e35]">
                Your study library
              </h1>
              <p className="account-dashboard-description mt-3 max-w-xl text-[#718780]">
                Track every payment and download the resources unlocked for your
                account.
              </p>
            </div>
            <div className="flex items-center gap-2 rounded-full bg-[#e5f2eb] px-4 py-2 text-xs font-semibold text-[#34745f]">
              <ShieldCheck size={15} /> Private account access
            </div>
          </section>

          <section
            className={`mt-10 grid gap-4 sm:grid-cols-3 account-reveal account-reveal-delay-1 ${activeTab !== "overview" ? "hidden" : ""}`}
          >
            <div className="account-summary-card rounded-2xl border border-[#dfe9e3] bg-white p-5 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-md">
              <div className="text-xs font-semibold uppercase tracking-widest text-[#94aaa2]">
                Available downloads
              </div>
              <div className="mt-2 font-serif text-3xl font-semibold text-[#173e35]">
                {library.isLoading ? "—" : available.length}
              </div>
            </div>
            <div className="account-summary-card rounded-2xl border border-[#dfe9e3] bg-white p-5 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-md">
              <div className="text-xs font-semibold uppercase tracking-widest text-[#94aaa2]">
                Purchase history
              </div>
              <div className="mt-2 font-serif text-3xl font-semibold text-[#173e35]">
                {orders.isLoading ? "—" : (orders.data?.length ?? 0)}
              </div>
            </div>
            <div className="account-summary-card rounded-2xl border border-[#dfe9e3] bg-white p-5 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-md">
              <div className="text-xs font-semibold uppercase tracking-widest text-[#94aaa2]">
                Access status
              </div>
              <div className="mt-3 flex items-center gap-2 text-sm font-semibold text-[#34745f]">
                <CheckCircle2 size={17} /> Secure and active
              </div>
            </div>
          </section>

          <section
            className={`mt-12 account-reveal account-reveal-delay-2 ${activeTab !== "downloads" ? "hidden" : ""}`}
          >
            <div className="mb-4 flex items-center justify-between gap-4">
              <div>
                <p className="section-eyebrow">Unlocked resources</p>
                <h2 className="mt-1 font-serif text-2xl font-semibold text-[#173e35]">
                  Available downloads
                </h2>
              </div>
              <Badge className="shrink-0 border-0 bg-[#e5f2eb] text-[#34745f]">
                {library.isLoading
                  ? "— resources"
                  : `${filteredAvailable.length} ${filteredAvailable.length === 1 ? "resource" : "resources"}`}
              </Badge>
            </div>
            {library.isLoading ? (
              <LoadingCard message="Loading your available downloads…" />
            ) : available.length ? (
              <>
                <div className="mb-5 rounded-3xl border border-[#dfe9e3] bg-white p-4 shadow-sm sm:p-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="flex items-center gap-2 text-sm font-semibold text-[#274d43]">
                        <Search size={16} className="text-[#4b8876]" /> Find a
                        resource
                      </p>
                      <p className="mt-1 text-xs text-[#82958e]">
                        Search your unlocked resources or narrow them by level.
                      </p>
                    </div>
                    {hasLibraryFilters && (
                      <button
                        type="button"
                        onClick={() => {
                          setLibraryQuery("");
                          setLibraryLevel("all");
                        }}
                        className="inline-flex items-center gap-1.5 self-start rounded-full border border-[#c8d9d2] px-3 py-1.5 text-xs font-semibold text-[#34745f] transition hover:bg-[#e8f1ed] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4b8876]"
                        aria-label="Clear library filters"
                      >
                        <X size={13} /> Clear filters
                      </button>
                    )}
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1.5fr)_minmax(10rem,0.8fr)_minmax(10rem,0.8fr)]">
                    <label className="block">
                      <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.14em] text-[#94aaa2]">
                        Search
                      </span>
                      <span className="relative block">
                        <Search
                          size={16}
                          aria-hidden="true"
                          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#82958e]"
                        />
                        <Input
                          value={libraryQuery}
                          onChange={event =>
                            setLibraryQuery(event.target.value)
                          }
                          placeholder="Title, course, unit, or cycle"
                          aria-label="Search unlocked resources"
                          className="h-11 rounded-2xl border-[#c8d9d2] bg-[#fbfdfb] pl-9 text-sm shadow-none focus-visible:ring-[#4b8876]"
                        />
                      </span>
                    </label>
                    <label className="block">
                      <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.14em] text-[#94aaa2]">
                        Education level
                      </span>
                      <select
                        value={libraryLevel}
                        onChange={event => setLibraryLevel(event.target.value)}
                        aria-label="Filter by education level"
                        className="h-11 w-full rounded-2xl border border-[#c8d9d2] bg-[#fbfdfb] px-3 text-sm text-[#274d43] outline-none transition focus:border-[#4b8876] focus:ring-2 focus:ring-[#4b8876]/25"
                      >
                        <option value="all">All levels</option>
                        {libraryLevels.map(level => (
                          <option key={String(level)} value={String(level)}>
                            {educationLevelLabel(String(level))}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block">
                      <span className="mb-1.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-[#94aaa2]">
                        <ArrowUpDown size={12} /> Sort by
                      </span>
                      <select
                        value={librarySort}
                        onChange={event =>
                          setLibrarySort(event.target.value as LibrarySort)
                        }
                        aria-label="Sort unlocked resources"
                        className="h-11 w-full rounded-2xl border border-[#c8d9d2] bg-[#fbfdfb] px-3 text-sm text-[#274d43] outline-none transition focus:border-[#4b8876] focus:ring-2 focus:ring-[#4b8876]/25"
                      >
                        <option value="recent">Recently added</option>
                        <option value="oldest">Oldest first</option>
                        <option value="title">Title A–Z</option>
                      </select>
                    </label>
                  </div>
                  <p
                    className="mt-3 text-xs text-[#718780]"
                    role="status"
                    aria-live="polite"
                  >
                    {hasLibraryFilters
                      ? `${filteredAvailable.length} of ${available.length} resources shown`
                      : `${available.length} ${available.length === 1 ? "resource" : "resources"} in your library`}
                  </p>
                </div>
                {filteredAvailable.length ? (
                  <div className="grid gap-4 md:grid-cols-2">
                    {filteredAvailable.map(item => (
                      <article
                        key={item.entitlement.legacyId}
                        className="account-resource-card flex items-center justify-between gap-4 rounded-2xl border border-[#dfe9e3] bg-white p-5 shadow-sm"
                      >
                        <div className="flex min-w-0 items-center gap-4">
                          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#e8f1ed] text-[#2d7965]">
                            <FileText size={19} />
                          </div>
                          <div className="min-w-0">
                            <h3 className="truncate font-medium text-[#274d43]">
                              {item.paper!.title}
                            </h3>
                            <p className="mt-1 text-xs text-[#82958e]">
                              {resourceTypeLabel(item.paper!.documentType)} ·{" "}
                              {item.paper!.unit} ·{" "}
                              {educationLevelLabel(item.paper!.level)} ·{" "}
                              {item.paper!.cycle}
                            </p>
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <ShareDocumentButton
                            title={item.paper!.title}
                            url={new URL(
                              resourceSharePath(item.paper!),
                              window.location.origin
                            ).toString()}
                            compact
                          />
                          <a
                            href={`/api/papers/${item.paper!.legacyId}/view`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1.5 rounded-full border border-[#c8d9d2] bg-white px-3 py-2 text-xs font-semibold text-[#1d5146] transition hover:bg-[#e8f1ed]"
                          >
                            <Eye size={14} /> View
                          </a>
                          <a
                            href={`/api/papers/${item.paper!.legacyId}/download`}
                            className="inline-flex items-center gap-1.5 rounded-full bg-[#1d5146] px-3 py-2 text-xs font-semibold text-white transition hover:bg-[#153c34]"
                          >
                            <Download size={14} /> Download
                          </a>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-[#cdded7] bg-white p-10 text-center account-empty-state">
                    <Search className="mx-auto h-9 w-9 text-[#9bb9ab]" />
                    <p className="mt-4 text-sm text-[#718780]">
                      No unlocked resources match these filters.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setLibraryQuery("");
                        setLibraryLevel("all");
                      }}
                      className="mt-5 inline-flex rounded-full bg-[#1d5146] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#153c34] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4b8876]"
                    >
                      Show all resources
                    </button>
                  </div>
                )}
              </>
            ) : (
              <div className="rounded-2xl border border-dashed border-[#cdded7] bg-white p-10 text-center account-empty-state">
                <FileText className="mx-auto h-9 w-9 text-[#9bb9ab]" />
                <p className="mt-4 text-sm text-[#718780]">
                  Your purchased resources will appear here after payment is
                  confirmed.
                </p>
                <Link
                  href="/"
                  className="mt-5 inline-flex rounded-full bg-[#1d5146] px-5 py-2.5 text-sm font-semibold text-white"
                >
                  Browse catalogue
                </Link>
              </div>
            )}
          </section>

          <section
            className={`mt-12 account-reveal account-reveal-delay-3 ${activeTab !== "purchases" ? "hidden" : ""}`}
          >
            <div className="mb-4 flex items-center gap-2">
              <Receipt size={17} className="text-[#4b8876]" />
              <div>
                <p className="section-eyebrow">Payment records</p>
                <h2 className="mt-1 font-serif text-2xl font-semibold text-[#173e35]">
                  Purchase history
                </h2>
              </div>
            </div>
            <div className="overflow-x-auto rounded-2xl border border-[#dfe9e3] bg-white shadow-sm">
              {orders.isLoading ? (
                <LoadingCard message="Loading purchase history…" />
              ) : (
                <table className="w-full min-w-[620px] text-left text-sm">
                  <thead className="border-b border-[#edf2ef] text-[10px] font-bold uppercase tracking-[0.15em] text-[#9aaca6]">
                    <tr>
                      <th className="px-5 py-4">Reference</th>
                      <th className="px-5 py-4">Paper</th>
                      <th className="px-5 py-4">Amount</th>
                      <th className="px-5 py-4">Status</th>
                      <th className="px-5 py-4">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#edf2ef]">
                    {orders.data?.map(item => (
                      <tr key={item.order.legacyId} className="text-[#506c63]">
                        <td className="px-5 py-4 font-mono text-xs">
                          {item.order.reference}
                        </td>
                        <td className="px-5 py-4">
                          {item.paper?.title ?? "Resource unavailable"}
                        </td>
                        <td className="px-5 py-4">
                          KES {Number(item.order.amountKes).toLocaleString()}
                        </td>
                        <td className="px-5 py-4">
                          <Badge
                            className={`border-0 ${item.order.status === "paid" ? "bg-[#e5f2eb] text-[#34745f]" : "bg-[#fff4d5] text-[#94701d]"}`}
                          >
                            {item.order.status}
                          </Badge>
                        </td>
                        <td className="px-5 py-4">
                          {item.order.status === "paid" && item.paper ? (
                            <a
                              className="font-semibold text-[#1d5146] underline underline-offset-4"
                              href={`/api/papers/${item.paper.legacyId}/download`}
                            >
                              Download
                            </a>
                          ) : (
                            <Link
                              className="font-semibold text-[#1d5146] underline underline-offset-4"
                              href={`/payment-result?reference=${encodeURIComponent(item.order.reference)}`}
                            >
                              View order
                            </Link>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {!orders.isLoading && !orders.data?.length && (
                <div className="p-8 text-center text-sm text-[#718780] account-empty-state">
                  No purchases yet. Your payment references will appear here
                  after checkout.
                </div>
              )}
            </div>
          </section>

          <section
            className={`mt-12 account-reveal account-reveal-delay-4 ${activeTab !== "submissions" ? "hidden" : ""}`}
          >
            <div className="mb-4">
              <p className="section-eyebrow">Your contributions</p>
              <h2 className="mt-1 font-serif text-2xl font-semibold text-[#173e35]">
                Shared documents
              </h2>
            </div>
            {submissions.isLoading ? (
              <LoadingCard message="Loading your submissions…" />
            ) : submissions.data?.length ? (
              <div className="mb-8 space-y-3">
                {submissions.data.map((submission: any) => (
                  <div
                    key={submission.legacyId}
                    className="account-resource-card flex items-center justify-between gap-4 rounded-2xl border border-[#dfe9e3] bg-white p-4"
                  >
                    <div className="min-w-0">
                      <div className="truncate font-medium text-[#274d43]">
                        {submission.title}
                      </div>
                      <div className="mt-1 text-xs text-[#82958e]">
                        {resourceTypeLabel(submission.documentType)} ·{" "}
                        {submission.unit} · Submitted{" "}
                        {new Date(submission.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {submission.status === "approved" &&
                        submission.paperId && (
                          <ShareDocumentButton
                            title={submission.title}
                            url={new URL(
                              `/paper/${submission.paperId}`,
                              window.location.origin
                            ).toString()}
                            compact
                          />
                        )}
                      {submission.fileId &&
                        submission.status !== "rejected" &&
                        !submission.storagePurged && (
                          <a
                            href={`/api/files/${encodeURIComponent(submission.fileId)}/view`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1.5 rounded-full border border-[#c8d9d2] bg-white px-3 py-2 text-xs font-semibold text-[#1d5146] transition hover:bg-[#e8f1ed]"
                          >
                            <Eye size={14} /> View
                          </a>
                        )}
                      <Badge
                        className={`shrink-0 border-0 ${submission.status === "approved" ? "bg-[#e5f2eb] text-[#34745f]" : submission.status === "rejected" ? "bg-[#fff4f3] text-[#a44e49]" : "bg-[#fff4d5] text-[#94701d]"}`}
                      >
                        {submission.status === "approved"
                          ? submission.approvalMode === "automatic"
                            ? "published"
                            : "approved"
                          : submission.status === "pending" &&
                              submission.safetyStatus === "held"
                            ? "held for review"
                            : submission.status}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mb-8 rounded-2xl border border-dashed border-[#cdded7] bg-white p-6 text-sm text-[#718780] account-empty-state">
                You have not shared a document yet.
              </div>
            )}
            <PublishPaper onSubmitted={() => submissions.refetch()} />
          </section>

          <section
            className={`mt-12 account-reveal ${activeTab !== "activity" ? "hidden" : ""}`}
          >
            <div className="mb-4 flex items-end justify-between gap-4">
              <div>
                <p className="section-eyebrow">Protected records</p>
                <h2 className="mt-1 font-serif text-2xl font-semibold text-[#173e35]">
                  Your account activity
                </h2>
                <p className="mt-2 text-sm text-[#718780]">
                  Review recent upload, download, and account workflow events
                  tied to your authenticated profile.
                </p>
              </div>
              <Badge className="border-0 bg-[#e8f1ed] text-[#34745f]">
                Private history
              </Badge>
            </div>
            <div className="rounded-2xl border border-[#dfe9e3] bg-white p-5 shadow-sm">
              {activity.isLoading ? (
                <LoadingCard message="Loading protected activity…" />
              ) : activity.data?.length ? (
                <div className="space-y-2">
                  {activity.data.map((record: any) => (
                    <div
                      key={String(record._id)}
                      className="flex items-center justify-between gap-4 rounded-xl bg-[#f7faf8] px-4 py-3"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold capitalize text-[#274d43]">
                          {String(record.eventType).replace(/\./g, " · ")}
                        </p>
                        <p className="mt-1 text-xs text-[#82958e]">
                          {record.subjectType
                            ? `${record.subjectType} record`
                            : "Portal activity"}
                        </p>
                      </div>
                      <time className="shrink-0 text-xs text-[#82958e]">
                        {record.createdAt
                          ? new Date(record.createdAt).toLocaleString()
                          : "—"}
                      </time>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-[#cdded7] p-8 text-center text-sm text-[#82958e]">
                  Your protected activity will appear here after you use the
                  portal.
                </div>
              )}
            </div>
          </section>

          <section
            className={`mt-12 account-reveal ${activeTab !== "wallet" ? "hidden" : ""}`}
          >
            <div className="mb-4 flex items-end justify-between gap-4">
              <div>
                <p className="section-eyebrow">Wallet & funds</p>
                <h2 className="mt-1 font-serif text-2xl font-semibold text-[#173e35]">
                  Add funds with LeeTec
                </h2>
              </div>
              <WalletCards className="text-[#4b8876]" size={22} />
            </div>
            <div className="rounded-3xl border border-[#c8d9d2] bg-[#e8f1ed] p-6 sm:p-8">
              <div className="flex flex-wrap items-end justify-between gap-5">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#5f8175]">
                    Available balance
                  </p>
                  <p className="mt-2 font-serif text-4xl font-semibold text-[#173e35]">
                    KES {Number(wallet.data?.balanceKes ?? 0).toLocaleString()}
                  </p>
                  <p className="mt-2 text-sm text-[#648078]">
                    {wallet.data?.totalTopUps ?? 0} confirmed top-ups
                  </p>
                  <p className="mt-1 max-w-xs text-xs leading-5 text-[#718780]">
                    Pending or failed payments are not included until LeeTec
                    confirms them.
                  </p>
                </div>
                <div className="grid h-12 w-12 place-items-center rounded-2xl bg-white text-[#2d7965]">
                  <WalletCards size={22} />
                </div>
              </div>
              <form
                className="mt-8 grid gap-4 md:grid-cols-[1fr_auto] md:items-end"
                onSubmit={event => {
                  event.preventDefault();
                  setWalletNotice("");
                  const amount = Number(topupAmount);
                  if (
                    !Number.isInteger(amount) ||
                    amount < 10 ||
                    amount > 150000
                  )
                    return setTopupInputError(
                      "Enter an amount between KES 10 and KES 150,000."
                    );
                  setTopupInputError("");
                  initializeWalletTopUp.mutate({ amountKes: amount, phoneNumber });
                }}
              >
                <label className="block text-sm font-semibold text-[#274d43]">
                  Kenyan phone number
                  <Input
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    value={phoneNumber}
                    onChange={event => {
                      setPhoneNumber(event.target.value);
                      setTopupInputError("");
                    }}
                    placeholder="0712 345 678"
                    className="mt-2 h-12 rounded-2xl border-[#c8d9d2] bg-white"
                  />
                </label>
                <label className="block text-sm font-semibold text-[#274d43]">
                  Amount (KES)
                  <Input
                    type="number"
                    min={10}
                    max={150000}
                    step={1}
                    value={topupAmount}
                    onChange={event => {
                      setTopupAmount(Number(event.target.value));
                      setTopupInputError("");
                    }}
                    className="mt-2 h-12 rounded-2xl border-[#c8d9d2] bg-white"
                  />
                </label>
                <Button
                  type="submit"
                  disabled={initializeWalletTopUp.isPending}
                  className="h-12 rounded-full bg-[#1d5146] px-6 hover:bg-[#153c34]"
                >
                  {initializeWalletTopUp.isPending ? (
                    <Loader2 className="account-spinner" size={16} />
                  ) : (
                    <Smartphone size={16} />
                  )}
                  {initializeWalletTopUp.isPending ? "Starting…" : "Add funds"}
                </Button>
              </form>
              {topupInputError && (
                <p
                  role="alert"
                  className="mt-3 text-xs font-medium text-[#a44e49]"
                >
                  {topupInputError}
                </p>
              )}
              <p className="mt-4 text-xs leading-5 text-[#648078]">
                LeeTec will send an M-Pesa prompt to your phone. The portal
                confirms the payment from LeeTec transaction history before your
                wallet balance changes.
              </p>
              {walletNotice && (
                <p
                  role="status"
                  aria-live="polite"
                  className={`mt-4 rounded-2xl px-4 py-3 text-sm ${walletTopUpStatus.data?.status === "paid" ? "bg-white text-[#34745f]" : "bg-[#fff9e8] text-[#7a5b16]"}`}
                >
                  {walletNotice}
                </p>
              )}
            </div>
            <div className="mt-6 rounded-2xl border border-[#dfe9e3] bg-white p-5">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#94aaa2]">
                  Recent wallet activity
                </p>
                <Badge className="border-0 bg-[#e5f2eb] text-[#34745f]">
                  Secure ledger
                </Badge>
              </div>
              {wallet.isLoading ? (
                <LoadingCard message="Loading wallet activity…" />
              ) : wallet.data?.transactions.length ? (
                <div className="space-y-2">
                  {wallet.data.transactions.map(transaction => (
                    <div
                      key={transaction.legacyId}
                      className="flex items-center justify-between gap-3 rounded-xl bg-[#f7faf8] px-4 py-3 text-sm"
                    >
                      <span>
                        <span className="block font-semibold text-[#274d43]">
                          LeeTec wallet top-up
                        </span>
                        <span className="text-xs text-[#82958e]">
                          {new Date(transaction.createdAt).toLocaleString()}
                        </span>
                      </span>
                      <span className="flex shrink-0 flex-col items-end gap-1">
                        <span
                          className={`font-semibold ${transaction.status === "paid" ? "text-[#34745f]" : transaction.status === "pending" ? "text-[#94701d]" : "text-[#a44e49]"}`}
                        >
                          {transaction.status === "paid" ? "+" : ""}KES{" "}
                          {Number(transaction.amountKes).toLocaleString()}
                        </span>
                        <span
                          className={`text-[10px] font-semibold uppercase tracking-[0.14em] ${transaction.status === "paid" ? "text-[#34745f]" : transaction.status === "pending" ? "text-[#94701d]" : "text-[#a44e49]"}`}
                        >
                          {transaction.status === "paid"
                            ? "Confirmed"
                            : transaction.status === "pending"
                              ? "Pending"
                              : "Failed"}
                        </span>
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-[#718780]">
                  Your wallet activity will appear here after a confirmed
                  top-up.
                </p>
              )}
            </div>
          </section>

          <section
            className={`mt-12 account-reveal ${activeTab !== "account" ? "hidden" : ""}`}
          >
            <div className="mb-6 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
              <div>
                <p className="section-eyebrow">Account settings</p>
                <h2 className="mt-1 font-serif text-2xl font-semibold text-[#173e35]">
                  Profile & security
                </h2>
                <p className="mt-2 max-w-xl text-sm text-[#718780]">
                  Review your identity, account status, and access preferences
                  in one place.
                </p>
              </div>
              <Badge className="w-fit border-0 bg-[#e5f2eb] text-[#34745f]">
                <BadgeCheck size={14} className="mr-1.5" /> Account active
              </Badge>
            </div>
            <div className="grid gap-5 lg:grid-cols-[1.15fr_.85fr]">
              <div className="rounded-3xl border border-[#dfe9e3] bg-white p-6 shadow-sm sm:p-7">
                <div className="flex flex-wrap items-center gap-4">
                  <div className="grid h-16 w-16 place-items-center rounded-2xl bg-[#1d5146] text-2xl font-bold text-[#e8c979]">
                    {profileInitial}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#94aaa2]">
                      Personal profile
                    </p>
                    <h3 className="mt-1 truncate font-serif text-2xl font-semibold text-[#173e35]">
                      {user.name || "Student"}
                    </h3>
                    <p className="mt-1 truncate text-sm text-[#718780]">
                      {user.email}
                    </p>
                  </div>
                </div>
                <div className="mt-7 grid gap-4 border-t border-[#edf2ef] pt-5 sm:grid-cols-2">
                  <div className="flex items-start gap-3">
                    <Mail className="mt-0.5 h-4 w-4 shrink-0 text-[#4b8876]" />
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#94aaa2]">
                        Email address
                      </p>
                      <p className="mt-1 break-all text-sm font-medium text-[#274d43]">
                        {user.email || "Not available"}
                      </p>
                      <p className="mt-1 text-xs text-[#718780]">
                        Used for account notices and recovery.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <UserRound className="mt-0.5 h-4 w-4 shrink-0 text-[#4b8876]" />
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#94aaa2]">
                        Account type
                      </p>
                      <p className="mt-1 text-sm font-medium capitalize text-[#274d43]">
                        {user.role === "admin" ? "Administrator" : "Student"}
                      </p>
                      <p className="mt-1 text-xs text-[#718780]">
                        Role-based access is enforced securely.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-[#4b8876]" />
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#94aaa2]">
                        Member since
                      </p>
                      <p className="mt-1 text-sm font-medium text-[#274d43]">
                        {formatDate(user.createdAt)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-[#4b8876]" />
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#94aaa2]">
                        Last activity
                      </p>
                      <p className="mt-1 text-sm font-medium text-[#274d43]">
                        {formatDate(user.lastSignedIn)}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
              <div className="space-y-5">
                <div className="rounded-3xl border border-[#dfe9e3] bg-white p-6 shadow-sm">
                  <div className="flex items-center gap-3">
                    <div className="grid h-10 w-10 place-items-center rounded-xl bg-[#fff4d5] text-[#94701d]">
                      <KeyRound size={18} />
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-widest text-[#94aaa2]">
                        Password & access
                      </p>
                      <p className="mt-1 font-semibold text-[#274d43]">
                        Keep your access protected
                      </p>
                    </div>
                  </div>
                  <p className="mt-4 text-sm leading-6 text-[#718780]">
                    Reset your password anytime. Your private downloads and
                    wallet history remain protected by your authenticated
                    session.
                  </p>
                  <Link
                    href="/reset-password"
                    className="mt-5 inline-flex items-center gap-2 font-semibold text-[#1d5146] underline underline-offset-4"
                  >
                    <LockKeyhole size={15} /> Reset password
                  </Link>
                </div>
                <div className="rounded-3xl border border-[#dfe9e3] bg-white p-6 shadow-sm">
                  <div className="flex items-center gap-3">
                    <div className="grid h-10 w-10 place-items-center rounded-xl bg-[#e8f1ed] text-[#2d7965]">
                      {theme === "light" ? (
                        <Sun size={18} />
                      ) : (
                        <Moon size={18} />
                      )}
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-widest text-[#94aaa2]">
                        Appearance
                      </p>
                      <p className="mt-1 font-semibold text-[#274d43]">
                        {theme === "light" ? "Light mode" : "Dark mode"}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleTheme?.()}
                    className="mt-5 inline-flex items-center gap-2 rounded-full border border-[#c8d9d2] px-4 py-2 text-sm font-semibold text-[#1d5146] transition hover:bg-[#e8f1ed] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4b8876]"
                  >
                    {theme === "light" ? <Moon size={15} /> : <Sun size={15} />}{" "}
                    Switch to {theme === "light" ? "dark" : "light"} mode
                  </button>
                </div>
              </div>
            </div>
          </section>

          <section
            className={`mt-6 account-reveal ${activeTab !== "account" ? "hidden" : ""}`}
          >
            <div className="rounded-3xl border border-[#dfe9e3] bg-white p-6 shadow-sm sm:p-7">
              <div className="flex items-center gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-[#e8f1ed] text-[#2d7965]">
                  <UserCircle2 size={18} />
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#94aaa2]">
                    Editable profile
                  </p>
                  <p className="mt-1 font-semibold text-[#274d43]">
                    Update how your account appears
                  </p>
                </div>
              </div>
              <form
                className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end"
                onSubmit={event => {
                  event.preventDefault();
                  setProfileNotice("");
                  if (profileName.trim().length < 2)
                    return setProfileNotice(
                      "Use a display name with at least 2 characters."
                    );
                  updateProfile.mutate({ name: profileName.trim() });
                }}
              >
                <label className="block min-w-0 flex-1 text-sm font-semibold text-[#274d43]">
                  Display name
                  <Input
                    value={profileName}
                    maxLength={120}
                    disabled={updateProfile.isPending}
                    onChange={event => setProfileName(event.target.value)}
                    className="mt-2 h-11 rounded-2xl border-[#c8d9d2] bg-white"
                  />
                </label>
                <Button
                  type="submit"
                  disabled={
                    updateProfile.isPending ||
                    profileName.trim() === (user.name ?? "").trim()
                  }
                  className="h-11 rounded-full bg-[#1d5146] px-5 hover:bg-[#153c34]"
                >
                  {updateProfile.isPending ? (
                    <Loader2 className="account-spinner" size={16} />
                  ) : (
                    <CheckCircle2 size={16} />
                  )}
                  {updateProfile.isPending ? "Saving…" : "Save profile"}
                </Button>
              </form>
              {profileNotice && (
                <p
                  role="status"
                  aria-live="polite"
                  className={`mt-3 text-sm ${profileNotice === "Profile name updated securely." ? "text-[#34745f]" : "text-[#a44e49]"}`}
                >
                  {profileNotice}
                </p>
              )}
              <p className="mt-3 text-xs leading-5 text-[#82958e]">
                Your email remains the verified sign-in address and cannot be
                changed from this screen.
              </p>
            </div>
          </section>

          <section
            className={`mt-12 account-reveal ${activeTab !== "support" ? "hidden" : ""}`}
          >
            <div className="mb-4">
              <p className="section-eyebrow">Member support</p>
              <h2 className="mt-1 font-serif text-2xl font-semibold text-[#173e35]">
                How can we help?
              </h2>
            </div>
            <div className="rounded-2xl border border-[#dfe9e3] bg-[#e8f1ed] p-6">
              <p className="max-w-xl text-sm leading-6 text-[#5f786f]">
                For account, verification, payment, or download assistance,
                contact support with your payment reference or the email used
                for your account.
              </p>
              <a
                href="https://wa.me/254116553618?text=Hello%20ScholarShelf%20support%2C%20I%20need%20help%20with%20my%20account."
                target="_blank"
                rel="noreferrer"
                className="mt-5 inline-flex items-center gap-2 rounded-full bg-[#1d5146] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#153c34]"
                aria-label="Contact ScholarShelf support on WhatsApp at plus 254 116 553 618"
              >
                <LifeBuoy size={16} /> Contact WhatsApp support
              </a>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

type AccountMode = "login" | "create";
type DashboardTab =
  | "overview"
  | "assistant"
  | "app"
  | "downloads"
  | "purchases"
  | "submissions"
  | "activity"
  | "wallet"
  | "account"
  | "support";

const dashboardTabs: Array<{
  id: DashboardTab;
  label: string;
  description: string;
  icon: typeof LayoutDashboard;
}> = [
  {
    id: "overview",
    label: "Overview",
    description: "Your study snapshot",
    icon: LayoutDashboard,
  },
  {
    id: "assistant",
    label: "AI Assistant",
    description: "ScholarShelf study help",
    icon: Sparkles,
  },
  {
    id: "app",
    label: "ScholarShelf App",
    description: "Install the Android app",
    icon: Smartphone,
  },
  {
    id: "downloads",
    label: "Downloads",
    description: "Unlocked resources",
    icon: Download,
  },
  {
    id: "purchases",
    label: "Purchase history",
    description: "Payment records",
    icon: Receipt,
  },
  {
    id: "submissions",
    label: "Submissions",
    description: "Your shared documents",
    icon: FileText,
  },
  {
    id: "activity",
    label: "Activity",
    description: "Protected account history",
    icon: Clock3,
  },
  {
    id: "wallet",
    label: "Wallet & funds",
    description: "Add wallet funds securely",
    icon: WalletCards,
  },
  {
    id: "account",
    label: "Account & security",
    description: "Profile and access",
    icon: UserRound,
  },
  {
    id: "support",
    label: "Support",
    description: "Get help quickly",
    icon: LifeBuoy,
  },
];

const RESEND_COOLDOWN_SECONDS = 60;

function getSafeReturnTo() {
  const candidate = new URLSearchParams(window.location.search).get("returnTo");
  if (!candidate || !candidate.startsWith("/") || candidate.startsWith("//"))
    return null;
  try {
    const url = new URL(candidate, window.location.origin);
    if (url.origin !== window.location.origin) return null;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}

function getPasswordStrength(password: string) {
  const checks = [
    password.length >= 8,
    /[a-z]/.test(password),
    /[A-Z]/.test(password),
    /\d/.test(password),
    /[^A-Za-z0-9]/.test(password),
  ];
  const score = checks.filter(Boolean).length;
  const labels = ["Not started", "Very weak", "Weak", "Fair", "Good", "Strong"];
  return { score, checks, label: labels[score] };
}

export default function Account({
  initialMode = "login",
}: {
  initialMode?: AccountMode;
}) {
  const { user, isAuthenticated, loading, logout } = useAuth();
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const [mode, setMode] = useState<AccountMode>(initialMode);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [verificationEmail, setVerificationEmail] = useState("");
  const [verificationUrl, setVerificationUrl] = useState("");
  const [verificationNotice, setVerificationNotice] = useState("");
  const [unverifiedLogin, setUnverifiedLogin] = useState(false);
  const [loginNotice, setLoginNotice] = useState("");
  const [resendCooldown, setResendCooldown] = useState(0);
  const [dashboardTransition, setDashboardTransition] = useState<
    "administrator" | "student" | null
  >(null);
  const returnToPath = getSafeReturnTo();
  const returnToQuery = returnToPath
    ? `?returnTo=${encodeURIComponent(returnToPath)}`
    : "";
  const passwordStrength = useMemo(
    () => getPasswordStrength(password),
    [password]
  );
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = window.setTimeout(
      () => setResendCooldown(value => Math.max(0, value - 1)),
      1000
    );
    return () => window.clearTimeout(timer);
  }, [resendCooldown]);
  const onAuthenticated = async (
    authenticatedUser: { role?: "admin" | "user" } | null | undefined
  ) => {
    const destination =
      authenticatedUser?.role === "admin" ? "administrator" : "student";
    setDashboardTransition(destination);
    try {
      await utils.auth.me.invalidate();
      setLocation(
        destination === "student" && returnToPath
          ? returnToPath
          : destination === "administrator"
            ? "/admin"
            : "/account"
      );
    } catch (transitionError) {
      setDashboardTransition(null);
      setError(
        transitionError instanceof Error
          ? transitionError.message
          : "We could not open your dashboard. Please try again."
      );
    }
  };
  const login = trpc.auth.login.useMutation({ onSuccess: onAuthenticated });
  const create = trpc.auth.createAccount.useMutation({
    onSuccess: data => {
      setVerificationEmail(data.email);
      setVerificationUrl(data.previewVerificationUrl ?? "");
    },
  });
  const resendVerification = trpc.auth.requestEmailVerification.useMutation({
    onSuccess: data => {
      setVerificationUrl(data.previewVerificationUrl ?? "");
      setVerificationNotice(
        "A fresh verification link has been sent if this address is registered."
      );
      setLoginNotice(
        "A fresh verification link has been sent if this address is registered."
      );
      setResendCooldown(RESEND_COOLDOWN_SECONDS);
    },
  });
  const pending =
    login.isPending || create.isPending || resendVerification.isPending;

  const switchMode = (nextMode: AccountMode) => {
    setMode(nextMode);
    setError("");
    const currentPath = window.location.pathname;
    const nextPath = nextMode === "login" ? "/login" : "/create-account";
    if (currentPath !== "/account" && currentPath !== nextPath)
      setLocation(`${nextPath}${returnToQuery}`);
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setLoginNotice("");
    setUnverifiedLogin(false);
    if (mode === "create" && name.trim().length < 2)
      return setError("Please enter your full name.");
    if (password.length < 8)
      return setError("Use a password with at least 8 characters.");
    const onError = (value: { message: string }) => {
      setError(value.message);
      setUnverifiedLogin(value.message.includes("verify your email"));
    };
    if (mode === "login") login.mutate({ email, password }, { onError });
    else create.mutate({ name, email, password }, { onError });
  };

  if (dashboardTransition)
    return <AdminWorkspaceTransition destination={dashboardTransition} />;
  if (loading && !user) return <AccountLoading />;
  if (isAuthenticated && user)
    return <AccountDashboard user={user} logout={logout} loading={loading} />;
  if (verificationEmail)
    return (
      <div className="min-h-screen bg-[#edf4f0] text-[#19312c] account-route-shell">
        <header className="border-b border-[#dce6e1] bg-white">
          <div className="container flex h-20 items-center justify-between">
            <Link
              href="/"
              className="flex items-center gap-2 text-sm font-semibold text-[#1d5146]"
            >
              <ArrowLeft size={16} /> Back to catalogue
            </Link>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-[#789087]">
              <LockKeyhole size={15} /> Secure student access
            </div>
          </div>
        </header>
        <main className="container grid max-w-4xl gap-10 py-12 md:py-24">
          <section className="mx-auto w-full max-w-xl rounded-3xl border border-[#d9e6df] bg-white p-7 text-center shadow-xl shadow-[#1d5146]/8 sm:p-10 account-reveal">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[#e5f2eb] text-[#34745f]">
              <MailCheck size={24} />
            </div>
            <p className="section-eyebrow mt-6">Almost there</p>
            <h1 className="mt-2 font-serif text-3xl font-semibold text-[#173e35]">
              Verify your email to continue.
            </h1>
            <p className="mt-3 text-sm leading-6 text-[#718780]">
              We sent a secure verification link to{" "}
              <strong className="text-[#3c5d53]">{verificationEmail}</strong>.
              Confirm it within 24 hours before signing in.
            </p>
            {verificationNotice && (
              <p
                role="status"
                className="mt-4 text-xs font-medium text-[#34745f]"
              >
                {verificationNotice}
              </p>
            )}
            {verificationUrl && (
              <a
                href={verificationUrl}
                className="mt-6 inline-flex w-full items-center justify-center rounded-full border border-[#c8d9d2] px-5 py-3 text-sm font-semibold text-[#1d5146] transition hover:bg-[#f2f7f4]"
              >
                Open preview verification link
              </a>
            )}
            <button
              type="button"
              disabled={resendVerification.isPending || resendCooldown > 0}
              onClick={() =>
                resendVerification.mutate({ email: verificationEmail })
              }
              className="mt-4 inline-flex items-center gap-2 text-xs font-semibold text-[#1d5146] underline underline-offset-4 disabled:cursor-not-allowed disabled:no-underline disabled:opacity-60"
            >
              {resendVerification.isPending && (
                <Loader2 className="account-spinner" size={14} />
              )}{" "}
              {resendVerification.isPending
                ? "Sending a fresh link…"
                : resendCooldown > 0
                  ? `Resend available in ${resendCooldown}s`
                  : "Resend verification email"}
            </button>
            <span className="sr-only" role="status" aria-live="polite">
              {resendCooldown > 0
                ? `Verification resend available in ${resendCooldown} seconds.`
                : "Verification resend is available."}
            </span>
            <div className="mt-7">
              <Link
                href={`/login${returnToQuery}`}
                className="text-sm font-semibold text-[#1d5146] underline underline-offset-4"
              >
                Return to sign in
              </Link>
            </div>
          </section>
        </main>
      </div>
    );

  return (
    <div className="min-h-screen bg-[#edf4f0] text-[#19312c] account-route-shell">
      <header className="border-b border-[#dce6e1] bg-white">
        <div className="container flex h-20 items-center justify-between">
          <Link
            href="/"
            className="flex items-center gap-2 text-sm font-semibold text-[#1d5146]"
          >
            <ArrowLeft size={16} /> Back to catalogue
          </Link>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-[#789087]">
            <LockKeyhole size={15} /> Secure student access
          </div>
        </div>
      </header>
      <main className="container grid max-w-5xl gap-10 py-12 md:grid-cols-[.85fr_1.15fr] md:items-center md:py-20">
        <section className="hidden md:block account-reveal">
          <p className="section-eyebrow">ScholarShelf account</p>
          <h1 className="mt-3 max-w-md font-serif text-5xl font-semibold leading-tight text-[#173e35]">
            Keep every resource in one trusted library.
          </h1>
          <p className="mt-5 max-w-md text-lg leading-8 text-[#648078]">
            Create your student account to track LeeTec purchases and access
            unlocked resources securely.
          </p>
          <div className="mt-8 flex items-center gap-3 text-sm text-[#4b8876]">
            <CheckCircle2 size={17} /> Account records are stored securely.
          </div>
        </section>
        <section className="rounded-3xl border border-[#d9e6df] bg-white p-6 shadow-xl shadow-[#1d5146]/8 sm:p-9 account-panel-transition">
          <div
            className="flex rounded-full bg-[#f0f5f2] p-1"
            role="tablist"
            aria-label="Account access mode"
          >
            <button
              type="button"
              role="tab"
              aria-selected={mode === "login"}
              onClick={() => switchMode("login")}
              className={`account-mode-tab flex-1 rounded-full px-4 py-2.5 text-sm font-semibold transition ${mode === "login" ? "bg-white text-[#1d5146] shadow-sm" : "text-[#718780]"}`}
            >
              Sign in
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "create"}
              onClick={() => switchMode("create")}
              className={`account-mode-tab flex-1 rounded-full px-4 py-2.5 text-sm font-semibold transition ${mode === "create" ? "bg-white text-[#1d5146] shadow-sm" : "text-[#718780]"}`}
            >
              Create account
            </button>
          </div>
          <div key={mode} className="account-mode-content" aria-live="polite">
            <div className="mt-8">
              <h2 className="font-serif text-3xl font-semibold text-[#173e35]">
                {mode === "login" ? "Welcome back" : "Start your account"}
              </h2>
              <p className="mt-2 text-sm text-[#718780]">
                {mode === "login"
                  ? "Sign in to continue to your personal resource library."
                  : "Use your email to create a secure student account."}
              </p>
            </div>
            <form
              onSubmit={submit}
              className="mt-7 space-y-4"
              aria-busy={pending}
            >
              {mode === "create" && (
                <label className="block text-sm font-medium text-[#3c5d53]">
                  Full name
                  <Input
                    value={name}
                    onChange={e => setName(e.target.value)}
                    autoComplete="name"
                    placeholder="Your full name"
                    className="mt-2 h-11 rounded-xl border-[#d9e6df]"
                  />
                </label>
              )}
              <label className="block text-sm font-medium text-[#3c5d53]">
                Email address
                <Input
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="you@example.com"
                  className="mt-2 h-11 rounded-xl border-[#d9e6df]"
                />
              </label>
              <label className="block text-sm font-medium text-[#3c5d53]">
                Password
                <div className="relative mt-2">
                  <Input
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    type={showPassword ? "text" : "password"}
                    required
                    autoComplete={
                      mode === "login" ? "current-password" : "new-password"
                    }
                    placeholder="At least 8 characters"
                    className="h-11 rounded-xl border-[#d9e6df] pr-11"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(value => !value)}
                    aria-label={
                      showPassword ? "Hide password" : "Show password"
                    }
                    aria-pressed={showPassword}
                    title={showPassword ? "Hide password" : "Show password"}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#789087]"
                  >
                    {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </div>
                {mode === "create" && (
                  <div className="mt-3" aria-label="Password strength">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-[#4b6e63]">
                        Password strength
                      </span>
                      <span
                        className={`font-semibold ${passwordStrength.score >= 4 ? "text-[#34745f]" : passwordStrength.score >= 3 ? "text-[#9b741e]" : "text-[#a44e49]"}`}
                      >
                        {passwordStrength.label}
                      </span>
                    </div>
                    <div
                      className="mt-2 grid grid-cols-5 gap-1"
                      role="progressbar"
                      aria-label="Password strength"
                      aria-valuemin={0}
                      aria-valuemax={5}
                      aria-valuenow={passwordStrength.score}
                    >
                      <span
                        className={`h-1.5 rounded-full ${passwordStrength.score >= 1 ? "bg-[#d88770]" : "bg-[#e7eeea]"}`}
                      />
                      <span
                        className={`h-1.5 rounded-full ${passwordStrength.score >= 2 ? "bg-[#d9ad59]" : "bg-[#e7eeea]"}`}
                      />
                      <span
                        className={`h-1.5 rounded-full ${passwordStrength.score >= 3 ? "bg-[#d9ad59]" : "bg-[#e7eeea]"}`}
                      />
                      <span
                        className={`h-1.5 rounded-full ${passwordStrength.score >= 4 ? "bg-[#5eaa86]" : "bg-[#e7eeea]"}`}
                      />
                      <span
                        className={`h-1.5 rounded-full ${passwordStrength.score >= 5 ? "bg-[#34745f]" : "bg-[#e7eeea]"}`}
                      />
                    </div>
                    <p className="mt-2 text-[11px] leading-5 text-[#82958e]">
                      Use 8+ characters with lowercase, uppercase, a number, and
                      a symbol.
                    </p>
                  </div>
                )}
              </label>
              {error && (
                <div
                  role="alert"
                  className="account-alert flex items-start gap-2 rounded-xl border border-[#efc8c5] bg-[#fff4f3] p-3 text-sm text-[#a44e49]"
                >
                  <AlertCircle size={17} className="mt-0.5 shrink-0" />
                  {error}
                </div>
              )}
              {unverifiedLogin && mode === "login" && (
                <button
                  type="button"
                  disabled={resendVerification.isPending || resendCooldown > 0}
                  onClick={() => resendVerification.mutate({ email })}
                  className="text-left text-xs font-semibold text-[#1d5146] underline underline-offset-4"
                >
                  {resendVerification.isPending
                    ? "Sending a fresh verification link…"
                    : resendCooldown > 0
                      ? `Resend available in ${resendCooldown}s`
                      : "Resend verification email"}
                </button>
              )}
              {loginNotice && (
                <p role="status" className="text-xs font-medium text-[#34745f]">
                  {loginNotice}
                </p>
              )}
              {pending && (
                <div
                  className="account-auth-status flex items-center gap-2 text-xs font-medium text-[#4b8876]"
                  role="status"
                  aria-live="polite"
                >
                  <Loader2 className="account-spinner" size={15} />
                  {mode === "login"
                    ? "Checking your secure session…"
                    : "Creating your secure account…"}
                </div>
              )}
              <Button
                disabled={pending}
                className="h-11 w-full rounded-full bg-[#1d5146] hover:bg-[#153c34]"
              >
                {pending && <Loader2 className="account-spinner" size={17} />}
                {pending
                  ? "Securing your account…"
                  : mode === "login"
                    ? "Sign in securely"
                    : "Create account"}
              </Button>
            </form>
            {mode === "login" && (
              <div className="mt-4 text-right">
                <Link
                  href="/reset-password"
                  className="text-xs font-semibold text-[#1d5146] underline underline-offset-4 transition hover:text-[#153c34]"
                >
                  Forgot your password?
                </Link>
              </div>
            )}
          </div>
          <p className="mt-6 text-center text-xs leading-5 text-[#8aa098]">
            By continuing, you agree to use only authorized examination
            materials.
          </p>
        </section>
      </main>
    </div>
  );
}
