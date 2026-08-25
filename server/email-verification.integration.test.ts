import { MongoClient } from "mongodb";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createAccount, loginAccount, verifyEmailToken } from "./mongoAuth";

const createdEmails: string[] = [];
let cleanupClient: MongoClient | null = null;
const requestStub = () => ({ protocol: "http", headers: {} });
const responseStub = () => ({
  cookie: () => undefined,
  clearCookie: () => undefined,
});

beforeAll(async () => {
  const uri = process.env.MONGODB_URI;
  if (!uri) return;
  cleanupClient = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });
  await cleanupClient.connect();
}, 20_000);

afterEach(async () => {
  if (!cleanupClient) return;
  const db = cleanupClient.db(process.env.MONGODB_DATABASE || "examvault");
  await Promise.all(
    createdEmails
      .splice(0)
      .map(email =>
        Promise.all([
          db.collection("accounts").deleteOne({ email }),
          db.collection("users").deleteMany({ email }),
          db.collection("email_verification_tokens").deleteMany({ email }),
        ])
      )
  );
}, 20_000);

afterAll(async () => {
  await cleanupClient?.close();
}, 20_000);

describe("MongoDB email verification flow", () => {
  it("blocks an unverified account, verifies a preview token, and rejects reuse", async () => {
    const email = `email-verification-${Date.now()}@example.com`;
    createdEmails.push(email);
    const created = await createAccount(
      email,
      "VerifyPassword123",
      "Verification Test",
      requestStub(),
      responseStub()
    );
    expect(created.previewVerificationUrl).toContain("/verify-email?token=");
    await expect(
      loginAccount(email, "VerifyPassword123", requestStub(), responseStub())
    ).rejects.toThrow("verify your email");
    const token = new URL(
      `http://localhost${created.previewVerificationUrl}`
    ).searchParams.get("token");
    expect(token).toBeTruthy();
    await expect(verifyEmailToken(token!)).resolves.toEqual({ success: true });
    await expect(verifyEmailToken(token!)).rejects.toThrow(
      "invalid or has expired"
    );
    await expect(
      loginAccount(email, "VerifyPassword123", requestStub(), responseStub())
    ).resolves.toBeTruthy();
  }, 45_000);
});
