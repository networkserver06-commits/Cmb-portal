import { ObjectId } from "mongodb";
import {
  deletePortalFile,
  listPortalFiles,
  type FilePurpose,
  type PortalFileMetadata,
} from "./fileStore";
import { mongo, recordOperationalEvent } from "./mongoStore";

export const STORAGE_RETENTION_DAYS = 7;
export const STORAGE_CLEANUP_CONFIRMATION = "DELETE_UNUSED_FILES";

export type StorageOrigin = FilePurpose | "manual";
export type StorageAuditStatus =
  | "protected"
  | "recent"
  | "temporary"
  | "orphaned";
export type StorageAuditItem = {
  key: string;
  origin: StorageOrigin;
  fileName?: string;
  mimeType?: string;
  createdAt: Date | null;
  byteLength: number;
  ageDays: number;
  referenceCount: number;
  references: string[];
  status: StorageAuditStatus;
  cleanupEligible: boolean;
};

export type StorageUsage = {
  trackedBytes: number;
  protectedBytes: number;
  cleanupEligibleBytes: number;
  recentBytes: number;
  temporaryBytes: number;
  largestFileBytes: number;
  largestFileName: string | null;
};

export type StorageHealthCheck = {
  id: "cleanup" | "temporary" | "large-file" | "tracking";
  tone: "good" | "attention" | "info";
  title: string;
  detail: string;
};

export type StorageAudit = {
  generatedAt: Date;
  retentionDays: number;
  deletionMode: "delete-gridfs-and-metadata";
  coverage: "gridfs-file-metadata-and-live-references";
  items: StorageAuditItem[];
  totals: {
    known: number;
    protected: number;
    recent: number;
    temporary: number;
    orphaned: number;
  };
  usage: StorageUsage;
  healthChecks: StorageHealthCheck[];
};

function ageInDays(createdAt: Date | null, now = Date.now()) {
  if (!createdAt) return 0;
  return Math.max(0, Math.floor((now - createdAt.getTime()) / 86_400_000));
}

export function classifyStorageRecord(
  referenceCount: number,
  ageDays: number,
  origin: StorageOrigin = "manual"
): StorageAuditStatus {
  if (referenceCount > 0) return "protected";
  if (origin === "submission" && ageDays < STORAGE_RETENTION_DAYS)
    return "temporary";
  return ageDays >= STORAGE_RETENTION_DAYS ? "orphaned" : "recent";
}

function itemFromMetadata(
  metadata: PortalFileMetadata,
  now: number
): StorageAuditItem {
  const references = metadata.references.map(
    reference => `${reference.entityType}:${reference.entityId}`
  );
  const ageDays = ageInDays(metadata.createdAt, now);
  const origin = metadata.purpose as StorageOrigin;
  return {
    key: metadata.gridFsId,
    origin,
    fileName: metadata.fileName,
    mimeType: metadata.mimeType,
    createdAt: metadata.createdAt,
    byteLength: Math.max(0, Number(metadata.byteLength) || 0),
    ageDays,
    referenceCount: references.length,
    references,
    status: classifyStorageRecord(references.length, ageDays, origin),
    cleanupEligible:
      references.length === 0 && ageDays >= STORAGE_RETENTION_DAYS,
  };
}

export function summarizeStorageUsage(items: StorageAuditItem[]): StorageUsage {
  return items.reduce<StorageUsage>(
    (usage, item) => {
      const bytes = Math.max(0, Number(item.byteLength) || 0);
      usage.trackedBytes += bytes;
      if (item.status === "protected") usage.protectedBytes += bytes;
      if (item.cleanupEligible) usage.cleanupEligibleBytes += bytes;
      if (item.status === "recent") usage.recentBytes += bytes;
      if (item.status === "temporary") usage.temporaryBytes += bytes;
      if (bytes > usage.largestFileBytes) {
        usage.largestFileBytes = bytes;
        usage.largestFileName = item.fileName || item.key;
      }
      return usage;
    },
    {
      trackedBytes: 0,
      protectedBytes: 0,
      cleanupEligibleBytes: 0,
      recentBytes: 0,
      temporaryBytes: 0,
      largestFileBytes: 0,
      largestFileName: null,
    }
  );
}

