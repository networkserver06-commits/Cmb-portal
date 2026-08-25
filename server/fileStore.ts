import { createHash } from "node:crypto";
import type { Response } from "express";
import { ObjectId } from "mongodb";
import {
  mongo,
  portalFiles,
  recordOperationalEvent,
  recordWorkflow,
} from "./mongoStore";

export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
export const PORTAL_FILE_BUCKET = "portal_files";

const fileTypes = {
  pdf: ["application/pdf"],
  doc: ["application/msword"],
  docx: [
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ],
  ppt: ["application/vnd.ms-powerpoint"],
  pptx: [
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ],
  txt: ["text/plain"],
  csv: ["text/csv", "application/csv"],
} as const;

export type FilePurpose = "submission" | "paper" | "migration";
export type FileLifecycle =
  | "pending"
  | "linked"
  | "rejected"
  | "archived"
  | "deleted";
export type PortalFileMetadata = {
  _id: ObjectId;
  gridFsId: string;
  ownerId: number;
  purpose: FilePurpose;
  lifecycle: FileLifecycle;
  fileName: string;
  mimeType: string;
  byteLength: number;
  sha256: string;
  references: Array<{ entityType: "paper" | "submission"; entityId: number }>;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
};

export type UploadValidation = {
  fileName: string;
  mimeType: string;
  extension: keyof typeof fileTypes;
};

function extensionOf(fileName: string) {
  const match = fileName
    .trim()
    .toLowerCase()
    .match(/\.([a-z0-9]+)$/);
  return match?.[1] ?? "";
}

