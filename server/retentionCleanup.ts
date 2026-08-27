import { deletePortalFile, type PortalFileMetadata } from "./fileStore";
import { mongo, recordOperationalEvent } from "./mongoStore";

export const RETENTION_WINDOW_MS = 24 * 60 * 60 * 1000;
export const RETENTION_CRON_PATH = "/api/scheduled/retentionCleanup";
export const RETENTION_CRON_EXPRESSION = "0 0 * * * *";
const SCHEDULED_ACTOR_ID = -1;

type CleanupOptions = {
  now?: Date;
  dryRun?: boolean;
  actorId?: number;
};

export type RetentionCleanupResult = {
  dryRun: boolean;
  cutoff: Date;
  removed: {
    rejectedSubmissions: number;
    failedOrders: number;
    abandonedOrders: number;
    failedWalletTopUps: number;
    abandonedWalletTopUps: number;
    failedPayments: number;
    gridFsFiles: number;
  };
  skippedGridFsFiles: number;
};

function emptyResult(options: Required<Pick<CleanupOptions, "dryRun" | "actorId">>, cutoff: Date) {
  return {
    dryRun: options.dryRun,
    cutoff,
    removed: {
      rejectedSubmissions: 0,
      failedOrders: 0,
      abandonedOrders: 0,
      failedWalletTopUps: 0,
      abandonedWalletTopUps: 0,
      failedPayments: 0,
      gridFsFiles: 0,
    },
    skippedGridFsFiles: 0,
  } satisfies RetentionCleanupResult;
}

function oldEnoughFilter(cutoff: Date) {
  return { $lte: cutoff };
}

function paymentAgeFilter(cutoff: Date) {
  return { $or: [{ updatedAt: oldEnoughFilter(cutoff) }, { createdAt: oldEnoughFilter(cutoff) }] };
}

export function retentionCutoff(now = new Date()) {
  return new Date(now.getTime() - RETENTION_WINDOW_MS);
}

export function disposableGridFsFilter(cutoff: Date) {
  return {
    deletedAt: { $exists: false },
    references: { $size: 0 },
    lifecycle: { $in: ["pending", "archived"] as const },
    updatedAt: oldEnoughFilter(cutoff),
  };
}

export async function runRetentionCleanup(input: CleanupOptions = {}) {
  const now = input.now ?? new Date();
  const dryRun = input.dryRun ?? false;
  const actorId = input.actorId ?? SCHEDULED_ACTOR_ID;
  const cutoff = retentionCutoff(now);
  const database = await mongo();
  const result = emptyResult({ dryRun, actorId }, cutoff);
  const submissions = database.collection("submissions");
  const orders = database.collection("orders");
  const walletTopUps = database.collection("wallet_topups");
  const payments = database.collection("payments");

  if (dryRun) {
    result.removed.rejectedSubmissions = await submissions.countDocuments({
      status: "rejected",
      storagePurged: true,
      reviewedAt: oldEnoughFilter(cutoff),
    });
  } else {
    const deleted = await submissions.deleteMany({
      status: "rejected",
      storagePurged: true,
      reviewedAt: oldEnoughFilter(cutoff),
    });
    result.removed.rejectedSubmissions = deleted.deletedCount;
  }

  const failedOrderFilter = { status: "failed", ...paymentAgeFilter(cutoff) };
  const abandonedOrderFilter = { status: "pending", ...paymentAgeFilter(cutoff) };
  const failedWalletFilter = { status: "failed", ...paymentAgeFilter(cutoff) };
  const abandonedWalletFilter = { status: "pending", ...paymentAgeFilter(cutoff) };
  const failedPaymentFilter = { status: "failed", ...paymentAgeFilter(cutoff) };

  if (dryRun) {
    result.removed.failedOrders = await orders.countDocuments(failedOrderFilter);
    result.removed.abandonedOrders = await orders.countDocuments(abandonedOrderFilter);
    result.removed.failedWalletTopUps = await walletTopUps.countDocuments(failedWalletFilter);
    result.removed.abandonedWalletTopUps = await walletTopUps.countDocuments(abandonedWalletFilter);
    result.removed.failedPayments = await payments.countDocuments(failedPaymentFilter);
  } else {
    result.removed.failedOrders = (
      await orders.deleteMany(failedOrderFilter)
    ).deletedCount;
    result.removed.abandonedOrders = (
      await orders.deleteMany(abandonedOrderFilter)
    ).deletedCount;
    result.removed.failedWalletTopUps = (
      await walletTopUps.deleteMany(failedWalletFilter)
    ).deletedCount;
    result.removed.abandonedWalletTopUps = (
      await walletTopUps.deleteMany(abandonedWalletFilter)
    ).deletedCount;
    result.removed.failedPayments = (
      await payments.deleteMany(failedPaymentFilter)
    ).deletedCount;
  }

  const files = await database
    .collection<PortalFileMetadata>("file_metadata")
    .find(disposableGridFsFilter(cutoff))
    .limit(500)
    .toArray();

  if (dryRun) {
    result.removed.gridFsFiles = files.length;
  } else {
    for (const file of files) {
      try {
        await deletePortalFile({ fileId: file.gridFsId, actorId });
        result.removed.gridFsFiles += 1;
      } catch {
        result.skippedGridFsFiles += 1;
      }
    }
  }

  if (!dryRun) {
    await recordOperationalEvent({
      eventType: "retention.cleanup",
      actorId,
      subjectType: "retention",
      detail: result,
    });
  }

  return result;
}
