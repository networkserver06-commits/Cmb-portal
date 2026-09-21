import {
  GridFSBucket,
  MongoClient,
  ObjectId,
  type ClientSession,
  type Db,
} from "mongodb";
import type { User } from "../drizzle/schema";
import { ENV } from "./_core/env";

let client: MongoClient | undefined;
let dbPromise: Promise<Db> | undefined;
let indexesReady: Promise<void> | undefined;
let gridFsBucket: GridFSBucket | undefined;

export type PaperDoc = {
  _id: ObjectId;
  legacyId: number;
  course: string;
  level: string;
  cycle: string;
  unit: string;
  paperType: string;
  documentType?: string;
  title: string;
  description?: string;
  priceKes: number;
  fileId?: string;
  fileKey?: string;
  fileName?: string;
  fileMimeType?: string;
  isAvailable: boolean;
  accessMode: "purchase" | "free";
  createdAt: Date;
  updatedAt: Date;
};
export type OrderDoc = {
  _id: ObjectId;
  legacyId: number;
  userId: number;
  paperId: number;
  reference: string;
  amountKes: number;
  status: "pending" | "paid" | "failed";
  paidAt?: Date;
  createdAt: Date;
};
export type EntitlementDoc = {
  _id: ObjectId;
  legacyId: number;
  userId: number;
  paperId: number;
  orderId?: number;
  source: "purchase" | "wallet" | "manual" | "free";
  grantedAt: Date;
};
export type PaymentDoc = {
  _id: ObjectId;
  orderId: number;
  userId: number;
  providerReference: string;
  channel: string;
  amountKes: number;
  status: "success" | "failed";
  rawEvent: string;
  createdAt: Date;
};
export type AnnouncementDoc = {
  _id: ObjectId;
  title: string;
  message: string;
  severity: "info" | "warning" | "emergency";
  createdBy: number;
  isActive: boolean;
  createdAt: Date;
};
export type DownloadDoc = {
  _id: ObjectId;
  userId: number;
  paperId: number;
  entitlementId: number;
  createdAt: Date;
};
export type WalletDebitDoc = {
  _id: ObjectId;
  legacyId: number;
  userId: number;
  paperId: number;
  orderId: number;
  reference: string;
  amountKes: number;
  status: "completed";
  createdAt: Date;
};
export type WalletTopUpDoc = {
  _id: ObjectId;
  legacyId: number;
  userId: number;
  reference: string;
  phone: string;
  amountKes: number;
  status: "pending" | "paid" | "failed";
  providerReference?: string;
  paidAt?: Date;
  createdAt: Date;
  updatedAt: Date;
};

export type WorkflowDoc = {
  _id: ObjectId;
  entityType: "file" | "submission" | "paper";
  entityId: string;
  status: string;
  actorId: number;
  detail?: string;
  createdAt: Date;
  updatedAt: Date;
};
export type OperationalRecordDoc = {
  _id: ObjectId;
  eventType: string;
  actorId?: number;
  subjectType?: string;
  subjectId?: string;
  detail?: Record<string, unknown>;
  createdAt: Date;
};

export async function mongo(): Promise<Db> {
  if (!ENV.mongoUri) throw new Error("MONGODB_URI is not configured");
  if (!dbPromise) {
    client = new MongoClient(ENV.mongoUri, { maxPoolSize: 10, minPoolSize: 0 });
    dbPromise = client
      .connect()
      .then(connection => connection.db(ENV.mongoDatabase));
  }
  indexesReady ??= dbPromise.then(async database => {
    await Promise.all([
      database
        .collection("orders")
        .createIndex({ reference: 1 }, { unique: true }),
      database
        .collection("payments")
        .createIndex({ providerReference: 1 }, { unique: true }),
      database
        .collection("entitlements")
        .createIndex({ orderId: 1 }, { unique: true, sparse: true }),
      database
        .collection("entitlements")
        .createIndex({ userId: 1, paperId: 1 }, { unique: true }),
      database
        .collection("wallet_topups")
        .createIndex({ reference: 1 }, { unique: true }),
      database
        .collection("wallet_debits")
        .createIndex({ reference: 1 }, { unique: true }),
      database
        .collection("wallet_debits")
        .createIndex({ userId: 1, createdAt: -1 }),
      database
        .collection("wallet_topups")
        .createIndex({ userId: 1, createdAt: -1 }),
      database
        .collection("submissions")
        .createIndex({ userId: 1, createdAt: -1 }),
      database
        .collection("submissions")
        .createIndex({ status: 1, updatedAt: -1 }),
      database
        .collection("file_metadata")
        .createIndex({ gridFsId: 1 }, { unique: true }),
      database
        .collection("file_metadata")
        .createIndex({ ownerId: 1, createdAt: -1 }),
      database
        .collection("file_metadata")
        .createIndex({ lifecycle: 1, updatedAt: -1 }),
      database
        .collection("workflows")
        .createIndex({ entityType: 1, entityId: 1, updatedAt: -1 }),
      database
        .collection("workflows")
        .createIndex({ status: 1, updatedAt: -1 }),
      database
        .collection("operational_records")
        .createIndex({ actorId: 1, createdAt: -1 }),
      database
        .collection("operational_records")
        .createIndex({ eventType: 1, createdAt: -1 }),
      database
        .collection("grok_usage")
        .createIndex({ userId: 1, dayKey: 1 }, { unique: true }),
      database
        .collection("upload_sessions")
        .createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
      database
        .collection("upload_chunks")
        .createIndex({ uploadId: 1, index: 1 }, { unique: true }),
      database
        .collection("upload_chunks")
        .createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    ]);
  });
  try {
    await indexesReady;
    return await dbPromise;
  } catch (error) {
    await client?.close().catch(() => undefined);
    client = undefined;
    dbPromise = undefined;
    indexesReady = undefined;
    gridFsBucket = undefined;
    throw error;
  }
}

