import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "./_core/index";
import { ENV } from "./_core/env";

let server: ReturnType<typeof createServer>;
let baseUrl = "";

beforeAll(async () => {
  server = createServer(await createApp());
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>(resolve => server.close(() => resolve()));
});

describe("deployment configuration health", () => {
  it("uses the configured public URL and exposes Leetec STK Push without leaking secrets", async () => {
    if (!ENV.appBaseUrl) return;
    const publicUrl = new URL(ENV.appBaseUrl);
    expect(["http:", "https:"]).toContain(publicUrl.protocol);
    const response = await fetch(`${baseUrl}/api/health`);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      status: "ok",
      appBaseUrlConfigured: true,
      paymentCollection: "leetec-stkpush",
    });
  });
});
