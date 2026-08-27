import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildStorageHealthChecks,
  summarizeStorageUsage,
  type StorageAuditItem,
} from "./storageManagement";
import { formatBytes } from "../client/src/lib/formatBytes";

const item = (overrides: Partial<StorageAuditItem>): StorageAuditItem => ({
  key: "file-id",
  origin: "paper",
  fileName: "resource.pdf",
  mimeType: "application/pdf",
  createdAt: new Date("2026-08-01T00:00:00.000Z"),
  byteLength: 0,
  ageDays: 1,
  referenceCount: 0,
  references: [],
  status: "recent",
  cleanupEligible: false,
  ...overrides,
});

describe("storage usage summaries and checks", () => {
  it("aggregates tracked, protected, and reclaimable bytes from metadata", () => {
    const usage = summarizeStorageUsage([
      item({ key: "protected", byteLength: 2 * 1024 * 1024, status: "protected", referenceCount: 1 }),
      item({ key: "candidate", byteLength: 512 * 1024, status: "orphaned", cleanupEligible: true }),
      item({ key: "temporary", byteLength: 256 * 1024, status: "temporary" }),
    ]);
    expect(usage).toMatchObject({
      trackedBytes: 2_883_584,
      protectedBytes: 2_097_152,
      cleanupEligibleBytes: 524_288,
      temporaryBytes: 262_144,
      largestFileBytes: 2_097_152,
      largestFileName: "resource.pdf",
    });
  });

  it("suggests cleanup, temporary-review, large-file, and tracking checks without inventing a quota", () => {
    const checks = buildStorageHealthChecks(
      { known: 3, protected: 1, recent: 0, temporary: 1, orphaned: 1 },
      {
        trackedBytes: 4 * 1024 * 1024,
        protectedBytes: 3 * 1024 * 1024,
        cleanupEligibleBytes: 512 * 1024,
        recentBytes: 0,
        temporaryBytes: 512 * 1024,
        largestFileBytes: 3.75 * 1024 * 1024,
        largestFileName: "large-paper.pdf",
      }
    );
    expect(checks.map(check => check.id)).toEqual([
      "cleanup",
      "temporary",
      "large-file",
      "tracking",
    ]);
    expect(checks.find(check => check.id === "large-file")?.detail).toContain("4 MiB");
    expect(checks.find(check => check.id === "tracking")?.detail).toContain("not a provider-wide quota estimate");
  });

  it("formats storage values for compact admin cards", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(1536)).toBe("1.5 KiB");
    expect(formatBytes(2 * 1024 * 1024)).toBe("2.00 MiB");
  });

  it("exposes usage and storage-check guidance in both admin surfaces", () => {
    const panelSource = readFileSync(
      new URL("../client/src/pages/StorageManagement.tsx", import.meta.url),
      "utf8"
    );
    const adminSource = readFileSync(
      new URL("../client/src/pages/Admin.tsx", import.meta.url),
      "utf8"
    );
    expect(panelSource).toContain("Tracked storage used");
    expect(panelSource).toContain("Suggested next checks");
    expect(panelSource).toContain("Reclaimable review");
    expect(panelSource).toContain("Storage composition");
    expect(adminSource).toContain("storageAudit.data?.usage.trackedBytes");
    expect(adminSource).toContain("formatBytes");
    expect(adminSource).toContain("Run storage checks");
  });
});