export async function withMongoTransaction<T>(
  operation: (database: Db, session: ClientSession) => Promise<T>
): Promise<T> {
  const database = await mongo();
  if (!client) throw new Error("MongoDB client is not initialized");
  const session = client.startSession();
  try {
    return await session.withTransaction(() => operation(database, session));
  } finally {
    await session.endSession();
  }
}

export async function portalFiles(): Promise<GridFSBucket> {
  if (!gridFsBucket)
    gridFsBucket = new GridFSBucket(await mongo(), {
      bucketName: "portal_files",
      chunkSizeBytes: 255 * 1024,
    });
  return gridFsBucket;
}

export async function closeMongoConnectionForTests() {
  await client?.close();
  client = undefined;
  dbPromise = undefined;
  indexesReady = undefined;
  gridFsBucket = undefined;
}

export async function recordOperationalEvent(
  input: Omit<OperationalRecordDoc, "_id" | "createdAt">
) {
  await (await mongo())
    .collection<OperationalRecordDoc>("operational_records")
    .insertOne({ _id: new ObjectId(), ...input, createdAt: new Date() });
}

export async function recordWorkflow(
  input: Omit<WorkflowDoc, "_id" | "createdAt" | "updatedAt">
) {
  const now = new Date();
  await (await mongo()).collection<WorkflowDoc>("workflows").insertOne({
    _id: new ObjectId(),
    ...input,
    createdAt: now,
    updatedAt: now,
  });
}

export async function nextId(name: string) {
  const database = await mongo();
  const result = await database
    .collection<{ value: number }>("counters")
    .findOneAndUpdate(
      { _id: name as any },
      { $inc: { value: 1 } },
      { upsert: true, returnDocument: "after" }
    );
  return result?.value ?? Date.now();
}

export function asUser(doc: {
  legacyId?: number;
  openId: string;
  name?: string | null;
  email?: string | null;
  loginMethod?: string | null;
  role?: "user" | "admin";
  createdAt?: Date;
  updatedAt?: Date;
  lastSignedIn?: Date;
}): User {
  const now = new Date();
  return {
    id: doc.legacyId ?? 0,
    openId: doc.openId,
    name: doc.name ?? null,
    email: doc.email ?? null,
    phone: null,
    loginMethod: doc.loginMethod ?? null,
    role: doc.role ?? "user",
    createdAt: doc.createdAt ?? now,
    updatedAt: doc.updatedAt ?? now,
    lastSignedIn: doc.lastSignedIn ?? now,
  };
}

export async function userById(id: number) {
  return (await (await mongo())
    .collection("users")
    .findOne({ legacyId: id })) as any;
}
export async function paperById(id: number) {
  return await (await mongo())
    .collection<PaperDoc>("papers")
    .findOne({ legacyId: id });
}
export async function orderByReference(userId: number, reference: string) {
  return await (await mongo())
    .collection<OrderDoc>("orders")
    .findOne({ userId, reference });
}
export async function walletTopUpByReference(
  userId: number,
  reference: string
) {
  return await (await mongo())
    .collection<WalletTopUpDoc>("wallet_topups")
    .findOne({ userId, reference });
}

export function calculateWalletSummary(
  topUps: Pick<WalletTopUpDoc, "status" | "amountKes">[],
  debits: Pick<WalletDebitDoc, "status" | "amountKes">[] = []
) {
  const paid = topUps.filter(topUp => topUp.status === "paid");
  const completedDebits = debits.filter(debit => debit.status === "completed");
  return {
    balanceKes:
      paid.reduce((sum, topUp) => sum + Number(topUp.amountKes), 0) -
      completedDebits.reduce((sum, debit) => sum + Number(debit.amountKes), 0),
    totalTopUps: paid.length,
  };
}

