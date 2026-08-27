import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => {
  const now = new Date("2026-08-27T12:00:00.000Z");
  const old = new Date("2026-08-26T10:00:00.000Z");
  const recent = new Date("2026-08-27T10:00:00.000Z");
  const records: Record<string, any[]> = {
    submissions: [
      { id: "rejected-old", status: "rejected", storagePurged: true, reviewedAt: old },
      { id: "rejected-recent", status: "rejected", storagePurged: true, reviewedAt: recent },
      { id: "rejected-important", status: "rejected", storagePurged: false, reviewedAt: old },
      { id: "pending-old", status: "pending", updatedAt: old },
    ],
    orders: [
      { id: "failed-old", status: "failed", updatedAt: old },
      { id: "pending-old", status: "pending", updatedAt: old },
      { id: "paid-old", status: "paid", updatedAt: old },
      { id: "failed-recent", status: "failed", updatedAt: recent },
    ],
    wallet_topups: [
      { id: "topup-failed-old", status: "failed", updatedAt: old },
      { id: "topup-pending-old", status: "pending", updatedAt: old },
      { id: "topup-paid-old", status: "paid", updatedAt: old },
    ],
    payments: [
      { id: "payment-failed-old", status: "failed", createdAt: old },
      { id: "payment-success-old", status: "success", createdAt: old },
    ],
    file_metadata: [
      { gridFsId: "orphan-old", references: [], lifecycle: "archived", updatedAt: old },
      { gridFsId: "orphan-recent", references: [], lifecycle: "archived", updatedAt: recent },
      { gridFsId: "linked-old", references: [{ entityType: "paper", entityId: 7 }], lifecycle: "linked", updatedAt: old },
    ],
  };

  const matches = (record: any, filter: any) => {
    if (filter.status && record.status !== filter.status) return false;
    if (filter.storagePurged !== undefined && record.storagePurged !== filter.storagePurged) return false;
    if (filter.reviewedAt?.$lte && !(record.reviewedAt <= filter.reviewedAt.$lte)) return false;
    if (filter.$or && !filter.$or.some((condition: any) =>
      Object.entries(condition).some(([key, value]: [string, any]) => record[key] && record[key] <= value.$lte)
    )) return false;
    if (filter.deletedAt?.$exists === false && record.deletedAt !== undefined) return false;
    if (filter.references?.$size !== undefined && record.references?.length !== filter.references.$size) return false;
    if (filter.lifecycle?.$in && !filter.lifecycle.$in.includes(record.lifecycle)) return false;
    if (filter.updatedAt?.$lte && !(record.updatedAt <= filter.updatedAt.$lte)) return false;
    return true;
  };

  const collection = (name: string) => ({
    countDocuments: vi.fn(async (filter: any) => records[name].filter(record => matches(record, filter)).length),
    deleteMany: vi.fn(async (filter: any) => {
      const before = records[name].length;
      records[name] = records[name].filter(record => !matches(record, filter));
      return { deletedCount: before - records[name].length };
    }),
    find: vi.fn((filter: any) => ({
      limit: vi.fn(() => ({
        toArray: vi.fn(async () => records[name].filter(record => matches(record, filter))),
      })),
    })),
  });

  const database = { collection: vi.fn((name: string) => collection(name)) };
  const deletePortalFile = vi.fn(async ({ fileId }: { fileId: string }) => {
    records.file_metadata = records.file_metadata.filter(file => file.gridFsId !== fileId);
  });
  const recordOperationalEvent = vi.fn(async () => undefined);
  const mongo = vi.fn(async () => database);
  return { now, records, deletePortalFile, recordOperationalEvent, mongo };
});

vi.mock("./fileStore", () => ({ deletePortalFile: harness.deletePortalFile }));
vi.mock("./mongoStore", () => ({
  mongo: harness.mongo,
  recordOperationalEvent: harness.recordOperationalEvent,
}));

import {
  disposableGridFsFilter,
  RETENTION_WINDOW_MS,
  runRetentionCleanup,
} from "./retentionCleanup";

describe("24-hour retention cleanup", () => {
  it("removes disposable stale records and preserves active or important records", async () => {
    const result = await runRetentionCleanup({ now: harness.now, actorId: -1 });

    expect(result.removed).toEqual({
      rejectedSubmissions: 1,
      failedOrders: 1,
      abandonedOrders: 1,
      failedWalletTopUps: 1,
      abandonedWalletTopUps: 1,
      failedPayments: 1,
      gridFsFiles: 1,
    });
    expect(result.skippedGridFsFiles).toBe(0);
    expect(harness.records.submissions.map(row => row.id)).toEqual([
      "rejected-recent",
      "rejected-important",
      "pending-old",
    ]);
    expect(harness.records.orders.map(row => row.id)).toEqual([
      "paid-old",
      "failed-recent",
    ]);
    expect(harness.records.wallet_topups.map(row => row.id)).toEqual(["topup-paid-old"]);
    expect(harness.records.payments.map(row => row.id)).toEqual(["payment-success-old"]);
    expect(harness.records.file_metadata.map(row => row.gridFsId)).toEqual([
      "orphan-recent",
      "linked-old",
    ]);
    expect(harness.recordOperationalEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "retention.cleanup", actorId: -1 })
    );
  });

  it("is idempotent when the same cleanup window runs again", async () => {
    const second = await runRetentionCleanup({ now: harness.now, actorId: -1 });
    expect(second.removed).toEqual({
      rejectedSubmissions: 0,
      failedOrders: 0,
      abandonedOrders: 0,
      failedWalletTopUps: 0,
      abandonedWalletTopUps: 0,
      failedPayments: 0,
      gridFsFiles: 0,
    });
  });

  it("keeps the cutoff and GridFS filter explicit", () => {
    const cutoff = new Date(harness.now.getTime() - RETENTION_WINDOW_MS);
    expect(disposableGridFsFilter(cutoff)).toMatchObject({
      deletedAt: { $exists: false },
      references: { $size: 0 },
      lifecycle: { $in: ["pending", "archived"] },
      updatedAt: { $lte: cutoff },
    });
  });

  it("mounts a cron-authenticated POST route without weakening the public API", () => {
    const source = readFileSync(new URL("./_core/index.ts", import.meta.url), "utf8");
    expect(source).toContain('app.post("/api/scheduled/retentionCleanup"');
    expect(source).toContain("sdk.authenticateRequest(req)");
    expect(source).toContain("!user.isCron || !user.taskUid");
    expect(source).toContain("runRetentionCleanup({ actorId: user.id })");
  });
});
