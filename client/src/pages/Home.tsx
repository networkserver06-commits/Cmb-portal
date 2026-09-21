import { useAuth } from "@/_core/hooks/useAuth";
import { Link } from "wouter";
import { startLogin } from "@/const";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertCircle,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Download,
  FileText,
  LayoutDashboard,
  LockKeyhole,
  Loader2,
  Menu,
  MessageCircle,
  Search,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import EducationLevelSelect from "@/components/EducationLevelSelect";
import ShareDocumentButton from "@/components/ShareDocumentButton";
import ShareAppButton from "@/components/ShareAppButton";
import GrokStudyAssistant from "@/components/GrokStudyAssistant";
import { educationLevelLabel } from "@shared/educationLevels";
import {
  RESOURCE_TYPES,
  RESOURCE_TYPE_LABELS,
  resourceTypeLabel,
  type ResourceType,
} from "@shared/resourceTypes";
import type { EducationLevel } from "@shared/educationLevels";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const accentMap: Record<string, string> = {
  sage: "bg-[#e4efe9] text-[#1f5a4b]",
  blue: "bg-[#e4ebf7] text-[#244a82]",
  gold: "bg-[#f7edcf] text-[#8b6518]",
  plum: "bg-[#eee7f4] text-[#704979]",
};

function checkoutReturnPath(paperId: number) {
  return `/?paper=${encodeURIComponent(paperId)}#catalogue`;
}

function authEntryHref(mode: "login" | "create-account", paperId: number) {
  const params = new URLSearchParams({ returnTo: checkoutReturnPath(paperId) });
  return `/${mode}?${params.toString()}`;
}

function publicPaperHref(paperId: number) {
  return `/paper/${encodeURIComponent(paperId)}`;
}

function resourceShareHref(paper: {
  id: number;
  accessMode?: string;
  price?: number;
}) {
  const isFree = paper.accessMode === "free" || Number(paper.price) === 0;
  return isFree ? publicPaperHref(paper.id) : checkoutReturnPath(paper.id);
}