export async function walletForUser(userId: number) {
  const db = await mongo();
  const [allTopUps, allDebits] = await Promise.all([
    db
      .collection<WalletTopUpDoc>("wallet_topups")
      .find({ userId })
      .sort({ createdAt: -1 })
      .toArray(),
    db
      .collection<WalletDebitDoc>("wallet_debits")
      .find({ userId })
      .sort({ createdAt: -1 })
      .toArray(),
  ]);
  const summary = calculateWalletSummary(allTopUps, allDebits);
  return {
    ...summary,
    transactions: allTopUps.slice(0, 20),
  };
}

export async function purchasePaperWithWallet(
  userId: number,
  paperId: number,
  amountKes: number
) {
  const database = await mongo();
  if (!client) throw new Error("MongoDB connection is not ready");
  const session = client.startSession();
  try {
    let outcome:
      | { paid: true; orderId: number; entitlementId: number }
      | {
          paid: false;
          reason: "insufficient_balance";
          balanceKes: number;
          amountKes: number;
        }
      | { paid: true; alreadyOwned: true };
    await session.withTransaction(async () => {
      const existing = await database
        .collection<EntitlementDoc>("entitlements")
        .findOne({ userId, paperId }, { session });
      if (existing) {
        outcome = { paid: true, alreadyOwned: true };
        return;
      }
      const [topUps, debits] = await Promise.all([
        database
          .collection<WalletTopUpDoc>("wallet_topups")
          .find({ userId, status: "paid" }, { session })
          .toArray(),
        database
          .collection<WalletDebitDoc>("wallet_debits")
          .find({ userId, status: "completed" }, { session })
          .toArray(),
      ]);
      const balanceKes = calculateWalletSummary(topUps, debits).balanceKes;
      if (balanceKes < amountKes) {
        outcome = {
          paid: false,
          reason: "insufficient_balance",
          balanceKes,
          amountKes,
        };
        return;
      }
      const now = new Date();
      const orderId = await nextId("orders");
      const entitlementId = await nextId("entitlements");
      const debitId = await nextId("wallet_debits");
      const reference = `WALLET-${userId}-${paperId}-${new ObjectId().toHexString()}`;
      await database.collection<OrderDoc>("orders").insertOne(
        {
          _id: new ObjectId(),
          legacyId: orderId,
          userId,
          paperId,
          reference,
          amountKes,
          status: "paid",
          paidAt: now,
          createdAt: now,
        },
        { session }
      );
      await database.collection<WalletDebitDoc>("wallet_debits").insertOne(
        {
          _id: new ObjectId(),
          legacyId: debitId,
          userId,
          paperId,
          orderId,
          reference,
          amountKes,
          status: "completed",
          createdAt: now,
        },
        { session }
      );
      await database.collection<EntitlementDoc>("entitlements").insertOne(
        {
          _id: new ObjectId(),
          legacyId: entitlementId,
          userId,
          paperId,
          orderId,
          source: "wallet",
          grantedAt: now,
        },
        { session }
      );
      outcome = { paid: true, orderId, entitlementId };
    });
    return outcome!;
  } finally {
    await session.endSession();
  }
}

export function walletTopUpPaymentMatches(
  provider: {
    reference?: string;
    amount?: number;
    currency?: string;
  },
  reference: string,
  amountKes: number
) {
  return (
    provider.reference === reference &&
    provider.currency === "KES" &&
    provider.amount === Math.round(amountKes * 100)
  );
}

export async function fulfillWalletTopUp(
  reference: string,
  provider: {
    reference?: string;
    amount?: number;
    currency?: string;
    channel?: string;
  }
) {
  const db = await mongo();
  const topUps = db.collection<WalletTopUpDoc>("wallet_topups");
  const topUp = await topUps.findOne({ reference });
  if (!topUp) throw new Error("Wallet top-up not found");
  if (!walletTopUpPaymentMatches(provider, reference, topUp.amountKes))
    throw new Error("Payment does not match wallet top-up");
  if (topUp.status === "paid")
    return {
      fulfilled: false as const,
      status: "paid" as const,
      topUpId: topUp.legacyId,
    };

  const result = await topUps.updateOne(
    { _id: topUp._id, status: { $ne: "paid" } },
    {
      $set: {
        status: "paid",
        providerReference: provider.reference,
        paidAt: new Date(),
        updatedAt: new Date(),
      },
    }
  );
  if (result.modifiedCount === 0)
    return {
      fulfilled: false as const,
      status: "paid" as const,
      topUpId: topUp.legacyId,
    };

  await recordOperationalEvent({
    eventType: "wallet.top_up_confirmed",
    actorId: topUp.userId,
    subjectType: "wallet_top_up",
    subjectId: String(topUp.legacyId),
    detail: {
      reference,
      providerReference: provider.reference,
      amountKes: topUp.amountKes,
      channel: provider.channel ?? "leetec-stkpush",
    },
  });
  return {
    fulfilled: true as const,
    status: "paid" as const,
    topUpId: topUp.legacyId,
  };
}

