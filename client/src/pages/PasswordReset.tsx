import { useState } from "react";
import { Link } from "wouter";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  LockKeyhole,
  MailCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";

function resetTokenFromUrl() {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get("token")?.trim() ?? "";
}

function ResetShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#edf4f0] text-[#19312c] account-route-shell">
      <header className="border-b border-[#dce6e1] bg-white">
        <div className="container flex h-20 items-center justify-between">
          <Link
            href="/login"
            className="flex items-center gap-2 text-sm font-semibold text-[#1d5146]"
          >
            <ArrowLeft size={16} /> Back to sign in
          </Link>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-[#789087]">
            <LockKeyhole size={15} /> Secure password recovery
          </div>
        </div>
      </header>
      <main className="container grid max-w-5xl gap-10 py-12 md:grid-cols-[.85fr_1.15fr] md:items-center md:py-20">
        <section className="hidden md:block account-reveal">
          <p className="section-eyebrow">Account recovery</p>
          <h1 className="mt-3 max-w-md font-serif text-5xl font-semibold leading-tight text-[#173e35]">
            Return to your library with confidence.
          </h1>
          <p className="mt-5 max-w-md text-lg leading-8 text-[#648078]">
            Reset your password with a short-lived secure link, then continue to
            your purchased papers and study resources.
          </p>
          <div className="mt-8 flex items-center gap-3 text-sm text-[#4b8876]">
            <KeyRound size={17} /> Reset links expire after 30 minutes.
          </div>
        </section>
        <section className="rounded-3xl border border-[#d9e6df] bg-white p-6 shadow-xl shadow-[#1d5146]/8 sm:p-9 account-panel-transition">
          {children}
        </section>
      </main>
    </div>
  );
}

function ResetHeader({ completion }: { completion: boolean }) {
  return (
    <div className="account-mode-content">
      <div className="grid h-12 w-12 place-items-center rounded-2xl bg-[#e8f1ed] text-[#2d7965]">
        <KeyRound size={22} />
      </div>
      <h2 className="mt-6 font-serif text-3xl font-semibold text-[#173e35]">
        {completion ? "Choose a new password" : "Reset your password"}
      </h2>
      <p className="mt-2 text-sm leading-6 text-[#718780]">
        {completion
          ? "Set a fresh password for your ExamVault student account."
          : "Enter your account email and we’ll help you securely get back in."}
      </p>
    </div>
  );
}

