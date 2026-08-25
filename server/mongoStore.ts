import { GridFSBucket, MongoClient, ObjectId, type Db } from "mongodb";
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
  source: "purchase" | "manual" | "free";
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
  topUps: Pick<WalletTopUpDoc, "status" | "amountKes">[]
) {
  const paid = topUps.filter(topUp => topUp.status === "paid");
  return {
    balanceKes: paid.reduce((sum, topUp) => sum + Number(topUp.amountKes), 0),
    totalTopUps: paid.length,
  };
}

export async function walletForUser(userId: number) {
  const db = await mongo();
  const allTopUps = await db
    .collection<WalletTopUpDoc>("wallet_topups")
    .find({ userId })
    .sort({ createdAt: -1 })
    .toArray();
  const summary = calculateWalletSummary(allTopUps);
  return {
    ...summary,
    transactions: allTopUps.slice(0, 20),
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
  const database = await mongo();
  const orders = database.collection<OrderDoc>("orders");
  const order = await orders.findOne({ reference });
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
    .findOne({ orderId: order.legacyId });
  if (!shouldCreateEntitlement(existing))
    return { fulfilled: false, entitlementId: existing.legacyId };
  const entitlementId = await nextId("entitlements");
  await orders.updateOne(
    { _id: order._id },
    { $set: { status: "paid", paidAt: new Date() } }
  );
  await database.collection<PaymentDoc>("payments").updateOne(
    { providerReference },
    {
      $setOnInsert: {
        _id: new ObjectId(),
        orderId: order.legacyId,
        userId: order.userId,
        providerReference,
        channel: provider.channel ?? "paystack-hosted",
        amountKes: order.amountKes,
        status: "success",
        rawEvent,
        createdAt: new Date(),
      },
    },
    { upsert: true }
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
        { upsert: true }
      );
    if (!result.upsertedCount) {
      const winner = await database
        .collection<EntitlementDoc>("entitlements")
        .findOne({ orderId: order.legacyId });
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
        .findOne({ orderId: order.legacyId });
      return {
        fulfilled: false,
        entitlementId: winner?.legacyId ?? entitlementId,
      };
    }
    throw error;
  }
}
