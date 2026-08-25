import { createServer, type Server } from "node:http";
import { MongoClient } from "mongodb";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const originalVercel = process.env.VERCEL;
process.env.VERCEL = "1";
const { createApp } = await import("./_core/index");
if (originalVercel === undefined) delete process.env.VERCEL;
else process.env.VERCEL = originalVercel;

const email = `api-route-test-${Date.now()}@example.com`;
let server: Server;
let baseUrl = "";

describe("Vercel account API adapter", () => {
  beforeAll(async () => {
    const app = await createApp();
    server = createServer(app);
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("Unable to determine test server address");
    baseUrl = `http://127.0.0.1:${address.port}`;
  }, 30_000);

  afterAll(async () => {
    await new Promise<void>(resolve => server.close(() => resolve()));
    const client = new MongoClient(process.env.MONGODB_URI);
    try {
      await client.connect();
      const db = client.db(process.env.MONGODB_DATABASE || "examvault");
      await Promise.all([
        db.collection("accounts").deleteMany({ email }),
        db.collection("users").deleteMany({ email }),
        db.collection("email_verification_tokens").deleteMany({ email }),
      ]);
    } finally {
      await client.close();
    }
  }, 30_000);

  it("returns parseable JSON for a create-account mutation", async () => {
    const response = await fetch(
      `${baseUrl}/api/trpc/auth.createAccount?batch=1`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify({
          0: {
            json: {
              name: "API Route Test",
              email,
              password: "Temporary-Smoke-123",
            },
          },
        }),
      }
    );
    const text = await response.text();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    const payload = JSON.parse(text) as Array<{
      result?: { data?: { json?: { success?: boolean; email?: string } } };
    }>;
    expect(payload[0]?.result?.data?.json).toMatchObject({
      success: true,
      email,
    });
  }, 30_000);
});
