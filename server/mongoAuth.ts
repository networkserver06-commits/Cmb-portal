import {
  createHash,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { ENV } from "./_core/env";
import { getSessionCookieOptions } from "./_core/cookies";
import { getUserByOpenId, upsertUser } from "./db";
import { mongo } from "./mongoStore";

export const ACCOUNT_COOKIE = "examvault_account";
const PASSWORD_RESET_TTL_MS = 1000 * 60 * 30;
const EMAIL_VERIFICATION_TTL_MS = 1000 * 60 * 60 * 24;

type AccountRecord = {
  email: string;
  name: string;
  passwordHash: string;
  passwordSalt: string;
  sessionTokenHash?: string;
  sessionExpiresAt?: Date;
  mysqlOpenId: string;
  createdAt: Date;
  emailVerified?: boolean;
};

type EmailVerificationRecord = {
  tokenHash: string;
  email: string;
  expiresAt: Date;
  usedAt?: Date;
  createdAt: Date;
};

type PasswordResetRecord = {
  tokenHash: string;
  email: string;
  expiresAt: Date;
  usedAt?: Date;
  createdAt: Date;
};

async function database() {
  return mongo();
}

async function collection() {
  return (await database()).collection<AccountRecord>("accounts");
}

async function resetCollection() {
  return (await database()).collection<PasswordResetRecord>(
    "password_reset_tokens"
  );
}

async function verificationCollection() {
  return (await database()).collection<EmailVerificationRecord>(
    "email_verification_tokens"
  );
}

function normalizeEmailSender(value: string) {
  const match = value.match(/<([^<>\s]+@[^<>\s]+)>/);
  return (match?.[1] ?? value).trim();
}

function publicPortalUrl(path: string) {
  if (!ENV.appBaseUrl) throw new Error("APP_BASE_URL is not configured");
  let base: URL;
  try {
    base = new URL(ENV.appBaseUrl);
  } catch {
    throw new Error("APP_BASE_URL must be a valid absolute URL");
  }
  if (base.protocol !== "https:" && base.protocol !== "http:")
    throw new Error("APP_BASE_URL must use HTTP or HTTPS");
  return new URL(path, `${base.toString().replace(/\/+$/, "")}/`).toString();
}

async function deliverEmailVerification(email: string, rawToken: string) {
  if (!ENV.isProduction) return;
  if (!ENV.resendApiKey || !ENV.passwordResetFromEmail)
    throw new Error("Email verification delivery is not configured");
  const verifyUrl = publicPortalUrl(
    `/verify-email?token=${encodeURIComponent(rawToken)}`
  );
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ENV.resendApiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from: normalizeEmailSender(ENV.passwordResetFromEmail),
      to: [email],
      subject: "Verify your ExamVault email",
      html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#19312c"><h2>Verify your ExamVault email</h2><p>Confirm your email within 24 hours to activate your ExamVault account.</p><p><a href="${verifyUrl}" style="color:#1d5146;font-weight:700">Verify email address</a></p></div>`,
      text: `Verify your ExamVault email: ${verifyUrl}\n\nThis link expires in 24 hours.`,
    }),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.error(
      `[Auth] Verification email failed (${response.status})${detail ? `: ${detail}` : ""}`
    );
    throw new Error("Verification email could not be sent. Please try again.");
  }
}

async function issueEmailVerification(email: string) {
  const rawToken = issueToken();
  const verificationTokens = await verificationCollection();
  await verificationTokens.deleteMany({ email });
  await verificationTokens.insertOne({
    tokenHash: hashToken(rawToken),
    email,
    expiresAt: new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS),
    createdAt: new Date(),
  });
  try {
    await deliverEmailVerification(email, rawToken);
  } catch (error) {
    await verificationTokens.deleteOne({ tokenHash: hashToken(rawToken) });
    throw error;
  }
  return {
    success: true as const,
    previewVerificationUrl: ENV.isProduction
      ? undefined
      : `/verify-email?token=${encodeURIComponent(rawToken)}`,
  };
}

