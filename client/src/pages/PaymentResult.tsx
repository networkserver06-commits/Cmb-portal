import { useAuth } from "@/_core/hooks/useAuth";
import { useEffect } from "react";
import { startLogin } from "@/const";
import { trpc } from "@/lib/trpc";
import { educationLevelLabel } from "@shared/educationLevels";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import RouteProgress from "@/components/RouteProgress";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Clock3,
  Download,
  Eye,
  FileText,
  Loader2,
  LockKeyhole,
} from "lucide-react";

function PaymentLoading({ label }: { label: string }) {
  return (
    <div className="min-h-screen bg-[#f7f8f6] text-[#19312c]">
      <RouteProgress visible label={label} />
      <main className="container max-w-3xl py-14 md:py-20">
        <div className="mx-auto max-w-xl text-center account-reveal">
          <span className="account-skeleton-line mx-auto h-16 w-16 rounded-full" />
          <span className="account-skeleton-line mx-auto mt-7 h-3 w-28" />
          <span className="account-skeleton-line mx-auto mt-4 h-10 w-80 max-w-full" />
          <span className="account-skeleton-line mx-auto mt-3 h-4 w-full max-w-lg" />
        </div>
        <div className="account-panel-transition mt-10 rounded-3xl border border-[#dfe9e3] bg-white p-6 shadow-sm md:p-8">
          <span className="account-skeleton-line h-12 w-12 rounded-xl" />
          <span className="account-skeleton-line mt-6 h-7 w-2/3" />
          <span className="account-skeleton-line mt-3 h-4 w-1/2" />
          <span className="account-skeleton-line mt-8 h-3 w-full" />
          <span className="account-skeleton-line mt-3 h-3 w-4/5" />
          <span className="account-skeleton-line mt-8 h-11 w-full rounded-full" />
        </div>
      </main>
    </div>
  );
}

