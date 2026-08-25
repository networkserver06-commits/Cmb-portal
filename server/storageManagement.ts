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
  ageDays: number;
  referenceCount: number;
  references: string[];
  status: StorageAuditStatus;
  cleanupEligible: boolean;
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
    ageDays,
    referenceCount: references.length,
    references,
    status: classifyStorageRecord(references.length, ageDays, origin),
    cleanupEligible:
      references.length === 0 && ageDays >= STORAGE_RETENTION_DAYS,
  };
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
  return {
    generatedAt: now,
    retentionDays: STORAGE_RETENTION_DAYS,
    deletionMode: "delete-gridfs-and-metadata",
    coverage: "gridfs-file-metadata-and-live-references",
    items,
    totals,
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
