import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(
  new URL("../client/src/App.tsx", import.meta.url),
  "utf8"
);
const accountSource = readFileSync(
  new URL("../client/src/pages/Account.tsx", import.meta.url),
  "utf8"
);
const homeSource = readFileSync(
  new URL("../client/src/pages/Home.tsx", import.meta.url),
  "utf8"
);
const grokSource = readFileSync(
  new URL("../client/src/components/GrokStudyAssistant.tsx", import.meta.url),
  "utf8"
);
const stylesSource = readFileSync(
  new URL("../client/src/index.css", import.meta.url),
  "utf8"
);
const librarySource = readFileSync(
  new URL("../client/src/pages/Library.tsx", import.meta.url),
  "utf8"
);
const paymentSource = readFileSync(
  new URL("../client/src/pages/PaymentResult.tsx", import.meta.url),
  "utf8"
);
const adminOperationsSource = readFileSync(
  new URL("../client/src/pages/AdminOperations.tsx", import.meta.url),
  "utf8"
);
const resetSource = readFileSync(
  new URL("../client/src/pages/PasswordReset.tsx", import.meta.url),
  "utf8"
);
const verificationSource = readFileSync(
  new URL("../client/src/pages/EmailVerification.tsx", import.meta.url),
  "utf8"
);
const vercelApiSource = readFileSync(
  new URL("../api/index.ts", import.meta.url),
  "utf8"
);
const packageSource = readFileSync(
  new URL("../package.json", import.meta.url),
  "utf8"
);
const mongoAuthSource = readFileSync(
  new URL("./mongoAuth.ts", import.meta.url),
  "utf8"
);
const envSource = readFileSync(
  new URL("./_core/env.ts", import.meta.url),
  "utf8"
);
const serverCoreSource = readFileSync(
  new URL("./_core/index.ts", import.meta.url),
  "utf8"
);
const sdkSource = readFileSync(
  new URL("./_core/sdk.ts", import.meta.url),
  "utf8"
);
const serverAliasSources = [
  readFileSync(new URL("./_core/oauth.ts", import.meta.url), "utf8"),
  readFileSync(new URL("./_core/sdk.ts", import.meta.url), "utf8"),
  readFileSync(new URL("./_core/trpc.ts", import.meta.url), "utf8"),
  readFileSync(new URL("./routers.ts", import.meta.url), "utf8"),
  readFileSync(new URL("./_core/imageGeneration.ts", import.meta.url), "utf8"),
];
const vercelConfig = JSON.parse(
  readFileSync(new URL("../vercel.json", import.meta.url), "utf8")
) as {
  rewrites?: Array<{ source: string; destination: string }>;
};

