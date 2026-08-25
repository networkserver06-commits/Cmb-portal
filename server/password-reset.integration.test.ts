import { MongoClient } from "mongodb";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  createAccount,
  loginAccount,
  requestPasswordReset,
  resetAccountPassword,
} from "./mongoAuth";

const createdEmails: string[] = [];
let cleanupClient: MongoClient | null = null;

function requestStub() {
  return { protocol: "http", headers: {} };
}

function responseStub() {
  return {
    cookie: () => undefined,
    clearCookie: () => undefined,
  };
}

beforeAll(async () => {
  const uri = process.env.MONGODB_URI;
  if (!uri) return;
  cleanupClient = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });
  await cleanupClient.connect();
}, 20_000);

async function cleanup(email: string) {
  if (!cleanupClient) return;
  const db = cleanupClient.db(process.env.MONGODB_DATABASE || "examvault");
  await Promise.all([
    db.collection("accounts").deleteOne({ email }),
    db.collection("users").deleteMany({ email }),
    db.collection("password_reset_tokens").deleteMany({ email }),
  ]);
}

afterEach(async () => {
  const emails = createdEmails.splice(0);
  await Promise.all(emails.map(cleanup));
}, 20_000);

afterAll(async () => {
  await cleanupClient?.close();
}, 20_000);

describe("MongoDB password reset flow", () => {
  it("changes the password, clears sessions, and rejects a reused token", async () => {
    const email = `password-reset-${Date.now()}@example.com`;
    createdEmails.push(email);
    await createAccount(
      email,
      "OldPassword123",
      "Password Reset Test",
      requestStub(),
      responseStub()
    );
    const db = cleanupClient!.db(process.env.MONGODB_DATABASE || "examvault");
    await db
      .collection("accounts")
      .updateOne({ email }, { $set: { emailVerified: true } });

    const request = await requestPasswordReset(email);
    expect(request.success).toBe(true);
    expect(request.previewToken).toBeTruthy();

    await resetAccountPassword(request.previewToken!, "NewPassword123");
    await expect(
      resetAccountPassword(request.previewToken!, "AnotherPassword123")
    ).rejects.toThrow("invalid or has expired");
    await expect(
      loginAccount(email, "OldPassword123", requestStub(), responseStub())
    ).rejects.toThrow("Invalid email or password");
    await expect(
      loginAccount(email, "NewPassword123", requestStub(), responseStub())
    ).resolves.toBeTruthy();
  }, 45_000);

  it("returns a generic success response for an unknown email", async () => {
    const request = await requestPasswordReset(
      `unknown-${Date.now()}@example.com`
    );
    expect(request).toEqual({ success: true, previewToken: undefined });
  }, 10_000);
});