export default function PaymentResult() {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const reference =
    new URLSearchParams(window.location.search).get("reference") ?? "";
  const utils = trpc.useUtils();
  const result = trpc.student.paymentResult.useQuery(
    { reference },
    { enabled: isAuthenticated && reference.length > 7 }
  );
  const paymentStatus = trpc.student.paymentStatus.useQuery(
    { reference },
    {
      enabled: isAuthenticated && reference.length > 7,
      refetchInterval: query =>
        query.state.data?.status === "pending" ? 4000 : false,
    }
  );
  useEffect(() => {
    if (paymentStatus.data?.status === "paid") {
      void result.refetch();
      void utils.student.library.invalidate();
    }
  }, [paymentStatus.data?.status, result, utils.student.library]);
  if (authLoading)
    return <PaymentLoading label="Checking your payment access…" />;
  if (!isAuthenticated)
    return (
      <div className="grid min-h-screen place-items-center bg-[#f7f8f6] p-6 text-center account-route-shell">
        <div className="account-panel-transition">
          <LockKeyhole className="mx-auto h-12 w-12 text-[#b88327]" />
          <h1 className="mt-5 font-serif text-3xl font-semibold text-[#173e35]">
            Sign in to view this payment
          </h1>
          <p className="mt-2 text-sm text-[#718780]">
            Your payment result and download are private to your account.
          </p>
          <Button
            className="mt-6 rounded-full bg-[#1d5146]"
            onClick={() => startLogin()}
          >
            Student sign in
          </Button>
        </div>
      </div>
    );
  if (!reference)
    return (
      <div className="grid min-h-screen place-items-center bg-[#f7f8f6] p-6 text-center account-route-shell">
        <div className="account-panel-transition">
          <AlertCircle className="mx-auto h-12 w-12 text-[#b88327]" />
          <h1 className="mt-5 font-serif text-3xl font-semibold text-[#173e35]">
            Payment reference required
          </h1>
          <p className="mt-2 text-sm text-[#718780]">
            Open this page from a LeeTec payment result or your account history.
          </p>
          <a href="/library">
            <Button className="mt-6 rounded-full bg-[#1d5146]">
              Open my library
            </Button>
          </a>
        </div>
      </div>
    );
  if (result.isLoading)
    return <PaymentLoading label="Loading your payment result…" />;
  if (result.error)
    return (
      <div className="grid min-h-screen place-items-center bg-[#f7f8f6] p-6 text-center account-route-shell">
        <div className="account-panel-transition">
          <AlertCircle className="mx-auto h-12 w-12 text-[#a44e49]" />
          <h1 className="mt-5 font-serif text-3xl font-semibold text-[#173e35]">
            We couldn’t load this payment
          </h1>
          <p className="mt-2 max-w-md text-sm text-[#718780]">
            Please return to your library and try again. Your payment reference
            remains private to your account.
          </p>
          <a href="/library">
            <Button className="mt-6 rounded-full bg-[#1d5146]">
              Open my library
            </Button>
          </a>
        </div>
      </div>
    );
  if (!result.data)
    return (
      <div className="grid min-h-screen place-items-center bg-[#f7f8f6] p-6 text-center account-route-shell">
        <div className="account-panel-transition">
          <AlertCircle className="mx-auto h-12 w-12 text-[#b88327]" />
          <h1 className="mt-5 font-serif text-3xl font-semibold text-[#173e35]">
            Payment reference not found
          </h1>
          <p className="mt-2 text-sm text-[#718780]">
            Check the reference in your LeeTec receipt or return to the
            catalogue.
          </p>
          <a href="/">
            <Button className="mt-6 rounded-full bg-[#1d5146]">
              Back to catalogue
            </Button>
          </a>
        </div>
      </div>
    );
  const { order, paper, unlocked } = result.data;
  if (!paper)
    return (
      <div className="grid min-h-screen place-items-center bg-[#f7f8f6] p-6 text-center account-route-shell">
        <div className="account-panel-transition">
          <AlertCircle className="mx-auto h-12 w-12 text-[#b88327]" />
          <h1 className="mt-5 font-serif text-3xl font-semibold text-[#173e35]">
            Paper record unavailable
          </h1>
          <p className="mt-2 text-sm text-[#718780]">
            Your order was found, but the paper metadata is currently
            unavailable.
          </p>
          <a href="/library">
            <Button className="mt-6 rounded-full bg-[#1d5146]">
              Open my library
            </Button>
          </a>
        </div>
      </div>
    );
  const paid = order.status === "paid" && unlocked;
  const failed = order.status === "failed";
  return (
    <div className="min-h-screen bg-[#f7f8f6] text-[#19312c] account-route-shell">
      <RouteProgress
        visible={order.status === "pending"}
        label="Waiting for LeeTec confirmation…"
      />
      <header className="border-b border-[#dce6e1] bg-white">
        <div className="container flex h-20 items-center justify-between">
          <a
            href="/"
            className="flex items-center gap-2 text-sm font-semibold text-[#1d5146]"
          >
            <ArrowLeft size={16} /> Back to catalogue
          </a>
          <a href="/library" className="text-sm font-semibold text-[#1d5146]">
            My library
          </a>
        </div>
      </header>
      <main className="container max-w-3xl py-14 md:py-20">
        <div className="text-center account-reveal">
          <div
            className={`mx-auto grid h-16 w-16 place-items-center rounded-full ${paid ? "bg-[#e5f2eb] text-[#34745f]" : failed ? "bg-[#fff1ef] text-[#a44e49]" : "bg-[#fff4d5] text-[#94701d]"}`}
          >
            {paid ? (
              <CheckCircle2 size={30} />
            ) : failed ? (
              <AlertCircle size={30} />
            ) : (
              <Clock3 size={30} />
            )}
          </div>
          <p className="mt-6 section-eyebrow">Payment result</p>
          <h1 className="mt-2 font-serif text-4xl font-semibold tracking-tight text-[#173e35]">
            {paid
              ? "Your paper is ready."
              : failed
                ? "Payment was not completed."
                : "Waiting for payment confirmation."}
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-[#718780]">
            {paid
              ? "LeeTec has confirmed your payment and the paper is unlocked in your personal library."
              : failed
                ? "You can safely return to the catalogue and retry checkout."
                : "Approve the LeeTec payment prompt on your phone. This page checks the order automatically."}
          </p>
        </div>
        <section className="account-panel-transition mt-10 rounded-3xl border border-[#dfe9e3] bg-white p-6 shadow-sm md:p-8">
          <div className="flex items-start gap-4">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-[#e8f1ed] text-[#2d7965]">
              <FileText size={22} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[10px] font-bold uppercase tracking-[0.17em] text-[#94aaa2]">
                Purchased examination paper
              </div>
              <h2 className="mt-2 font-serif text-2xl font-semibold text-[#173e35]">
                {paper.title}
              </h2>
              <p className="mt-1 text-sm text-[#718780]">
                {paper.course} · {paper.unit} ·{" "}
                {educationLevelLabel(paper.level)} · {paper.cycle}
              </p>
            </div>
            <Badge
              className={`border-0 ${paid ? "bg-[#e5f2eb] text-[#34745f]" : "bg-[#fff4d5] text-[#94701d]"}`}
            >
              {paid ? "Unlocked" : order.status}
            </Badge>
          </div>
          <div className="mt-7 grid gap-4 border-t border-[#edf2ef] pt-5 text-sm sm:grid-cols-2">
            <div>
              <div className="text-xs text-[#94aaa2]">Order reference</div>
              <div className="mt-1 break-all font-mono text-xs text-[#274d43]">
                {order.reference}
              </div>
            </div>
            <div>
              <div className="text-xs text-[#94aaa2]">Amount</div>
              <div className="mt-1 font-semibold text-[#1d5146]">
                KES {Number(order.amountKes).toLocaleString()}
              </div>
            </div>
          </div>
          {paid ? (
            <div className="mt-7 grid gap-3 sm:grid-cols-2">
              <a
                href={`/api/papers/${paper.legacyId}/full-view`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-[#bfd5c9] px-5 py-3 text-sm font-semibold text-[#1d5146] transition hover:bg-[#e8f1ed]"
              >
                <Eye size={17} /> View full document
              </a>
              <a
                href={`/api/papers/${paper.legacyId}/download`}
                className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#1d5146] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#153c34]"
              >
                <Download size={17} /> Download exam paper
              </a>
            </div>
          ) : (
            <a
              href="/"
              className="mt-7 inline-flex w-full items-center justify-center gap-2 rounded-full border border-[#bfd5c9] px-5 py-3 text-sm font-semibold text-[#1d5146]"
            >
              Return to catalogue
            </a>
          )}
        </section>
      </main>
    </div>
  );
}
