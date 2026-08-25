import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import {
  CheckCircle2,
  Link2,
  Loader2,
  LockKeyhole,
  MailCheck,
  XCircle,
} from "lucide-react";
import { trpc } from "@/lib/trpc";

const RESEND_COOLDOWN_SECONDS = 60;

type VerificationStatus =
  | "missing"
  | "pending"
  | "success"
  | "expired"
  | "error";

export default function EmailVerification() {
  const [location] = useLocation();
  const token = useMemo(
    () =>
      new URLSearchParams(window.location.search).get("token")?.trim() ?? "",
    [location]
  );
  const verify = trpc.auth.verifyEmail.useMutation();
  const resend = trpc.auth.requestEmailVerification.useMutation();
  const [resendEmail, setResendEmail] = useState("");
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resendNotice, setResendNotice] = useState("");

  useEffect(() => {
    if (token && verify.isIdle) verify.mutate({ token });
  }, [token, verify.isIdle]);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = window.setTimeout(
      () => setResendCooldown(value => Math.max(0, value - 1)),
      1000
    );
    return () => window.clearTimeout(timer);
  }, [resendCooldown]);

  const status: VerificationStatus = !token
    ? "missing"
    : verify.isPending
      ? "pending"
      : verify.isSuccess
        ? "success"
        : verify.isError
          ? verify.error.message.includes("invalid or has expired")
            ? "expired"
            : "error"
          : "pending";
  const copy = {
    missing: {
      eyebrow: "Verification link missing",
      title: "Open the link from your email.",
      body: "This page needs the secure token included in your ScholarShelf verification email.",
      action: "Back to sign in",
    },
    pending: {
      eyebrow: "Confirming your email",
      title: "Activating your account…",
      body: "We’re securely checking your one-time verification link. This should only take a moment.",
      action: "Back to sign in",
    },
    success: {
      eyebrow: "Email verified",
      title: "Your account is ready.",
      body: "Your email address is confirmed. Sign in securely to continue to your personal examination-paper library.",
      action: "Sign in securely",
    },
    expired: {
      eyebrow: "Link expired",
      title: "This verification link is no longer valid.",
      body: "Verification links expire after 24 hours and can only be used once. Request a fresh link below to continue.",
      action: "Return to sign in",
    },
    error: {
      eyebrow: "Verification unavailable",
      title: "We couldn’t verify your email right now.",
      body: "The verification service returned an unexpected error. Try again or request a fresh link below.",
      action: "Return to sign in",
    },
  }[status];
  const showResend =
    status === "missing" || status === "expired" || status === "error";
  const resendDisabled =
    resend.isPending || resendCooldown > 0 || !resendEmail.includes("@");
  const submitResend = (event: React.FormEvent) => {
    event.preventDefault();
    if (resendDisabled) return;
    setResendNotice("");
    resend.mutate(
      { email: resendEmail },
      {
        onSuccess: data => {
          setResendCooldown(RESEND_COOLDOWN_SECONDS);
          setResendNotice(
            "If this address is registered, a fresh verification link has been sent."
          );
          if (data.previewVerificationUrl)
            setResendNotice(`${data.previewVerificationUrl}`);
        },
      }
    );
  };

  return (
    <div className="min-h-screen bg-[#edf4f0] text-[#19312c] account-route-shell">
      <header className="border-b border-[#dce6e1] bg-white">
        <div className="container flex h-20 items-center justify-between">
          <Link
            href="/login"
            className="flex items-center gap-2 text-sm font-semibold text-[#1d5146]"
          >
            ← Back to sign in
          </Link>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-[#789087]">
            <LockKeyhole size={15} /> Secure account access
          </div>
        </div>
      </header>
      <main className="container grid max-w-5xl gap-10 py-12 md:grid-cols-[.85fr_1.15fr] md:items-center md:py-20">
        <section className="hidden md:block account-reveal">
          <p className="section-eyebrow">Account verification</p>
          <h1 className="mt-3 max-w-md font-serif text-5xl font-semibold leading-tight text-[#173e35]">
            One small step back to your library.
          </h1>
          <p className="mt-5 max-w-md text-lg leading-8 text-[#648078]">
            Verify the email you used to create your account, then continue to
            your trusted study resources.
          </p>
          <div className="mt-8 flex items-center gap-3 text-sm text-[#4b8876]">
            <MailCheck size={17} /> Verification links expire after 24 hours.
          </div>
        </section>
        <section className="account-panel-loading rounded-3xl border border-[#d9e6df] bg-white p-7 text-center shadow-xl shadow-[#1d5146]/8 sm:p-10 account-reveal">
          <div
            className={`mx-auto grid h-14 w-14 place-items-center rounded-2xl ${status === "success" ? "bg-[#e5f2eb] text-[#34745f]" : status === "error" || status === "expired" || status === "missing" ? "bg-[#fff4f3] text-[#a44e49]" : "bg-[#e8f1ed] text-[#2d7965]"}`}
          >
            {status === "pending" ? (
              <Loader2 className="account-spinner" size={23} />
            ) : status === "success" ? (
              <CheckCircle2 size={23} />
            ) : status === "error" || status === "expired" ? (
              <XCircle size={23} />
            ) : status === "missing" ? (
              <Link2 size={23} />
            ) : (
              <MailCheck size={23} />
            )}
          </div>
          <p className="section-eyebrow mt-6">{copy.eyebrow}</p>
          <h2 className="mt-2 font-serif text-3xl font-semibold text-[#173e35]">
            {copy.title}
          </h2>
          <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-[#718780]">
            {copy.body}
          </p>
          {showResend && (
            <form
              onSubmit={submitResend}
              className="mx-auto mt-6 max-w-md text-left"
            >
              <label className="block text-xs font-semibold text-[#3c5d53]">
                Email address
                <input
                  value={resendEmail}
                  onChange={event => setResendEmail(event.target.value)}
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="you@example.com"
                  className="mt-2 h-11 w-full rounded-xl border border-[#d9e6df] px-3 text-sm text-[#19312c] outline-none transition focus:border-[#4b8876] focus:ring-2 focus:ring-[#4b8876]/20"
                />
              </label>
              <button
                type="submit"
                disabled={resendDisabled}
                className="mt-3 inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-[#1d5146] px-5 text-sm font-semibold text-white transition hover:bg-[#153c34] disabled:cursor-not-allowed disabled:opacity-55"
              >
                {resend.isPending && (
                  <Loader2 className="account-spinner" size={16} />
                )}
                {resend.isPending
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
              {resendNotice && (
                <p
                  role="status"
                  aria-live="polite"
                  className="mt-3 break-words text-xs font-medium text-[#34745f]"
                >
                  {resendNotice.startsWith("/")
                    ? "A fresh verification link is ready in this preview."
                    : resendNotice}
                </p>
              )}
              {resend.data?.previewVerificationUrl && (
                <a
                  href={resend.data.previewVerificationUrl}
                  className="mt-2 block text-center text-xs font-semibold text-[#1d5146] underline underline-offset-4"
                >
                  Open preview verification link
                </a>
              )}
            </form>
          )}
          {status === "success" && (
            <Link
              href="/login"
              className="mt-7 inline-flex h-11 w-full items-center justify-center rounded-full bg-[#1d5146] px-5 text-sm font-semibold text-white transition hover:bg-[#153c34]"
            >
              {copy.action}
            </Link>
          )}
          {status !== "success" && !showResend && (
            <Link
              href="/login"
              className="mt-7 inline-flex h-11 w-full items-center justify-center rounded-full bg-[#1d5146] px-5 text-sm font-semibold text-white transition hover:bg-[#153c34]"
            >
              {copy.action}
            </Link>
          )}
          {showResend && (
            <Link
              href="/login"
              className="mt-5 inline-flex text-xs font-semibold text-[#1d5146] underline underline-offset-4"
            >
              {copy.action}
            </Link>
          )}
        </section>
      </main>
    </div>
  );
}