export function buildStorageHealthChecks(
  totals: StorageAudit["totals"],
  usage: StorageUsage
): StorageHealthCheck[] {
  const checks: StorageHealthCheck[] = [];
  if (totals.orphaned > 0) {
    checks.push({
      id: "cleanup",
      tone: "attention",
      title: "Review cleanup candidates",
      detail: `${totals.orphaned} unreferenced file${totals.orphaned === 1 ? " is" : "s are"} ready for a protected cleanup review.`,
    });
  } else {
    checks.push({
      id: "cleanup",
      tone: "good",
      title: "No safe cleanup candidates",
      detail: "Referenced and recent files are protected from manual cleanup.",
    });
  }
  if (totals.temporary > 0) {
    checks.push({
      id: "temporary",
      tone: "info",
      title: "Submission files remain protected",
      detail: `${totals.temporary} recent submission file${totals.temporary === 1 ? " is" : "s are"} retained while the review workflow completes.`,
    });
  }
  if (usage.largestFileBytes >= 225 * 1024 * 1024) {
    checks.push({
      id: "large-file",
      tone: "attention",
      title: "Largest file is near the upload ceiling",
      detail: `${usage.largestFileName ?? "A tracked file"} is close to the 250 MiB per-file upload limit; keep future uploads optimized.`,
    });
  }
  checks.push({
    id: "tracking",
    tone: "info",
    title: "Usage is based on tracked GridFS metadata",
    detail: "The summary reflects active file metadata and is not a provider-wide quota estimate.",
  });
  return checks;
}

export async function auditStorage(): Promise<StorageAudit> {
  const now = new Date();
  const items = (await listPortalFiles()).map(metadata =>
    itemFromMetadata(metadata, now.getTime())
  );
  const totals = {
    known: items.length,
    protected: items.filter(item => item.status === "protected").length,
    recent: items.filter(item => item.status === "recent").length,
    temporary: items.filter(item => item.status === "temporary").length,
    orphaned: items.filter(item => item.status === "orphaned").length,
  };
  const usage = summarizeStorageUsage(items);
  return {
    generatedAt: now,
    retentionDays: STORAGE_RETENTION_DAYS,
    deletionMode: "delete-gridfs-and-metadata",
    coverage: "gridfs-file-metadata-and-live-references",
    items,
    totals,
    usage,
    healthChecks: buildStorageHealthChecks(totals, usage),
  };
}

export async function cleanupStorage(input: {
  keys: string[];
  confirmation: string;
  actorId: number;
}) {
  if (input.confirmation !== STORAGE_CLEANUP_CONFIRMATION)
    throw new Error(
      `Type ${STORAGE_CLEANUP_CONFIRMATION} to confirm permanent cleanup`
    );
  const uniqueKeys = Array.from(new Set(input.keys)).slice(0, 100);
  if (!uniqueKeys.length)
    throw new Error("Select at least one cleanup candidate");
  const audit = await auditStorage();
  const candidates = new Set(
    audit.items
      .filter(
        item =>
          item.cleanupEligible &&
          item.status === "orphaned" &&
          item.referenceCount === 0
      )
      .map(item => item.key)
  );
  if (uniqueKeys.some(key => !candidates.has(key)))
    throw new Error(
      "Cleanup stopped: one or more selected files are referenced, recent, or unknown"
    );
  for (const fileId of uniqueKeys)
    await deletePortalFile({ fileId, actorId: input.actorId });
  await (await mongo()).collection("storage_cleanup_audit").insertOne({
    _id: new ObjectId(),
    actorId: input.actorId,
    fileIds: uniqueKeys,
    removedCount: uniqueKeys.length,
    mode: "delete-gridfs-and-metadata",
    createdAt: new Date(),
  });
  await recordOperationalEvent({
    eventType: "storage.cleanup",
    actorId: input.actorId,
    subjectType: "storage",
    detail: { fileIds: uniqueKeys, removedCount: uniqueKeys.length },
  });
  return {
    success: true as const,
    removedCount: uniqueKeys.length,
    keys: uniqueKeys,
    mode: "delete-gridfs-and-metadata" as const,
  };
}