describe("account route regression coverage", () => {
  it("brands verification and password-reset emails as automated no-reply messages", () => {
    expect(mongoAuthSource).toContain(
      "This is an automated message from ScholarShelf. Please do not reply to this email."
    );
    expect(mongoAuthSource).toContain("Powered by Lee Tech");
    expect(mongoAuthSource).toContain("Verify your ScholarShelf email");
    expect(mongoAuthSource).toContain("Reset your ScholarShelf password");
  });

  it("registers the default and explicit login/create-account routes", () => {
    expect(appSource).toContain('path={"/account"} component={AccountRoute}');
    expect(appSource).toContain('path={"/login"} component={LoginRoute}');
    expect(appSource).toContain(
      'path={"/signup"} component={CreateAccountRoute}'
    );
    expect(appSource).toContain(
      'path={"/create-account"} component={CreateAccountRoute}'
    );
    expect(appSource).toContain(
      'path={"/reset-password"} component={PasswordReset}'
    );
    expect(appSource).toContain(
      'path={"/verify-email"} component={EmailVerification}'
    );
    expect(appSource).toContain(
      'path={"/account/login"} component={LoginRoute}'
    );
    expect(appSource).toContain(
      'path={"/account/create"} component={CreateAccountRoute}'
    );
    expect(accountSource).toContain('initialMode = "login"');
    expect(appSource).toContain('initialMode="create"');
  });

  it("keeps auth entry and post-auth navigation inside the SPA router", () => {
    expect(homeSource).toMatch(/<Link\s+href="\/login"/);
    expect(homeSource).toMatch(/<Link\s+href="\/create-account"/);
    expect(homeSource).not.toContain('<a href="/account"');
    expect(accountSource).toContain("await utils.auth.me.invalidate()");
    expect(accountSource).toContain(
      'authenticatedUser?.role === "admin" ? "administrator" : "student"'
    );
    expect(accountSource).toContain(
      'destination === "student" && returnToPath'
    );
    expect(accountSource).toContain('"/admin"');
    expect(accountSource).toContain('"/account"');
    expect(accountSource).toContain("getSafeReturnTo");
    expect(accountSource).toContain("returnToPath");
    expect(accountSource).toContain("url.origin !== window.location.origin");
    expect(accountSource).toContain("returnToQuery");
    expect(accountSource).not.toContain('window.location.assign("/account")');
    expect(accountSource).toContain('href="/reset-password"');
    expect(accountSource).toContain("requestEmailVerification");
    expect(accountSource).toContain("unverifiedLogin");
    expect(accountSource).toContain("Resend verification email");
    expect(accountSource).toContain("aria-pressed={showPassword}");
    expect(accountSource).toContain(
      'title={showPassword ? "Hide password" : "Show password"}'
    );
    expect(accountSource).toContain('aria-label="Password strength"');
    expect(accountSource).toMatch(
      /Use 8\+ characters with lowercase, uppercase, a number, and\s+a symbol\./
    );
    expect(accountSource).toContain("getPasswordStrength(password)");
    expect(verificationSource).toContain("RESEND_COOLDOWN_SECONDS");
    expect(verificationSource).toContain("resendCooldown");
    expect(verificationSource).toContain("Resend available in");
    expect(verificationSource).toContain("Verification resend available in");
    expect(verificationSource).toContain(
      "new URLSearchParams(window.location.search)"
    );
    expect(verificationSource).toContain(
      "resend.isPending || resendCooldown > 0"
    );
  });

  it("includes smooth loading and transition states without breaking reduced-motion users", () => {
    expect(appSource).toContain(
      'className={isAccountFlow ? "account-route-transition" : undefined}'
    );
    expect(accountSource).toContain("function AccountLoading()");
    expect(accountSource).toContain("account-skeleton-line");
    expect(accountSource).toContain("aria-busy={pending}");
    expect(accountSource).toContain('role="status"');
    expect(accountSource).toContain("account-mode-content");
    expect(stylesSource).toContain("@keyframes account-route-transition");
    expect(stylesSource).toContain("@keyframes account-skeleton-shimmer");
    expect(stylesSource).toContain("@media (prefers-reduced-motion: reduce)");
    expect(stylesSource).toContain(".account-route-transition,");
    expect(stylesSource).toContain(".route-progress");
    expect(stylesSource).toContain("@keyframes route-progress-sweep");
  });

  it("gives paid catalogue papers a clear secure-purchase journey", () => {
    expect(homeSource).toContain('"Paid resource"');
    expect(homeSource).toContain('"Secure price"');
    expect(homeSource).toContain('"Buy securely"');
    expect(homeSource).toContain('"Sending phone prompt…"');
    expect(homeSource).toContain("confirmation returns you to your library");
    expect(homeSource).toContain(
      "Choose Sign in or Create account to continue from this resource."
    );
    expect(homeSource).toContain('authEntryHref("login", selectedPaper.id)');
    expect(homeSource).toMatch(
      /authEntryHref\(\s*"create-account",\s*selectedPaper\.id\s*\)/
    );
    expect(homeSource).toContain("checkoutReturnPath");
    expect(homeSource).toContain("selected resource will stay ready");
    expect(homeSource).toContain("new URLSearchParams(window.location.search)");
    expect(homeSource).toContain("<Dialog");
    expect(homeSource).toContain("GrokStudyAssistant");
    expect(grokSource).toContain("100 requests each day");
    expect(grokSource).toContain("Summarise a document");
    expect(grokSource).toContain("Ask Grok");
    expect(homeSource).toContain("walletBalance.refetch()");
    expect(homeSource).toContain("Checking your ScholarShelf wallet before checkout…");
    expect(homeSource).toContain('walletCheckState === "insufficient"');
    expect(homeSource).toContain("Enter a phone number to continue with LeeTec.");
    expect(homeSource).toContain("Enter a valid Kenyan mobile number before starting LeeTec checkout.");
    expect(homeSource).toContain("phoneNumber.replace(/\\D/g, \"\")");
    expect(homeSource).toContain("onOpenChange");
    expect(homeSource).toContain("cancelCheckout");
    expect(homeSource).toContain("checkoutIntent");
    expect(homeSource).toContain("EducationLevelSelect");
    expect(homeSource).toContain("levelFilter");
  });

  it("wires route progress into library, payment, and admin data loading", () => {
    expect(librarySource).toContain(
      'import RouteProgress from "@/components/RouteProgress"'
    );
    expect(librarySource).toContain("Checking your account access…");
    expect(librarySource).toContain("Loading your library resources…");
    expect(paymentSource).toContain(
      'import RouteProgress from "@/components/RouteProgress"'
    );
    expect(paymentSource).toContain("Loading your payment result…");
    expect(paymentSource).toContain("Waiting for LeeTec confirmation…");
    expect(paymentSource).toContain("trpc.student.paymentStatus.useQuery");
    expect(paymentSource).toContain("utils.student.library.invalidate()");
    expect(paymentSource).toContain(
      "href={`/api/papers/${paper.legacyId}/download`}"
    );
    expect(paymentSource).toContain("Download exam paper");
    expect(paymentSource).toContain(
      'const paid = order.status === "paid" && unlocked;'
    );
    expect(homeSource).toContain("aria-current={selectedPaperId === paper.id");
    expect(adminOperationsSource).toContain(
      'import RouteProgress from "@/components/RouteProgress"'
    );
    expect(adminOperationsSource).toContain("Syncing administrator workspace…");
  });

  it("protects reset links with preflight, loading, success, and invalid-token states", () => {
    expect(resetSource).toContain("resetPasswordTokenValid.useQuery");
    expect(resetSource).toContain("Checking your secure link…");
    expect(resetSource).toContain("This reset link is no longer valid.");
    expect(resetSource).toContain("Password updated");
    expect(resetSource).toContain('aria-live="polite"');
    expect(mongoAuthSource).toContain("validatePasswordResetToken");
    expect(mongoAuthSource).toContain("expiresAt: { $gt: new Date() }");
    expect(mongoAuthSource).toContain("usedAt: { $exists: false }");
  });

  it("maps production Resend delivery settings without exposing them to the client", () => {
    expect(envSource).toContain("resendApiKey: process.env.RESEND_API_KEY");
    expect(envSource).toContain(
      "passwordResetFromEmail: process.env.PASSWORD_RESET_FROM_EMAIL"
    );
    expect(mongoAuthSource).toContain(
      'fetch(\"https://api.resend.com/emails\"'
    );
    expect(mongoAuthSource).toContain(
      "ENV.isProduction ? undefined : rawToken"
    );
  });

  it("covers email verification pending, success, and invalid-link states", () => {
    expect(verificationSource).toContain("Confirming your email");
    expect(verificationSource).toContain("Your account is ready.");
    expect(verificationSource).toContain(
      "This verification link is no longer valid."
    );
    expect(verificationSource).toContain("Verification unavailable");
    expect(mongoAuthSource).toContain("emailVerified: false");
    expect(mongoAuthSource).toContain("verifyEmailToken");
    expect(mongoAuthSource).toContain("EMAIL_VERIFICATION_TTL_MS");
    expect(mongoAuthSource).toContain("normalizeEmailSender");
    expect(mongoAuthSource).toContain(
      "from: normalizeEmailSender(ENV.passwordResetFromEmail)"
    );
  });

  it("exposes the Express API through Vercel and protects API routes from the SPA fallback", () => {
    expect(vercelApiSource).toContain(
      'import { createApp } from "../dist/api.mjs"'
    );
    expect(packageSource).toContain("--outfile=dist/api.mjs");
    expect(packageSource).toContain("--external:./vite");
    expect(vercelApiSource).toContain("appPromise");
    const rewrites = vercelConfig.rewrites ?? [];
    expect(rewrites).toContainEqual({
      source: "/api/:path*",
      destination: "/api",
    });
    expect(rewrites).toContainEqual({
      source: "/((?!api(?:/|$)).*)",
      destination: "/index.html",
    });
  });

  it("keeps Vite and development plugins out of the Vercel API module graph", () => {
    expect(serverCoreSource).not.toContain(
      'import { serveStatic, setupVite } from "./vite"'
    );
    expect(serverCoreSource).toContain(
      'const { serveStatic, setupVite } = await import("./vite")'
    );
  });

  it("treats Manus OAuth as optional for MongoDB-only account authentication", () => {
    expect(sdkSource).toContain(
      "Manus OAuth is disabled; MongoDB account authentication remains active."
    );
    expect(sdkSource).not.toContain(
      "[OAuth] ERROR: OAUTH_SERVER_URL is not configured"
    );
  });

  it("keeps server-side internal imports resolvable without frontend aliases", () => {
    for (const source of serverAliasSources) {
      expect(source).not.toMatch(/from ["']@shared\//);
      expect(source).not.toMatch(/from ["']server\//);
    }
  });

  it("rewrites direct account URLs to the SPA entry point on Vercel", () => {
    const rewrites = vercelConfig.rewrites ?? [];
    for (const source of [
      "/account",
      "/account/:path*",
      "/login",
      "/signup",
      "/create-account",
      "/reset-password",
      "/verify-email",
    ]) {
      expect(rewrites).toContainEqual({ source, destination: "/index.html" });
    }
    expect(rewrites).toContainEqual({
      source: "/((?!api(?:/|$)).*)",
      destination: "/index.html",
    });
  });
});