export default function Home() {
  const { user, isAuthenticated, logout } = useAuth();
  const [query, setQuery] = useState("");
  const [levelFilter, setLevelFilter] = useState<EducationLevel | "">("");
  const [documentTypeFilter, setDocumentTypeFilter] = useState<
    ResourceType | ""
  >("");
  const [mobileOpen, setMobileOpen] = useState(false);
  const checkoutIntent = useRef(0);
  const [paymentStatus, setPaymentStatus] = useState<{
    state: "idle" | "processing" | "authorizing" | "success" | "error";
    message: string;
    reference?: string;
  }>({ state: "idle", message: "" });
  const [walletConfirmation, setWalletConfirmation] = useState<{
    paperId: number;
    amountKes: number;
    balanceKes: number;
  } | null>(null);
  const [walletCheckState, setWalletCheckState] = useState<
    "idle" | "checking" | "sufficient" | "insufficient"
  >("idle");
  const [phoneNumber, setPhoneNumber] = useState(user?.phone ?? "");
  const [selectedPaperId, setSelectedPaperId] = useState<number | null>(() => {
    const value = Number(
      new URLSearchParams(window.location.search).get("paper")
    );
    return Number.isInteger(value) && value > 0 ? value : null;
  });
  const catalogueInput = useMemo(
    () => ({
      search: query,
      level: levelFilter || undefined,
      documentType: documentTypeFilter || undefined,
    }),
    [documentTypeFilter, levelFilter, query]
  );
  const catalogue = trpc.catalogue.useQuery(catalogueInput);
  const initializePayment = trpc.student.initializePayment.useMutation();
  const payWithWallet = trpc.student.payWithWallet.useMutation();
  const claimFreePaper = trpc.student.claimFreePaper.useMutation();
  const walletBalance = trpc.student.wallet.useQuery(undefined, {
    enabled: isAuthenticated,
  });
  const paymentCheck = trpc.student.paymentStatus.useQuery(
    { reference: paymentStatus.reference ?? "" },
    {
      enabled:
        Boolean(paymentStatus.reference) &&
        paymentStatus.state === "authorizing",
      refetchInterval: 4000,
    }
  );
  useEffect(() => {
    if (
      paymentCheck.data?.status === "paid" &&
      paymentStatus.state === "authorizing"
    ) {
      setPaymentStatus(current => ({
        ...current,
        state: "success",
        message:
          "Payment confirmed. Your paper is now available in My Library.",
      }));
    }
    if (
      ["failed", "cancelled"].includes(paymentCheck.data?.status ?? "") &&
      paymentStatus.state === "authorizing"
    )
      setPaymentStatus(current => ({
        ...current,
        state: "error",
        message:
          "LeeTec did not confirm this payment. You can retry safely.",
      }));
  }, [paymentCheck.data?.status, paymentStatus.state]);
  const filteredPapers = useMemo(() => {
    const live = catalogue.data ?? [];
    return live.map(p => ({
      id: p.legacyId,
      code: `${p.course} · ${p.cycle}`,
      title: p.title,
      unit: p.unit,
      category: p.course,
      documentType: p.documentType,
      level: p.level,
      cycle: p.cycle,
      price: Number(p.priceKes),
      accessMode: p.accessMode,
      accent: "sage",
      description: p.description ?? "A secure ScholarShelf learning resource.",
    }));
  }, [catalogue.data]);
  const selectedPaper = filteredPapers.find(
    paper => paper.id === selectedPaperId
  );
  useEffect(() => {
    if (selectedPaperId !== null && filteredPapers.length > 0 && !selectedPaper)
      setSelectedPaperId(null);
  }, [filteredPapers, selectedPaper, selectedPaperId]);
  const cancelCheckout = () => {
    checkoutIntent.current += 1;
    setWalletConfirmation(null);
    setWalletCheckState("idle");
    setSelectedPaperId(null);
    setPaymentStatus({ state: "idle", message: "" });
  };
  const startLeetecPayment = (paperId: number, intent: number) => {
    const phoneDigits = phoneNumber.replace(/\D/g, "");
    if (
      !/^(?:0[17]\d{8}|[17]\d{8}|254[17]\d{8}|00254[17]\d{8})$/.test(
        phoneDigits
      )
    ) {
      setPaymentStatus({
        state: "error",
        message:
          "Enter a valid Kenyan mobile number before starting LeeTec checkout.",
      });
      return;
    }
    setPaymentStatus({
      state: "processing",
      message: "Sending a secure LeeTec payment prompt to your phone…",
    });
    initializePayment.mutate(
      { paperId, phoneNumber },
      {
        onSuccess: result => {
          if (intent !== checkoutIntent.current) return;
          setPaymentStatus({
            state: "authorizing",
            message:
              "Approve the LeeTec payment prompt on your phone. This page will check the payment status automatically.",
            reference: result.reference,
          });
        },
        onError: error =>
          setPaymentStatus({
            state: "error",
            message:
              error.message || "We could not start checkout. Please try again.",
          }),
      }
    );
  };

  const confirmWalletPurchase = () => {
    if (!walletConfirmation) return;
    const { paperId } = walletConfirmation;
    const intent = checkoutIntent.current;
    setWalletConfirmation(null);
    setPaymentStatus({
      state: "processing",
      message: "Charging your wallet securely…",
    });
    payWithWallet.mutate(
      { paperId },
      {
        onSuccess: result => {
          if (intent !== checkoutIntent.current) return;
          if (result.paid) {
            void walletBalance.refetch();
            setPaymentStatus({
              state: "success",
              message:
                "Payment completed from your wallet. You can view or download the resource below.",
            });
            return;
          }
          setPaymentStatus({
            state: "processing",
            message:
              "Your wallet balance changed before confirmation. Sending a secure LeeTec payment prompt instead…",
          });
          startLeetecPayment(paperId, intent);
        },
        onError: error =>
          setPaymentStatus({
            state: "error",
            message:
              error.message ||
              "We could not charge your wallet. No funds were charged.",
          }),
      }
    );
  };

  const buy = (paperId: number) => {
    if (!isAuthenticated) return startLogin();
    const intent = ++checkoutIntent.current;
    const paper = catalogue.data?.find(item => item.legacyId === paperId);
    if (!paper)
      return setPaymentStatus({
        state: "error",
        message:
          "This paper is no longer available. Please refresh and try again.",
      });
    if (paper.accessMode === "free" || Number(paper.priceKes) === 0) {
      setPaymentStatus({
        state: "processing",
        message: "Adding this free paper to your library…",
      });
      return claimFreePaper.mutate(
        { paperId },
        {
          onSuccess: () => {
            if (intent !== checkoutIntent.current) return;
            setSelectedPaperId(null);
            setPaymentStatus({
              state: "success",
              message:
                "Free resource added to your library. Open your account to download it.",
            });
          },
          onError: error =>
            setPaymentStatus({
              state: "error",
              message:
                error.message ||
                "We could not add this free resource. Please try again.",
            }),
        }
      );
    }
    setPaymentStatus({
      state: "processing",
      message: "Checking your ScholarShelf wallet before checkout…",
    });
    setWalletCheckState("checking");
    walletBalance
      .refetch()
      .then(({ data }) => {
        if (intent !== checkoutIntent.current) return;
        const balanceKes = Number(data?.balanceKes ?? 0);
        const amountKes = Number(paper.priceKes);
        if (balanceKes < amountKes) {
          setWalletCheckState("insufficient");
          setPaymentStatus({
            state: "idle",
            message:
              balanceKes > 0
                ? `Wallet balance: KES ${balanceKes.toLocaleString()}. Enter a phone number to continue with LeeTec.`
                : "Your wallet has no available balance. Enter a phone number to continue with LeeTec.",
          });
          return;
        }
        setWalletCheckState("sufficient");
        setPaymentStatus({ state: "idle", message: "" });
        setWalletConfirmation({ paperId, amountKes, balanceKes });
      })
      .catch(error =>
        setPaymentStatus({
          state: "error",
          message:
            error instanceof Error
              ? error.message
              : "We could not check your wallet. Please try again.",
        })
      );
  };

  return (
    <div className="min-h-screen bg-[#f7f8f6] text-[#19312c]">
      <header className="sticky top-0 z-30 border-b border-[#dce6e1] bg-white/95 shadow-[0_1px_0_rgba(29,81,70,0.03)] backdrop-blur-xl">
        <div className="container flex h-[76px] items-center justify-between gap-6">
          <a href="/" className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-2xl bg-[#1d5146] text-[#e8c979] shadow-lg shadow-[#1d5146]/15">
              <BookOpen size={23} strokeWidth={1.8} />
            </div>
            <div>
              <div className="font-serif text-xl font-semibold tracking-tight text-[#163d35]">
                Scholar<span className="text-[#bb8a2e]">Shelf</span>
              </div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#78938a]">
                LEARNING RESOURCE LIBRARY
              </div>
            </div>
          </a>
          <nav className="hidden items-center gap-8 text-sm font-medium text-[#547068] md:flex">
            <a className="text-[#153c34]" href="#catalogue">
              Catalogue
            </a>
            <a href="#how-it-works">How it works</a>
            <a href="#support">Support</a>
            <a href="#share-app">Share app</a>
          </nav>
          <div className="hidden items-center gap-3 md:flex">
            {isAuthenticated ? (
              <>
                <Link
                  href={user?.role === "admin" ? "/admin" : "/account"}
                  className="inline-flex h-10 items-center gap-2 rounded-full border border-[#c8d9d2] px-4 text-sm font-medium text-[#1d5146] transition hover:bg-[#e8f1ed]"
                >
                  <LayoutDashboard size={16} /> View dashboard
                </Link>
                <Button
                  variant="ghost"
                  className="rounded-full"
                  onClick={() => logout()}
                >
                  Sign out
                </Button>
              </>
            ) : (
              <>
                <Link
                  href="/login"
                  className="inline-flex h-10 items-center rounded-full px-4 text-sm font-medium text-[#1d5146] hover:bg-[#e8f1ed]"
                >
                  Sign in
                </Link>
                <Link
                  href="/create-account"
                  className="inline-flex h-10 items-center gap-2 rounded-full bg-[#1d5146] px-5 text-sm font-medium text-white hover:bg-[#153c34]"
                >
                  Create account <ChevronRight size={16} />
                </Link>
              </>
            )}
          </div>
          <button
            className="rounded-xl p-2 md:hidden"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="Toggle navigation"
          >
            {mobileOpen ? <X /> : <Menu />}
          </button>
        </div>
        {mobileOpen && (
          <div className="border-t border-[#dce6e1] bg-white px-5 py-4 md:hidden">
            <div className="flex flex-col gap-4 text-sm font-medium">
              <a href="#catalogue" onClick={() => setMobileOpen(false)}>
                Catalogue
              </a>
              <a href="#how-it-works" onClick={() => setMobileOpen(false)}>
                How it works
              </a>
              <a href="#share-app" onClick={() => setMobileOpen(false)}>
                Share app
              </a>
              {isAuthenticated ? (
                <div className="flex flex-col gap-3 border-t border-[#e8efeb] pt-4">
                  <Link
                    href={user?.role === "admin" ? "/admin" : "/account"}
                    className="inline-flex h-10 items-center gap-2 rounded-full bg-[#1d5146] px-4 text-white"
                    onClick={() => setMobileOpen(false)}
                  >
                    <LayoutDashboard size={16} /> View dashboard
                  </Link>
                  <button
                    className="text-left text-[#718780]"
                    onClick={() => logout()}
                  >
                    Sign out
                  </button>
                </div>
              ) : (
                <div className="flex flex-col gap-3 border-t border-[#e8efeb] pt-4">
                  <Link
                    href="/login"
                    className="text-left text-[#1d5146]"
                    onClick={() => setMobileOpen(false)}
                  >
                    Sign in
                  </Link>
                  <Link
                    href="/create-account"
                    className="inline-flex h-10 items-center justify-center rounded-full bg-[#1d5146] text-white"
                    onClick={() => setMobileOpen(false)}
                  >
                    Create account <ChevronRight size={16} className="ml-1" />
                  </Link>
                </div>
              )}
            </div>
          </div>
        )}
      </header>

      <main>
        <section className="relative overflow-hidden border-b border-[#dce6e1] bg-[#edf4f0]">
          <div className="absolute -right-24 -top-28 h-80 w-80 rounded-full bg-[#dbece3] blur-2xl" />
          <div className="container relative grid gap-12 py-16 md:grid-cols-[1.1fr_.9fr] md:items-center md:py-24">
            <div>
              <Badge className="mb-6 border-0 bg-[#dcebe4] px-3 py-1.5 text-[#1d604f]">
                <Sparkles size={14} className="mr-1.5" /> Curated learning
                resources
              </Badge>
              <h1 className="max-w-3xl font-serif text-5xl font-semibold leading-[1.03] tracking-[-0.045em] text-[#153c34] md:text-7xl">
                Study with clarity.
                <br />
                <span className="text-[#b88327]">Arrive prepared.</span>
              </h1>
              <p className="mt-6 max-w-xl text-lg leading-8 text-[#5c766e]">
                Find trusted documents for your course or collection, open free
                resources instantly, and keep every purchased resource in one
                personal library.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <a href="#catalogue">
                  <Button
                    size="lg"
                    className="rounded-full bg-[#1d5146] px-6 hover:bg-[#153c34]"
                  >
                    Explore resources <ChevronRight size={17} />
                  </Button>
                </a>
                <a href="#how-it-works">
                  <Button
                    size="lg"
                    variant="outline"
                    className="rounded-full border-[#bcd2c8] bg-transparent px-6 text-[#1d5146]"
                  >
                    How it works
                  </Button>
                </a>
              </div>
              {isAuthenticated ? (
                <div className="mt-5 flex flex-wrap items-center gap-3 rounded-2xl border border-[#c9ddd4] bg-white/70 p-3 text-sm text-[#668078] shadow-sm">
                  <span className="px-1 font-medium">
                    Your library is ready.
                  </span>
                  <Link
                    href={user?.role === "admin" ? "/admin" : "/account"}
                    className="inline-flex h-9 items-center gap-1.5 rounded-full bg-[#1d5146] px-4 font-semibold text-white transition hover:bg-[#153c34]"
                  >
                    <LayoutDashboard size={14} /> View dashboard
                  </Link>
                </div>
              ) : (
                <div className="mt-5 flex flex-wrap items-center gap-3 rounded-2xl border border-[#d3e4db] bg-white/70 p-3 text-sm text-[#668078] shadow-sm">
                  <span className="px-1 font-medium">Ready to begin?</span>
                  <Link
                    href="/login"
                    className="inline-flex h-9 items-center rounded-full px-3 font-semibold text-[#1d5146] transition hover:bg-[#e8f1ed]"
                  >
                    Sign in
                  </Link>
                  <Link
                    href="/create-account"
                    className="inline-flex h-9 items-center gap-1.5 rounded-full bg-[#1d5146] px-4 font-semibold text-white transition hover:bg-[#153c34]"
                  >
                    Create account <ChevronRight size={14} />
                  </Link>
                </div>
              )}
              <div className="mt-9 flex flex-wrap gap-6 text-sm text-[#668078]">
                <span className="flex items-center gap-2">
                  <ShieldCheck size={17} className="text-[#2f806a]" />{" "}
                  Authenticated access
                </span>
                <span className="flex items-center gap-2">
                  <LockKeyhole size={16} className="text-[#2f806a]" /> Protected
                  downloads
                </span>
              </div>
            </div>
            <div className="relative mx-auto w-full max-w-[430px]">
              <div className="absolute -inset-3 rounded-[2rem] border border-[#c7ded4]" />
              <div className="relative rounded-[1.7rem] bg-[#183f37] p-7 text-[#f1f7f3] shadow-2xl shadow-[#1b5145]/20">
                <div className="flex items-center justify-between text-xs text-[#aac8bd]">
                  <span>STUDENT LIBRARY</span>
                  <span className="rounded-full bg-white/10 px-2.5 py-1">
                    Secure
                  </span>
                </div>
                <div className="mt-12 font-serif text-3xl leading-tight">
                  Your next
                  <br />
                  <em className="text-[#e6c46f]">breakthrough</em>
                  <br />
                  starts here.
                </div>
                <div className="mt-12 rounded-2xl bg-white/10 p-4">
                  <div className="flex items-center gap-3">
                    <div className="grid h-10 w-10 place-items-center rounded-xl bg-[#e1c16d] text-[#193b34]">
                      <FileText size={19} />
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold">
                        Saved resource
                      </div>
                      <div className="mt-1 text-xs text-[#b2cec2]">
                        Unlocked · PDF resource
                      </div>
                    </div>
                    <Download size={18} className="ml-auto text-[#e6c46f]" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="container py-10 md:py-14" aria-label="Grok study assistant">
          <GrokStudyAssistant isAuthenticated={isAuthenticated} />
        </section>

        <section id="catalogue" className="container py-16 md:py-20">
          <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
            <div>
              <p className="section-eyebrow">The library</p>
              <h2 className="mt-2 font-serif text-4xl font-semibold tracking-tight text-[#173e35]">
                Find your resource
              </h2>
              <p className="mt-3 max-w-lg text-[#6a8179]">
                Search by subject, unit, education level, or category.
                Availability is clearly marked before you pay.
              </p>
            </div>
            <div className="flex w-full flex-col gap-3 md:w-auto md:flex-row">
              <div className="relative w-full md:w-80">
                <Search
                  size={18}
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-[#87a097]"
                />
                <input
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Search resources"
                  aria-label="Search resources"
                  className="h-12 w-full rounded-full border border-[#cdded7] bg-white pl-11 pr-4 text-sm outline-none transition focus:border-[#4d8978] focus:ring-4 focus:ring-[#4d8978]/10"
                />
              </div>
              <div className="w-full md:w-56">
                <label className="sr-only">Filter by education level</label>
                <EducationLevelSelect
                  value={levelFilter}
                  onChange={setLevelFilter}
                  includeAll
                  className="h-12 w-full rounded-full border-[#cdded7] bg-white"
                />
              </div>
              <div className="w-full md:w-56">
                <label className="sr-only" htmlFor="catalogue-document-type">
                  Filter by document type
                </label>
                <select
                  id="catalogue-document-type"
                  value={documentTypeFilter}
                  onChange={event =>
                    setDocumentTypeFilter(
                      event.target.value as ResourceType | ""
                    )
                  }
                  className="h-12 w-full rounded-full border border-[#cdded7] bg-white px-4 text-sm text-[#274d43] outline-none transition focus:border-[#4d8978] focus:ring-4 focus:ring-[#4d8978]/20"
                >
                  <option value="">All document types</option>
                  {RESOURCE_TYPES.map(type => (
                    <option key={type} value={type}>
                      {RESOURCE_TYPE_LABELS[type]}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
          {paymentStatus.state !== "idle" && (
            <div
              className={`mt-6 flex items-start gap-3 rounded-2xl border p-4 text-sm ${paymentStatus.state === "error" ? "border-[#efc8c5] bg-[#fff4f3] text-[#a44e49]" : paymentStatus.state === "success" ? "border-[#b9ddc7] bg-[#eef9f1] text-[#327452]" : "border-[#d8c47d] bg-[#fff9e8] text-[#7a5b16]"}`}
              role="status"
              aria-live="polite"
            >
              {paymentStatus.state === "processing" && (
                <Loader2 className="mt-0.5 h-5 w-5 shrink-0 animate-spin" />
              )}
              {paymentStatus.state === "authorizing" && (
                <Clock3 className="mt-0.5 h-5 w-5 shrink-0 animate-pulse" />
              )}
              {paymentStatus.state === "success" && (
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
              )}
              {paymentStatus.state === "error" && (
                <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
              )}
              <div className="min-w-0 flex-1">
                <div className="font-semibold">
                  {paymentStatus.state === "processing"
                    ? "Preparing checkout"
                    : paymentStatus.state === "authorizing"
                      ? "Redirecting to secure checkout"
                      : paymentStatus.state === "success"
                        ? "Payment status received"
                        : "Checkout needs attention"}
                </div>
                <div className="mt-1 leading-6">{paymentStatus.message}</div>
                {paymentStatus.reference && (
                  <div className="mt-2 space-y-2 font-mono text-xs">
                    <div>Reference: {paymentStatus.reference}</div>
                    <a
                      href={`/payment-result?reference=${encodeURIComponent(paymentStatus.reference)}`}
                      className="inline-flex font-sans font-semibold underline underline-offset-4"
                    >
                      Open payment result
                    </a>
                  </div>
                )}
                {paymentStatus.state === "error" && (
                  <button
                    className="mt-3 rounded-full border border-current px-3 py-1.5 text-xs font-semibold"
                    onClick={() =>
                      setPaymentStatus({ state: "idle", message: "" })
                    }
                  >
                    Dismiss and retry
                  </button>
                )}
              </div>
              <button
                aria-label="Dismiss payment status"
                className="text-current/60 hover:text-current"
                onClick={() => setPaymentStatus({ state: "idle", message: "" })}
              >
                <X size={16} />
              </button>
            </div>
          )}
          <Dialog
            open={Boolean(selectedPaper)}
            onOpenChange={open => {
              if (!open) cancelCheckout();
            }}
          >
            {selectedPaper && (
              <DialogContent
                className="max-h-[90vh] overflow-y-auto rounded-3xl border-[#c9ddd4] bg-[#edf6f1] p-5 text-[#19312c] shadow-2xl sm:max-w-xl"
                aria-describedby="paper-checkout-description"
              >
                <DialogHeader className="pr-8 text-left">
                  <p className="text-[10px] font-bold uppercase tracking-[0.17em] text-[#6b8f83]">
                    Paper details · secure checkout
                  </p>
                  <DialogTitle className="font-serif text-2xl font-semibold text-[#173e35]">
                    {selectedPaper.title}
                  </DialogTitle>
                  <DialogDescription
                    id="paper-checkout-description"
                    className="text-sm text-[#648078]"
                  >
                    {resourceTypeLabel(selectedPaper.documentType)} ·{" "}
                    {selectedPaper.code} · {selectedPaper.unit} ·{" "}
                    {educationLevelLabel(selectedPaper.level)}
                  </DialogDescription>
                </DialogHeader>
                <p className="max-w-2xl text-sm leading-6 text-[#5f786f]">
                  {selectedPaper.description}
                </p>
                <div className="flex flex-wrap items-center gap-2 text-xs text-[#5f786f]">
                  <ShareDocumentButton
                    title={selectedPaper.title}
                    url={new URL(
                      resourceShareHref(selectedPaper),
                      window.location.origin
                    ).toString()}
                    compact
                  />
                  <Badge className="border-0 bg-white text-[#1d5146]">
                    {selectedPaper.accessMode === "free" ||
                    selectedPaper.price === 0
                      ? "Free access"
                      : "Paid resource"}
                  </Badge>
                  <span>
                    {selectedPaper.accessMode === "free" ||
                    selectedPaper.price === 0
                      ? "Read the complete resource instantly. No account is required for Free access."
                      : isAuthenticated
                        ? "You are signed in; confirmation returns you to your library."
                        : "Choose Sign in or Create account to continue from this resource."}
                  </span>
                </div>
                {!isAuthenticated &&
                  selectedPaper.accessMode !== "free" &&
                  selectedPaper.price !== 0 && (
                    <div className="rounded-2xl border border-[#d8e8df] bg-white/70 p-4">
                      <p className="text-sm font-semibold text-[#1d5146]">
                        Continue securely
                      </p>
                      <p className="mt-1 text-sm leading-6 text-[#668078]">
                        Your selected resource will stay ready when
                        authentication is complete.
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Link
                          href={authEntryHref("login", selectedPaper.id)}
                          className="inline-flex h-10 items-center justify-center rounded-full bg-[#1d5146] px-4 text-sm font-semibold text-white transition hover:bg-[#153c34] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1d5146] focus-visible:ring-offset-2"
                        >
                          Sign in <ChevronRight className="ml-1" size={15} />
                        </Link>
                        <Link
                          href={authEntryHref(
                            "create-account",
                            selectedPaper.id
                          )}
                          className="inline-flex h-10 items-center justify-center rounded-full border border-[#b8d1c5] bg-white px-4 text-sm font-semibold text-[#1d5146] transition hover:bg-[#e8f1ed] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1d5146] focus-visible:ring-offset-2"
                        >
                          Create account{" "}
                          <ChevronRight className="ml-1" size={15} />
                        </Link>
                      </div>
                    </div>
                  )}
                {selectedPaper &&
                  isAuthenticated &&
                  walletCheckState === "insufficient" && (
                  <label className="block rounded-2xl border border-[#d8e8df] bg-white/75 p-4 text-sm font-semibold text-[#274d43]">
                    Kenyan phone number for LeeTec STK Push
                    <input
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel"
                      value={phoneNumber}
                      onChange={event => setPhoneNumber(event.target.value)}
                      placeholder="0712 345 678"
                      aria-label="Kenyan phone number for LeeTec payment"
                      className="mt-2 h-11 w-full rounded-xl border border-[#c8d9d2] bg-white px-3 text-sm font-normal outline-none focus:border-[#4b8876] focus:ring-2 focus:ring-[#4b8876]/25"
                    />
                    <span className="mt-2 block text-xs font-normal leading-5 text-[#718780]">
                      LeeTec will send an M-Pesa payment prompt to this number.
                    </span>
                  </label>
                )}
                {walletConfirmation && selectedPaper && (
                  <div className="rounded-2xl border border-[#d8c47d] bg-[#fff9e8] p-4 text-sm text-[#6f5517]">
                    <div className="flex items-start gap-3">
                      <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" />
                      <div className="min-w-0">
                        <div className="font-semibold">
                          Confirm wallet payment
                        </div>
                        <p className="mt-1 leading-6">
                          Confirm a charge of{" "}
                          <strong>
                            KES {walletConfirmation.amountKes.toLocaleString()}
                          </strong>{" "}
                          from your available wallet balance of{" "}
                          <strong>
                            KES {walletConfirmation.balanceKes.toLocaleString()}
                          </strong>{" "}
                          for “{selectedPaper.title}”.
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Button
                            className="rounded-full bg-[#1d5146] text-white hover:bg-[#153c34]"
                            onClick={confirmWalletPurchase}
                            disabled={payWithWallet.isPending}
                          >
                            {payWithWallet.isPending
                              ? "Charging…"
                              : "Confirm and buy"}
                          </Button>
                          <Button
                            variant="outline"
                            className="rounded-full border-[#b8a85c] bg-transparent text-[#6f5517] hover:bg-[#fff3c9]"
                            onClick={() => {
                              setWalletConfirmation(null);
                              setWalletCheckState("insufficient");
                              setPaymentStatus({
                                state: "idle",
                                message:
                                  "Enter a phone number to continue with LeeTec.",
                              });
                            }}
                          >
                            Pay by phone instead
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                {paymentStatus.state !== "idle" && (
                  <div
                    className={`flex items-start gap-3 rounded-2xl border p-4 text-sm ${paymentStatus.state === "error" ? "border-[#efc8c5] bg-[#fff4f3] text-[#a44e49]" : paymentStatus.state === "success" ? "border-[#b9ddc7] bg-[#eef9f1] text-[#327452]" : "border-[#d8c47d] bg-[#fff9e8] text-[#7a5b16]"}`}
                    role="status"
                    aria-live="polite"
                  >
                    {paymentStatus.state === "processing" && (
                      <Loader2 className="mt-0.5 h-5 w-5 shrink-0 animate-spin" />
                    )}
                    {paymentStatus.state === "authorizing" && (
                      <Clock3 className="mt-0.5 h-5 w-5 shrink-0 animate-pulse" />
                    )}
                    {paymentStatus.state === "success" && (
                      <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
                    )}
                    {paymentStatus.state === "error" && (
                      <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
                    )}
                    <div className="min-w-0">
                      <div className="font-semibold">
                        {paymentStatus.state === "processing"
                          ? "Preparing checkout"
                          : paymentStatus.state === "authorizing"
                            ? "Redirecting to secure checkout"
                            : paymentStatus.state === "success"
                              ? "Payment status received"
                              : "Checkout needs attention"}
                      </div>
                      <div className="mt-1 leading-6">
                        {paymentStatus.message}
                      </div>
                      {paymentStatus.reference && (
                        <a
                          href={`/payment-result?reference=${encodeURIComponent(paymentStatus.reference)}`}
                          className="mt-2 inline-flex font-mono text-xs font-semibold underline underline-offset-4"
                        >
                          Open payment result
                        </a>
                      )}
                      {paymentStatus.state === "success" && selectedPaper && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          <a
                            href={`/api/papers/${selectedPaper.id}/view`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex h-9 items-center justify-center rounded-full border border-[#9bc6aa] bg-white/80 px-4 text-xs font-semibold text-[#1d604f] transition hover:bg-white"
                          >
                            View now
                          </a>
                          <a
                            href={`/api/papers/${selectedPaper.id}/download`}
                            className="inline-flex h-9 items-center justify-center rounded-full bg-[#1d5146] px-4 text-xs font-semibold text-white transition hover:bg-[#153c34]"
                          >
                            Download now
                          </a>
                        </div>
                      )}
                    </div>
                  </div>
                )}
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#c9ddd4] pt-4">
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-widest text-[#6b8f83]">
                      {selectedPaper.accessMode === "free" ||
                      selectedPaper.price === 0
                        ? "Access"
                        : "Price"}
                    </div>
                    <div className="mt-1 font-semibold text-[#1d5146]">
                      {selectedPaper.accessMode === "free" ||
                      selectedPaper.price === 0
                        ? "Free"
                        : `KES ${selectedPaper.price.toLocaleString()}`}
                    </div>
                  </div>
                  <DialogFooter className="flex-row gap-2 sm:justify-end">
                    <Button
                      variant="outline"
                      className="rounded-full border-[#b8d1c5] bg-white/70 text-[#1d5146]"
                      onClick={cancelCheckout}
                    >
                      Cancel
                    </Button>
                    {selectedPaper.accessMode === "free" ||
                    selectedPaper.price === 0 ? (
                      <>
                        <a
                          href={publicPaperHref(selectedPaper.id)}
                          className="inline-flex h-10 items-center justify-center gap-2 rounded-full bg-[#1d5146] px-4 text-sm font-semibold text-white transition hover:bg-[#153c34] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1d5146] focus-visible:ring-offset-2"
                        >
                          View full resource <ChevronRight size={15} />
                        </a>
                        {isAuthenticated && (
                          <Button
                            className="rounded-full bg-[#1d5146] hover:bg-[#153c34]"
                            onClick={() => buy(selectedPaper.id)}
                            disabled={
                              claimFreePaper.isPending ||
                              paymentStatus.state === "processing" ||
                              paymentStatus.state === "authorizing"
                            }
                          >
                            {claimFreePaper.isPending
                              ? "Adding…"
                              : "Add to library"}
                            <ChevronRight size={15} />
                          </Button>
                        )}
                      </>
                    ) : isAuthenticated ? (
                      <Button
                        className="rounded-full bg-[#1d5146] hover:bg-[#153c34]"
                        onClick={() => buy(selectedPaper.id)}
                        disabled={
                          initializePayment.isPending ||
                          payWithWallet.isPending ||
                          claimFreePaper.isPending ||
                          Boolean(walletConfirmation) ||
                          paymentStatus.state === "processing" ||
                          paymentStatus.state === "authorizing"
                        }
                      >
                        {walletConfirmation
                          ? "Awaiting confirmation"
                          : payWithWallet.isPending
                            ? "Checking wallet…"
                            : initializePayment.isPending
                              ? "Sending phone prompt…"
                              : walletCheckState === "checking"
                                ? "Checking wallet…"
                                : walletCheckState === "insufficient"
                                  ? "Continue to phone checkout"
                                  : "Buy securely"}{" "}
                        <ChevronRight size={15} />
                      </Button>
                    ) : null}
                  </DialogFooter>
                </div>
              </DialogContent>
            )}
          </Dialog>

          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {filteredPapers.map(paper => (
              <article
                key={paper.id}
                aria-current={selectedPaperId === paper.id ? "true" : undefined}
                className={`group flex flex-col rounded-3xl border bg-white p-5 shadow-sm transition duration-200 hover:-translate-y-1 hover:shadow-xl hover:shadow-[#1d5146]/8 ${selectedPaperId === paper.id ? "border-[#2f806a] ring-2 ring-[#2f806a]/15" : "border-[#dce7e1]"}`}
              >
                <div
                  className={`grid h-14 w-14 place-items-center rounded-2xl ${accentMap[paper.accent]}`}
                >
                  <FileText size={24} strokeWidth={1.6} />
                </div>
                <div className="mt-7 flex-1">
                  <div className="text-[10px] font-bold uppercase tracking-[0.17em] text-[#94aaa2]">
                    {resourceTypeLabel(paper.documentType)} · {paper.code}
                  </div>
                  <h3 className="mt-2 font-serif text-xl font-semibold leading-tight text-[#173e35]">
                    {paper.title}
                  </h3>
                  <p className="mt-2 text-xs font-medium text-[#709087]">
                    {paper.unit} · {educationLevelLabel(paper.level)}
                  </p>
                  <p className="mt-4 text-sm leading-6 text-[#718780]">
                    {paper.description}
                  </p>
                </div>
                <div className="mt-6 flex items-center justify-between gap-2 border-t border-[#e8efeb] pt-4">
                  <ShareDocumentButton
                    title={paper.title}
                    url={new URL(
                      resourceShareHref(paper),
                      window.location.origin
                    ).toString()}
                    compact
                  />
                  <div className="ml-auto">
                    <div className="text-[10px] font-bold uppercase tracking-widest text-[#9aaca6]">
                      {paper.accessMode === "free" || paper.price === 0
                        ? "Access"
                        : "Secure price"}
                    </div>
                    <div className="mt-0.5 font-semibold text-[#1d5146]">
                      {paper.accessMode === "free" || paper.price === 0
                        ? "Free"
                        : `KES ${paper.price.toLocaleString()}`}
                    </div>
                  </div>
                  {paper.accessMode === "free" || paper.price === 0 ? (
                    <a
                      href={publicPaperHref(paper.id)}
                      className="inline-flex h-9 items-center gap-1.5 rounded-full bg-[#1d5146] px-3.5 text-xs font-semibold text-white transition hover:bg-[#153c34] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1d5146] focus-visible:ring-offset-2"
                    >
                      View free resource <ChevronRight size={14} />
                    </a>
                  ) : (
                    <Button
                      onClick={() => setSelectedPaperId(paper.id)}
                      size="sm"
                      className="rounded-full bg-[#1d5146] hover:bg-[#153c34]"
                    >
                      {isAuthenticated ? "View & buy" : "View resource"}{" "}
                      <ChevronRight size={14} />
                    </Button>
                  )}
                </div>
              </article>
            ))}
          </div>
          {catalogue.isLoading ? (
            <div
              role="status"
              className="rounded-3xl border border-dashed border-[#cdded7] py-16 text-center text-[#6a8179]"
            >
              Loading published resources…
            </div>
          ) : catalogue.error ? (
            <div
              role="alert"
              className="rounded-3xl border border-[#efc8c5] bg-[#fff4f3] py-16 text-center text-[#a44e49]"
            >
              We couldn’t load the catalogue right now. Please refresh and try
              again.
            </div>
          ) : (
            filteredPapers.length === 0 && (
              <div className="rounded-3xl border border-dashed border-[#cdded7] py-16 text-center text-[#6a8179]">
                No resources match these filters yet. Try another search or
                choose a different document type.
              </div>
            )
          )}
        </section>

        <section
          id="how-it-works"
          className="border-y border-[#dce7e1] bg-white"
        >
          <div className="container py-16 md:py-20">
            <div className="grid gap-10 md:grid-cols-[.8fr_1.2fr] md:items-start">
              <div>
                <p className="section-eyebrow">Simple by design</p>
                <h2 className="mt-2 font-serif text-4xl font-semibold tracking-tight text-[#173e35]">
                  From search to study in minutes.
                </h2>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="step-card">
                  <span>01</span>
                  <h3>Choose</h3>
                  <p>Find the right course, level, cycle, and unit.</p>
                </div>
                <div className="step-card">
                  <span>02</span>
                  <h3>Pay securely</h3>
                  <p>Approve a secure LeeTec M-Pesa payment prompt.</p>
                </div>
                <div className="step-card">
                  <span>03</span>
                  <h3>Access</h3>
                  <p>Your resource unlocks in your authenticated library.</p>
                </div>
              </div>
            </div>
          </div>
        </section>
        <section
          id="share-app"
          className="border-y border-[#dce7e1] bg-[#f1f6f3]"
        >
          <div className="container grid gap-8 py-14 md:grid-cols-[.85fr_1.15fr] md:items-center md:py-18">
            <div>
              <p className="section-eyebrow">Bring a friend</p>
              <h2 className="mt-2 font-serif text-4xl font-semibold tracking-tight text-[#173e35]">
                Share the ScholarShelf library.
              </h2>
              <p className="mt-4 max-w-xl text-base leading-7 text-[#648078]">
                Send the home page to a classmate or study group so they can
                discover trusted resources, read freely available documents, and
                build their own library.
              </p>
              <div className="mt-6">
                <ShareAppButton />
              </div>
            </div>
            <div className="overflow-hidden rounded-[2rem] border border-[#cfe0d7] bg-[#0b3029] shadow-[0_20px_60px_rgba(21,60,52,0.18)]">
              <img
                src="/scholarshelf-home-share-preview.jpg"
                alt="ScholarShelf home page preview showing the learning resource library"
                className="block h-auto w-full"
                loading="lazy"
              />
            </div>
          </div>
        </section>
        <section id="support" className="container py-12">
          <div className="flex flex-col justify-between gap-5 rounded-3xl bg-[#e8f1ed] p-7 md:flex-row md:items-center md:p-9">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold text-[#1d604f]">
                <Clock3 size={16} /> Need help?
              </div>
              <h2 className="mt-2 font-serif text-2xl font-semibold text-[#173e35]">
                We keep your study journey focused.
              </h2>
              <p className="mt-2 text-sm text-[#648078]">
                For account or payment support, contact the administrator with
                your payment reference.
              </p>
            </div>
            <a
              href="https://wa.me/254116553618?text=Hello%20ScholarShelf%20support%2C%20I%20need%20help%20with%20the%20portal."
              target="_blank"
              rel="noreferrer"
              aria-label="Contact ScholarShelf support on WhatsApp at plus 254 116 553 618"
              className="inline-flex w-fit items-center gap-2 rounded-full border border-[#b8d1c5] px-5 py-2.5 text-sm font-semibold text-[#1d5146] transition hover:-translate-y-0.5 hover:bg-white hover:shadow-sm"
            >
              <MessageCircle size={17} /> WhatsApp support
            </a>
          </div>
        </section>
      </main>
      <footer className="border-t border-[#dce7e1] bg-[#153c34] text-[#c2d9cf]">
        <div className="container flex flex-col gap-4 py-8 text-sm md:flex-row md:items-center md:justify-between">
          <div className="font-serif text-lg text-white">
            Scholar<span className="text-[#e6c46f]">Shelf</span>
          </div>
          <div className="text-xs text-[#91b0a4]">
            Only authorized learning documents may be uploaded and distributed.
          </div>
          <div className="text-xs text-[#91b0a4]">© 2026 ScholarShelf</div>
          <div className="text-xs text-[#91b0a4]">
            Powered by{" "}
            <span className="font-semibold text-[#d6e8df]">Lee Tech</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