export async function walletSummaryForAdmin() {
  const db = await mongo();
  const [
    totalTopUps,
    paidTopUps,
    pendingTopUps,
    failedTopUps,
    paidRows,
    recentTopUps,
  ] = await Promise.all([
    db.collection<WalletTopUpDoc>("wallet_topups").countDocuments(),
    db
      .collection<WalletTopUpDoc>("wallet_topups")
      .countDocuments({ status: "paid" }),
    db
      .collection<WalletTopUpDoc>("wallet_topups")
      .countDocuments({ status: "pending" }),
    db
      .collection<WalletTopUpDoc>("wallet_topups")
      .countDocuments({ status: "failed" }),
    db
      .collection<WalletTopUpDoc>("wallet_topups")
      .find({ status: "paid" }, { projection: { userId: 1, amountKes: 1 } })
      .toArray(),
    db
      .collection<WalletTopUpDoc>("wallet_topups")
      .find(
        {},
        {
          projection: {
            _id: 0,
            legacyId: 1,
            userId: 1,
            phone: 1,
            amountKes: 1,
            status: 1,
            reference: 1,
            createdAt: 1,
          },
        }
      )
      .sort({ createdAt: -1 })
      .limit(8)
      .toArray(),
  ]);
  return {
    totalTopUps,
    paidTopUps,
    pendingTopUps,
    failedTopUps,
    fundedKes: paidRows.reduce((sum, row) => sum + Number(row.amountKes), 0),
    fundedStudents: new Set(paidRows.map(row => row.userId)).size,
    recentTopUps,
  };
}

export async function entitlementFor(userId: number, paperId: number) {
  return await (await mongo())
    .collection<EntitlementDoc>("entitlements")
    .findOne({ userId, paperId });
}
export function shouldCreateEntitlement(existing: EntitlementDoc | null) {
  return !existing;
}

export async function fulfillPayment(
  reference: string,
  provider: {
    reference?: string;
    amount?: number;
    currency?: string;
    channel?: string;
  },
  rawEvent: string
) {
  return withMongoTransaction(async (database, session) => {
    const orders = database.collection<OrderDoc>("orders");
    const order = await orders.findOne({ reference }, { session });
    const providerReference = provider.reference;
    if (!order) throw new Error("Order not found");
    if (
      provider.reference !== reference ||
      provider.currency !== "KES" ||
      provider.amount !== Math.round(order.amountKes * 100)
    )
      throw new Error("Payment does not match order");
    const existing = await database
      .collection<EntitlementDoc>("entitlements")
      .findOne({ orderId: order.legacyId }, { session });
    if (!shouldCreateEntitlement(existing))
      return { fulfilled: false, entitlementId: existing.legacyId };
    const entitlementId = await nextId("entitlements");
    await orders.updateOne(
      { _id: order._id },
      { $set: { status: "paid", paidAt: new Date() } },
      { session }
    );
    await database.collection<PaymentDoc>("payments").updateOne(
    { providerReference },
    {
      $setOnInsert: {
        _id: new ObjectId(),
        orderId: order.legacyId,
        userId: order.userId,
        providerReference,
        channel: provider.channel ?? "leetec-stkpush",
        amountKes: order.amountKes,
        status: "success",
        rawEvent,
        createdAt: new Date(),
      },
    },
    { upsert: true, session }
    );
    try {
      const result = await database
      .collection<EntitlementDoc>("entitlements")
      .updateOne(
        { orderId: order.legacyId },
        {
          $setOnInsert: {
            _id: new ObjectId(),
            legacyId: entitlementId,
            userId: order.userId,
            paperId: order.paperId,
            orderId: order.legacyId,
            source: "purchase",
            grantedAt: new Date(),
          },
        },
        { upsert: true, session }
      );
      if (!result.upsertedCount) {
        const winner = await database
        .collection<EntitlementDoc>("entitlements")
        .findOne({ orderId: order.legacyId }, { session });
        return {
          fulfilled: false,
          entitlementId: winner?.legacyId ?? entitlementId,
        };
      }
      return { fulfilled: true, entitlementId };
    } catch (error: any) {
      if (error?.code === 11000) {
        const winner = await database
        .collection<EntitlementDoc>("entitlements")
        .findOne({ orderId: order.legacyId }, { session });
        return {
          fulfilled: false,
          entitlementId: winner?.legacyId ?? entitlementId,
        };
      }
      throw error;
    }
  });
}
