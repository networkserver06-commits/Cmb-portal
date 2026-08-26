import { createHmac } from "node:crypto";
import { createServer, type Server } from "node:http";
import { ObjectId } from "mongodb";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { createPaymentReference, createWalletTopUpReference } from "./paystack";
import { appRouter } from "./routers";
import {
  closeMongoConnectionForTests,
  mongo,
  nextId,
  walletForUser,
} from "./mongoStore";
import { createApp } from "./_core/index";

const originalFetch = globalThis.fetch;
const secret = process.env.PAYSTACK_SECRET_KEY ?? "integration-test-secret";
const userId = 900000 + Math.floor(Math.random() * 90000);
let server: Server;
let baseUrl = "";
const walletReferences: string[] = [];
const orderReferences: string[] = [];
const testUserIds = new Set<number>([userId]);
const testTopUpIds: number[] = [];
const testOrderIds: number[] = [];
const testPaperIds: number[] = [];
const providerResponses = new Map<
  string,
  {
    status: string;
    reference: string;
    amount: number;
    currency: string;
    channel: string;
  }
>();

function newTestUserId() {
  const id = 900000 + Math.floor(Math.random() * 90000);
  testUserIds.add(id);
  return id;
}

function authenticatedCaller(ownerId: number) {
  return appRouter.createCaller({
    req: {} as any,
    res: {} as any,
    user: { id: ownerId, role: "user" } as any,
  });
}

async function seedWalletTopUp(
  amountKes: number,
  status: "pending" | "paid" = "pending",
  ownerId = userId
) {
  testUserIds.add(ownerId);
  const database = await mongo();
  const legacyId = await nextId("test-wallet-webhook-topups");
  const reference = createWalletTopUpReference(ownerId);
  walletReferences.push(reference);
  testTopUpIds.push(legacyId);
  await database.collection("wallet_topups").insertOne({
    _id: new ObjectId(),
    legacyId,
    userId: ownerId,
    reference,
    phone: "+254700000000",
    amountKes,
    status,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return { legacyId, reference, amountKes };
}

function mockPaystack(
  reference: string,
  input: { status: string; amountKes: number }
) {
  providerResponses.set(reference, {
    status: input.status,
    reference,
    amount: input.amountKes * 100,
    currency: "KES",
    channel: "mobile_money",
  });
}

function signedWebhook(payload: unknown) {
  const rawBody = JSON.stringify(payload);
  const signature = createHmac("sha512", secret).update(rawBody).digest("hex");
  return { rawBody, signature };
}

async function postWebhook(payload: unknown) {
  const { rawBody, signature } = signedWebhook(payload);
  return originalFetch(`${baseUrl}/api/paystack/webhook`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-paystack-signature": signature,
    },
    body: rawBody,
  });
}