async function deliverPasswordResetEmail(email: string, rawToken: string) {
  if (!ENV.isProduction) return;
  if (!ENV.resendApiKey || !ENV.passwordResetFromEmail) {
    throw new Error("Password reset email delivery is not configured");
  }
  const resetUrl = publicPortalUrl(
    `/reset-password?token=${encodeURIComponent(rawToken)}`
  );
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ENV.resendApiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from: normalizeEmailSender(ENV.passwordResetFromEmail),
      to: [email],
      subject: "Reset your ExamVault password",
      html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#19312c"><h2>Reset your ExamVault password</h2><p>This secure link expires in 30 minutes and can only be used once.</p><p><a href="${resetUrl}" style="color:#1d5146;font-weight:700">Choose a new password</a></p><p>If you did not request this, you can safely ignore this email.</p></div>`,
      text: `Reset your ExamVault password: ${resetUrl}\n\nThis secure link expires in 30 minutes and can only be used once.`,
    }),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.error(
      `[Auth] Password reset email failed (${response.status})${detail ? `: ${detail}` : ""}`
    );
    throw new Error(
      "Password reset email could not be sent. Please try again."
    );
  }
}

function hashPassword(password: string, salt: string) {
  return scryptSync(password, salt, 64).toString("hex");
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function issueToken() {
  return randomBytes(32).toString("base64url");
}

function validPassword(password: string, stored: string, salt: string) {
  const actual = Buffer.from(hashPassword(password, salt), "hex");
  const expected = Buffer.from(stored, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

async function persistSession(record: AccountRecord, req: any, res: any) {
  const token = issueToken();
  const accounts = await collection();
  await accounts.updateOne(
    { email: record.email },
    {
      $set: {
        sessionTokenHash: hashToken(token),
        sessionExpiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
      },
    }
  );
  res.cookie(ACCOUNT_COOKIE, token, {
    ...getSessionCookieOptions(req),
    maxAge: 1000 * 60 * 60 * 24 * 30,
  });
}

export async function createAccount(
  email: string,
  password: string,
  name: string,
  req: any,
  res: any
) {
  const normalizedEmail = email.trim().toLowerCase();
  if (password.length < 8)
    throw new Error("Password must be at least 8 characters");
  const accounts = await collection();
  const existing = await accounts.findOne({ email: normalizedEmail });
  if (existing) throw new Error("An account with this email already exists");
  const mysqlOpenId = `mongo:${hashToken(normalizedEmail).slice(0, 48)}`;
  const salt = randomBytes(16).toString("hex");
  const record: AccountRecord = {
    email: normalizedEmail,
    name: name.trim(),
    passwordHash: hashPassword(password, salt),
    passwordSalt: salt,
    mysqlOpenId,
    createdAt: new Date(),
    emailVerified: false,
  };
  await accounts.insertOne(record);
  await upsertUser({
    openId: mysqlOpenId,
    email: normalizedEmail,
    name: name.trim(),
    loginMethod: "password",
  });
  try {
    return {
      email: normalizedEmail,
      ...(await issueEmailVerification(normalizedEmail)),
    };
  } catch (error) {
    await accounts.deleteOne({ email: normalizedEmail });
    throw error;
  }
}

export async function requestEmailVerification(email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const accounts = await collection();
  if (!(await accounts.findOne({ email: normalizedEmail })))
    return { success: true as const, previewVerificationUrl: undefined };
  return issueEmailVerification(normalizedEmail);
}

export async function loginAccount(
  email: string,
  password: string,
  req: any,
  res: any
) {
  const accounts = await collection();
  const record = await accounts.findOne({ email: email.trim().toLowerCase() });
  if (
    !record ||
    !validPassword(password, record.passwordHash, record.passwordSalt)
  )
    throw new Error("Invalid email or password");
  if (record.emailVerified === false)
    throw new Error("Please verify your email before signing in");
  await persistSession(record, req, res);
  return getUserByOpenId(record.mysqlOpenId);
}

export async function verifyEmailToken(token: string) {
  if (!token)
    throw new Error("This verification link is invalid or has expired.");
  const tokenHash = hashToken(token);
  const tokens = await verificationCollection();
  const verification = await tokens.findOneAndUpdate(
    { tokenHash, expiresAt: { $gt: new Date() }, usedAt: { $exists: false } },
    { $set: { usedAt: new Date() } },
    { returnDocument: "before" }
  );
  if (!verification)
    throw new Error("This verification link is invalid or has expired.");
  const accounts = await collection();
  const result = await accounts.updateOne(
    { email: verification.email },
    {
      $set: {
        emailVerified: true,
        emailVerifiedAt: new Date(),
        updatedAt: new Date(),
      },
    }
  );
  if (!result.matchedCount) throw new Error("Account not found");
  await tokens.deleteMany({
    email: verification.email,
    tokenHash: { $ne: tokenHash },
  });
  return { success: true as const };
}

/**
 * Creates a short-lived, hashed reset token. The raw token is returned only in
 * non-production so the preview can demonstrate completion without an email
 * provider. Production responses remain intentionally generic to prevent
 * account enumeration; a transactional email adapter should deliver the link.
 */
export async function requestPasswordReset(email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const accounts = await collection();
  const record = await accounts.findOne({ email: normalizedEmail });
  if (!record) return { success: true as const, previewToken: undefined };

  const rawToken = issueToken();
  const tokens = await resetCollection();
  await tokens.deleteMany({ email: normalizedEmail });
  const tokenHash = hashToken(rawToken);
  await tokens.insertOne({
    tokenHash,
    email: normalizedEmail,
    expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MS),
    createdAt: new Date(),
  });

  try {
    await deliverPasswordResetEmail(normalizedEmail, rawToken);
  } catch (error) {
    await tokens.deleteOne({ tokenHash });
    throw error;
  }

  return {
    success: true as const,
    previewToken: ENV.isProduction ? undefined : rawToken,
  };
}

export async function validatePasswordResetToken(token: string) {
  if (!token) return false;
  const tokens = await resetCollection();
  const reset = await tokens.findOne({
    tokenHash: hashToken(token),
    expiresAt: { $gt: new Date() },
    usedAt: { $exists: false },
  });
  return Boolean(reset);
}

export async function resetAccountPassword(token: string, password: string) {
  if (password.length < 8)
    throw new Error("Password must be at least 8 characters");
  const tokenHash = hashToken(token);
  const tokens = await resetCollection();
  const reset = await tokens.findOneAndUpdate(
    { tokenHash, expiresAt: { $gt: new Date() }, usedAt: { $exists: false } },
    { $set: { usedAt: new Date() } },
    { returnDocument: "before" }
  );
  if (!reset)
    throw new Error("This password reset link is invalid or has expired.");

  const salt = randomBytes(16).toString("hex");
  const accounts = await collection();
  const result = await accounts.updateOne(
    { email: reset.email },
    {
      $set: {
        passwordHash: hashPassword(password, salt),
        passwordSalt: salt,
        updatedAt: new Date(),
      },
      $unset: { sessionTokenHash: "", sessionExpiresAt: "" },
    }
  );
  if (!result.matchedCount) throw new Error("Account not found");
  return { success: true as const };
}

export async function authenticateAccount(token: string | undefined) {
  if (!token) return null;
  const accounts = await collection();
  const record = await accounts.findOne({
    sessionTokenHash: hashToken(token),
    sessionExpiresAt: { $gt: new Date() },
  });
  return record ? getUserByOpenId(record.mysqlOpenId) : null;
}

export async function logoutAccount(
  token: string | undefined,
  req: any,
  res: any
) {
  if (token) {
    const accounts = await collection();
    await accounts.updateOne(
      { sessionTokenHash: hashToken(token) },
      { $unset: { sessionTokenHash: "", sessionExpiresAt: "" } }
    );
  }
  if (token)
    res.clearCookie(ACCOUNT_COOKIE, {
      ...getSessionCookieOptions(req),
      maxAge: -1,
    });
}