function normalizeFileName(value: string) {
  const stripped = value
    .replace(/[\\/\u0000-\u001f<>:"|?*]+/g, "-")
    .replace(/\s+/g, " ")
    .trim();
  if (!stripped || stripped.length > 180)
    throw new Error("Use a file name between 1 and 180 characters.");
  return stripped;
}

export function validateUpload(input: {
  fileName: string;
  mimeType: string;
  byteLength: number;
  bytes?: Buffer;
}): UploadValidation {
  const fileName = normalizeFileName(input.fileName);
  const extension = extensionOf(fileName) as keyof typeof fileTypes;
  if (!(extension in fileTypes))
    throw new Error(
      "Only PDF, DOC, DOCX, PPT, PPTX, TXT, and CSV files are supported."
    );
  if (!Number.isInteger(input.byteLength) || input.byteLength < 1)
    throw new Error("Select a non-empty document to upload.");
  if (input.byteLength > MAX_UPLOAD_BYTES)
    throw new Error(
      "Files must be 4 MiB or smaller for reliable Vercel uploads."
    );
  const supplied =
    input.mimeType.trim().toLowerCase() || "application/octet-stream";
  const allowed = fileTypes[extension] as readonly string[];
  if (supplied !== "application/octet-stream" && !allowed.includes(supplied))
    throw new Error("The selected file type does not match its extension.");
  if (
    extension === "pdf" &&
    input.bytes &&
    input.bytes.subarray(0, 5).toString("ascii") !== "%PDF-"
  )
    throw new Error("The PDF file signature is not valid.");
  return {
    fileName,
    mimeType: supplied === "application/octet-stream" ? allowed[0] : supplied,
    extension,
  };
}

export function isPortalFileId(value: string) {
  return ObjectId.isValid(value);
}

export async function uploadPortalFile(input: {
  ownerId: number;
  purpose: FilePurpose;
  fileName: string;
  mimeType: string;
  bytes: Buffer;
}) {
  const validated = validateUpload({
    fileName: input.fileName,
    mimeType: input.mimeType,
    byteLength: input.bytes.byteLength,
    bytes: input.bytes,
  });
  const bucket = await portalFiles();
  const uploadedAt = new Date();
  const sha256 = createHash("sha256").update(input.bytes).digest("hex");
  const upload = bucket.openUploadStream(validated.fileName, {
    metadata: {
      ownerId: input.ownerId,
      purpose: input.purpose,
      sha256,
      uploadedAt,
      originalName: validated.fileName,
      mimeType: validated.mimeType,
    },
  });
  await new Promise<void>((resolve, reject) => {
    upload.once("error", reject);
    upload.once("finish", resolve);
    upload.end(input.bytes);
  });
  const now = new Date();
  const metadata: PortalFileMetadata = {
    _id: new ObjectId(),
    gridFsId: upload.id.toString(),
    ownerId: input.ownerId,
    purpose: input.purpose,
    lifecycle: "pending",
    fileName: validated.fileName,
    mimeType: validated.mimeType,
    byteLength: input.bytes.byteLength,
    sha256,
    references: [],
    createdAt: now,
    updatedAt: now,
  };
  try {
    await (await mongo())
      .collection<PortalFileMetadata>("file_metadata")
      .insertOne(metadata);
    await recordWorkflow({
      entityType: "file",
      entityId: metadata.gridFsId,
      status: "uploaded",
      actorId: input.ownerId,
      detail: input.purpose,
    });
    await recordOperationalEvent({
      eventType: "file.uploaded",
      actorId: input.ownerId,
      subjectType: "file",
      subjectId: metadata.gridFsId,
      detail: {
        purpose: input.purpose,
        byteLength: metadata.byteLength,
        mimeType: metadata.mimeType,
      },
    });
    return metadata;
  } catch (error) {
    await bucket.delete(upload.id).catch(() => undefined);
    throw error;
  }
}

export async function portalFileById(fileId: string) {
  if (!isPortalFileId(fileId)) return null;
  return await (await mongo())
    .collection<PortalFileMetadata>("file_metadata")
    .findOne({ gridFsId: fileId, deletedAt: { $exists: false } });
}

export async function claimPortalFile(input: {
  fileId: string;
  actorId: number;
  purpose: FilePurpose;
  administrator?: boolean;
}) {
  const metadata = await portalFileById(input.fileId);
  if (!metadata) throw new Error("The uploaded file could not be found.");
  if (!input.administrator && metadata.ownerId !== input.actorId)
    throw new Error(
      "You can only attach files uploaded from your own account."
    );
  if (metadata.purpose !== input.purpose)
    throw new Error("This file was uploaded for a different portal workflow.");
  if (metadata.lifecycle === "deleted" || metadata.lifecycle === "rejected")
    throw new Error("This file is no longer available for attachment.");
  return metadata;
}

export async function linkPortalFile(input: {
  fileId: string;
  actorId: number;
  entityType: "paper" | "submission";
  entityId: number;
}) {
  const db = await mongo();
  const metadata = await portalFileById(input.fileId);
  if (!metadata) throw new Error("The uploaded file could not be found.");
  const alreadyLinked = metadata.references.some(
    reference =>
      reference.entityType === input.entityType &&
      reference.entityId === input.entityId
  );
  if (!alreadyLinked) {
    await db.collection<PortalFileMetadata>("file_metadata").updateOne(
      { _id: metadata._id },
      {
        $set: { lifecycle: "linked", updatedAt: new Date() },
        $push: {
          references: {
            entityType: input.entityType,
            entityId: input.entityId,
          },
        },
      }
    );
  }
  await recordWorkflow({
    entityType: "file",
    entityId: input.fileId,
    status: `linked:${input.entityType}`,
    actorId: input.actorId,
    detail: String(input.entityId),
  });
}

export async function listPortalFiles() {
  return await (
    await mongo()
  )
    .collection<PortalFileMetadata>("file_metadata")
    .find({ deletedAt: { $exists: false } })
    .sort({ createdAt: -1 })
    .limit(200)
    .toArray();
}

export async function deletePortalFile(input: {
  fileId: string;
  actorId: number;
}) {
  const metadata = await portalFileById(input.fileId);
  if (!metadata) throw new Error("The selected file is unavailable.");
  if (metadata.references.length)
    throw new Error("Referenced files cannot be deleted.");
  await (await portalFiles()).delete(new ObjectId(input.fileId));
  await (await mongo())
    .collection<PortalFileMetadata>("file_metadata")
    .updateOne(
      { _id: metadata._id },
      {
        $set: {
          lifecycle: "deleted",
          deletedAt: new Date(),
          updatedAt: new Date(),
        },
      }
    );
  await recordOperationalEvent({
    eventType: "file.deleted",
    actorId: input.actorId,
    subjectType: "file",
    subjectId: input.fileId,
  });
}

export async function streamPortalFile(fileId: string, response: Response) {
  const metadata = await portalFileById(fileId);
  if (!metadata) throw new Error("The requested file is unavailable.");
  const stream = (await portalFiles()).openDownloadStream(new ObjectId(fileId));
  response.setHeader("Content-Type", metadata.mimeType);
  response.setHeader("Content-Length", String(metadata.byteLength));
  response.setHeader(
    "Content-Disposition",
    `attachment; filename*=UTF-8''${encodeURIComponent(metadata.fileName)}`
  );
  response.setHeader("Cache-Control", "private, no-store");
  await new Promise<void>((resolve, reject) => {
    stream.once("error", reject);
    stream.once("end", resolve);
    stream.pipe(response);
  });
  return metadata;
}