describe("wallet Paystack reconciliation and webhook fulfilment", () => {
  beforeAll(async () => {
    if (!process.env.PAYSTACK_SECRET_KEY)
      process.env.PAYSTACK_SECRET_KEY = secret;
    const app = await createApp();
    server = createServer(app);
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("Unable to determine test server address");
    baseUrl = `http://127.0.0.1:${address.port}`;
  }, 30_000);

  afterEach(() => {
    providerResponses.clear();
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await new Promise<void>(resolve => server.close(() => resolve()));
    const database = await mongo();
    await Promise.all([
      database
        .collection("wallet_topups")
        .deleteMany({ reference: { $in: walletReferences } }),
      database
        .collection("orders")
        .deleteMany({ reference: { $in: orderReferences } }),
      database
        .collection("payments")
        .deleteMany({ providerReference: { $in: orderReferences } }),
      database
        .collection("entitlements")
        .deleteMany({ orderId: { $in: testOrderIds } }),
      database.collection("operational_records").deleteMany({
        $or: [
          { actorId: { $in: [...testUserIds] } },
          { subjectId: { $in: testTopUpIds.map(String) } },
        ],
      }),
    ]);
    await closeMongoConnectionForTests();
  }, 30_000);

  function stubProviderVerification() {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      if (url.startsWith("https://api.paystack.co/transaction/verify/")) {
        const reference = decodeURIComponent(url.split("/").pop() ?? "");
        const provider = providerResponses.get(reference);
        if (!provider)
          return new Response(
            JSON.stringify({
              status: false,
              message: "Unknown test reference",
            }),
            { status: 404, headers: { "content-type": "application/json" } }
          );
        return new Response(
          JSON.stringify({
            status: true,
            message: "Verification successful",
            data: {
              status: provider.status,
              reference: provider.reference,
              amount: provider.amount,
              currency: provider.currency,
              channel: provider.channel,
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      return originalFetch(input, init);
    });
  }

  it("settles a pending successful top-up into the balance exactly once", async () => {
    const testUser = newTestUserId();
    const topUp = await seedWalletTopUp(25, "pending", testUser);
    mockPaystack(topUp.reference, {
      status: "success",
      amountKes: topUp.amountKes,
    });
    stubProviderVerification();

    const caller = authenticatedCaller(testUser);
    const first = await caller.student.wallet();
    const second = await caller.student.wallet();
    const wallet = await walletForUser(testUser);
    const database = await mongo();
    const row = await database
      .collection("wallet_topups")
      .findOne({ reference: topUp.reference });
    const confirmations = await database
      .collection("operational_records")
      .countDocuments({
        eventType: "wallet.top_up_confirmed",
        subjectId: String(topUp.legacyId),
      });

    expect(first.balanceKes).toBe(25);
    expect(second.balanceKes).toBe(25);
    expect(row?.status).toBe("paid");
    expect(wallet.balanceKes).toBe(25);
    expect(wallet.totalTopUps).toBe(1);
    expect(confirmations).toBe(1);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  }, 30_000);

  it("moves pending provider failures to failed without crediting the wallet", async () => {
    const testUser = newTestUserId();
    const failed = await seedWalletTopUp(40, "pending", testUser);
    const abandoned = await seedWalletTopUp(50, "pending", testUser);
    mockPaystack(failed.reference, {
      status: "failed",
      amountKes: failed.amountKes,
    });
    mockPaystack(abandoned.reference, {
      status: "abandoned",
      amountKes: abandoned.amountKes,
    });
    stubProviderVerification();

    const wallet = await authenticatedCaller(testUser).student.wallet();
    const database = await mongo();
    const failedRow = await database
      .collection("wallet_topups")
      .findOne({ reference: failed.reference });
    const abandonedRow = await database
      .collection("wallet_topups")
      .findOne({ reference: abandoned.reference });

    expect(failedRow?.status).toBe("failed");
    expect(abandonedRow?.status).toBe("failed");
    expect(wallet.balanceKes).toBe(0);
    expect(wallet.totalTopUps).toBe(0);
  }, 30_000);

  it("settles wallet webhooks idempotently and keeps paper webhooks on paper fulfilment", async () => {
    const topUp = await seedWalletTopUp(30);
    mockPaystack(topUp.reference, {
      status: "success",
      amountKes: topUp.amountKes,
    });
    stubProviderVerification();
    const walletEvent = {
      event: "charge.success",
      data: {
        reference: topUp.reference,
        amount: topUp.amountKes * 100,
        currency: "KES",
        status: "success",
      },
    };

    expect((await postWebhook(walletEvent)).status).toBe(200);
    expect((await postWebhook(walletEvent)).status).toBe(200);

    const database = await mongo();
    const wallet = await walletForUser(userId);
    const walletConfirmations = await database
      .collection("operational_records")
      .countDocuments({
        eventType: "wallet.top_up_confirmed",
        subjectId: String(topUp.legacyId),
      });
    expect(wallet.balanceKes).toBe(30);
    expect(walletConfirmations).toBe(1);

    const paperId = await nextId("test-wallet-webhook-papers");
    const orderId = await nextId("test-wallet-webhook-orders");
    const reference = createPaymentReference(paperId, userId);
    testPaperIds.push(paperId);
    testOrderIds.push(orderId);
    testUserIds.add(userId);
    orderReferences.push(reference);
    await database.collection("orders").insertOne({
      _id: new ObjectId(),
      legacyId: orderId,
      userId,
      paperId,
      reference,
      amountKes: 15,
      status: "pending",
      createdAt: new Date(),
    });
    mockPaystack(reference, { status: "success", amountKes: 15 });

    const paperEvent = {
      event: "charge.success",
      data: {
        reference,
        amount: 1500,
        currency: "KES",
        status: "success",
      },
    };
    expect((await postWebhook(paperEvent)).status).toBe(200);
    expect((await postWebhook(paperEvent)).status).toBe(200);

    const order = await database.collection("orders").findOne({ reference });
    const payments = await database.collection("payments").countDocuments({
      providerReference: reference,
    });
    const entitlements = await database
      .collection("entitlements")
      .countDocuments({
        orderId,
      });
    expect(order?.status).toBe("paid");
    expect(payments).toBe(1);
    expect(entitlements).toBe(1);
  }, 30_000);
});