export default function PasswordReset() {
  const [token] = useState(resetTokenFromUrl);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [requested, setRequested] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [previewResetUrl, setPreviewResetUrl] = useState("");
  const [error, setError] = useState("");

  const request = trpc.auth.requestPasswordReset.useMutation({
    onSuccess: data => {
      setPreviewResetUrl(data.previewResetUrl ?? "");
      setRequested(true);
    },
    onError: value => setError(value.message),
  });
  const complete = trpc.auth.resetPassword.useMutation({
    onSuccess: () => setCompleted(true),
    onError: value => setError(value.message),
  });
  const tokenValidation = trpc.auth.resetPasswordTokenValid.useQuery(
    { token },
    { enabled: Boolean(token), retry: false }
  );

  const submitRequest = (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    request.mutate({ email });
  };

  const submitCompletion = (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    if (password.length < 8)
      return setError("Use a password with at least 8 characters.");
    if (password !== confirmPassword)
      return setError("Your passwords do not match.");
    complete.mutate({ token, password });
  };

  if (token && tokenValidation.isLoading) {
    return (
      <ResetShell>
        <div
          className="account-mode-content text-center"
          role="status"
          aria-live="polite"
        >
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-[#e8f1ed] text-[#2d7965]">
            <Loader2 className="account-spinner" size={30} />
          </div>
          <p className="mt-6 section-eyebrow">Verifying reset link</p>
          <h2 className="mt-2 font-serif text-3xl font-semibold text-[#173e35]">
            Checking your secure link…
          </h2>
          <p className="mt-3 text-sm leading-6 text-[#718780]">
            We’re confirming that this password-reset link is still valid.
          </p>
        </div>
      </ResetShell>
    );
  }

  if (token && tokenValidation.error) {
    return (
      <ResetShell>
        <div className="account-mode-content text-center">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-[#fff4d5] text-[#94701d]">
            <AlertCircle size={31} />
          </div>
          <p className="mt-6 section-eyebrow">Verification unavailable</p>
          <h2 className="mt-2 font-serif text-3xl font-semibold text-[#173e35]">
            We couldn’t verify this link.
          </h2>
          <p className="mt-3 text-sm leading-6 text-[#718780]">
            Please request a new reset link and try again.
          </p>
          <Link
            href="/reset-password"
            className="mt-7 inline-flex h-11 w-full items-center justify-center rounded-full bg-[#1d5146] px-5 text-sm font-semibold text-white transition hover:bg-[#153c34]"
          >
            Request a new link
          </Link>
        </div>
      </ResetShell>
    );
  }

  if (token && tokenValidation.data === false) {
    return (
      <ResetShell>
        <div className="account-mode-content text-center">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-[#fff1ef] text-[#a44e49]">
            <AlertCircle size={31} />
          </div>
          <p className="mt-6 section-eyebrow">Link expired</p>
          <h2 className="mt-2 font-serif text-3xl font-semibold text-[#173e35]">
            This reset link is no longer valid.
          </h2>
          <p className="mt-3 text-sm leading-6 text-[#718780]">
            Reset links expire after 30 minutes and can only be used once.
            Request a new one to continue.
          </p>
          <Link
            href="/reset-password"
            className="mt-7 inline-flex h-11 w-full items-center justify-center rounded-full bg-[#1d5146] px-5 text-sm font-semibold text-white transition hover:bg-[#153c34]"
          >
            Request a new link
          </Link>
        </div>
      </ResetShell>
    );
  }

  if (completed) {
    return (
      <ResetShell>
        <div className="account-mode-content text-center">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-[#e5f2eb] text-[#34745f]">
            <CheckCircle2 size={31} />
          </div>
          <p className="mt-6 section-eyebrow">Password updated</p>
          <h2 className="mt-2 font-serif text-3xl font-semibold text-[#173e35]">
            You’re ready to sign in.
          </h2>
          <p className="mt-3 text-sm leading-6 text-[#718780]">
            Your password has been changed and previous sessions were signed out
            for your protection.
          </p>
          <Link
            href="/login"
            className="mt-7 inline-flex h-11 w-full items-center justify-center rounded-full bg-[#1d5146] px-5 text-sm font-semibold text-white transition hover:bg-[#153c34]"
          >
            Continue to sign in
          </Link>
        </div>
      </ResetShell>
    );
  }

  if (token) {
    return (
      <ResetShell>
        <ResetHeader completion />
        <form
          onSubmit={submitCompletion}
          className="mt-7 space-y-4"
          aria-busy={complete.isPending}
        >
          {error && (
            <div
              role="alert"
              className="account-alert flex items-start gap-2 rounded-xl border border-[#efc8c5] bg-[#fff4f3] p-3 text-sm text-[#a44e49]"
            >
              <AlertCircle size={17} className="mt-0.5 shrink-0" />
              {error}
            </div>
          )}
          <label className="block text-sm font-medium text-[#3c5d53]">
            New password
            <div className="relative mt-2">
              <Input
                value={password}
                onChange={event => setPassword(event.target.value)}
                type={showPassword ? "text" : "password"}
                required
                autoComplete="new-password"
                placeholder="At least 8 characters"
                className="h-11 rounded-xl border-[#d9e6df] pr-11"
              />
              <button
                type="button"
                onClick={() => setShowPassword(value => !value)}
                aria-label={
                  showPassword ? "Hide new password" : "Show new password"
                }
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#789087]"
              >
                {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
          </label>
          <label className="block text-sm font-medium text-[#3c5d53]">
            Confirm new password
            <div className="relative mt-2">
              <Input
                value={confirmPassword}
                onChange={event => setConfirmPassword(event.target.value)}
                type={showConfirmPassword ? "text" : "password"}
                required
                autoComplete="new-password"
                placeholder="Repeat your new password"
                className="h-11 rounded-xl border-[#d9e6df] pr-11"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(value => !value)}
                aria-label={
                  showConfirmPassword
                    ? "Hide confirmation password"
                    : "Show confirmation password"
                }
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#789087]"
              >
                {showConfirmPassword ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
          </label>
          {complete.isPending && (
            <div
              className="account-auth-status flex items-center gap-2 text-xs font-medium text-[#4b8876]"
              role="status"
              aria-live="polite"
            >
              <Loader2 className="account-spinner" size={15} />
              Updating your secure password…
            </div>
          )}
          <Button
            disabled={complete.isPending}
            className="h-11 w-full rounded-full bg-[#1d5146] hover:bg-[#153c34]"
          >
            {complete.isPending && (
              <Loader2 className="account-spinner" size={17} />
            )}
            {complete.isPending ? "Updating password…" : "Set new password"}
          </Button>
        </form>
        <p className="mt-6 text-center text-xs leading-5 text-[#8aa098]">
          This link can only be used once and expires after 30 minutes.
        </p>
      </ResetShell>
    );
  }

  if (requested) {
    return (
      <ResetShell>
        <div className="account-mode-content text-center">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-[#e5f2eb] text-[#34745f]">
            <MailCheck size={31} />
          </div>
          <p className="mt-6 section-eyebrow">Request received</p>
          <h2 className="mt-2 font-serif text-3xl font-semibold text-[#173e35]">
            Check your inbox.
          </h2>
          <p className="mt-3 text-sm leading-6 text-[#718780]">
            If an account exists for that email, a short-lived password-reset
            link will be sent. The link expires after 30 minutes.
          </p>
          {previewResetUrl && (
            <div className="mt-6 rounded-2xl border border-[#d9e6df] bg-[#f5f9f6] p-4 text-left">
              <div className="text-xs font-semibold uppercase tracking-[0.15em] text-[#789087]">
                Preview reset link
              </div>
              <p className="mt-2 text-xs leading-5 text-[#718780]">
                Preview mode exposes the link here so the full flow can be
                tested without an email provider.
              </p>
              <a
                href={previewResetUrl}
                className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-[#1d5146] underline underline-offset-4"
              >
                Open reset link <ArrowLeft className="rotate-180" size={15} />
              </a>
            </div>
          )}
          <Link
            href="/login"
            className="mt-7 inline-flex h-11 w-full items-center justify-center rounded-full border border-[#bfd5c9] px-5 text-sm font-semibold text-[#1d5146] transition hover:bg-[#f5f9f6]"
          >
            Return to sign in
          </Link>
        </div>
      </ResetShell>
    );
  }

  return (
    <ResetShell>
      <ResetHeader completion={false} />
      <form
        onSubmit={submitRequest}
        className="mt-7 space-y-4"
        aria-busy={request.isPending}
      >
        {error && (
          <div
            role="alert"
            className="account-alert flex items-start gap-2 rounded-xl border border-[#efc8c5] bg-[#fff4f3] p-3 text-sm text-[#a44e49]"
          >
            <AlertCircle size={17} className="mt-0.5 shrink-0" />
            {error}
          </div>
        )}
        <label className="block text-sm font-medium text-[#3c5d53]">
          Email address
          <Input
            value={email}
            onChange={event => setEmail(event.target.value)}
            type="email"
            required
            autoComplete="email"
            placeholder="you@example.com"
            className="mt-2 h-11 rounded-xl border-[#d9e6df]"
          />
        </label>
        {request.isPending && (
          <div
            className="account-auth-status flex items-center gap-2 text-xs font-medium text-[#4b8876]"
            role="status"
            aria-live="polite"
          >
            <Loader2 className="account-spinner" size={15} />
            Preparing your secure reset link…
          </div>
        )}
        <Button
          disabled={request.isPending}
          className="h-11 w-full rounded-full bg-[#1d5146] hover:bg-[#153c34]"
        >
          {request.isPending && (
            <Loader2 className="account-spinner" size={17} />
          )}
          {request.isPending
            ? "Sending reset instructions…"
            : "Send reset instructions"}
        </Button>
      </form>
      <div className="mt-6 flex items-center justify-between text-xs">
        <Link
          href="/login"
          className="font-semibold text-[#1d5146] underline underline-offset-4"
        >
          Back to sign in
        </Link>
        <Link
          href="/create-account"
          className="font-semibold text-[#1d5146] underline underline-offset-4"
        >
          Create account
        </Link>
      </div>
    </ResetShell>
  );
}
