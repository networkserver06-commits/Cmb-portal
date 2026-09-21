import { createHash, randomUUID } from "node:crypto";
import type { Response } from "express";
import { ObjectId } from "mongodb";
import {
  mongo,
  portalFiles,
  recordOperationalEvent,
  recordWorkflow,
} from "./mongoStore";

export const MAX_UPLOAD_BYTES = 250 * 1024 * 1024;
export const MAX_SCAN_BYTES = 4 * 1024 * 1024;
export const CHUNK_UPLOAD_BYTES = 3.5 * 1024 * 1024;
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
  xls: ["application/vnd.ms-excel"],
  xlsx: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
  odt: ["application/vnd.oasis.opendocument.text"],
  odp: ["application/vnd.oasis.opendocument.presentation"],
  ods: ["application/vnd.oasis.opendocument.spreadsheet"],
  rtf: ["application/rtf", "text/rtf"],
  epub: ["application/epub+zip"],
  md: ["text/markdown", "text/plain"],
  html: ["text/html", "application/xhtml+xml"],
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
      "Supported files include PDF, Word, Excel, PowerPoint, OpenDocument, RTF, EPUB, Markdown, HTML, TXT, and CSV."
    );
  if (!Number.isInteger(input.byteLength) || input.byteLength < 1)
    throw new Error("Select a non-empty document to upload.");
  if (input.byteLength > MAX_UPLOAD_BYTES)
    throw new Error(
      "Files must be 250 MiB or smaller."
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

export async function unlinkPortalFile(input: {
  fileId: string;
  actorId: number;
  entityType: "paper" | "submission";
  entityId: number;
}) {
  const db = await mongo();
  const metadata = await portalFileById(input.fileId);
  if (!metadata) return;
  const references = metadata.references.filter(
    reference =>
      !(
        reference.entityType === input.entityType &&
        reference.entityId === input.entityId
      )
  );
  if (references.length === metadata.references.length) return;
  await db.collection<PortalFileMetadata>("file_metadata").updateOne(
    { _id: metadata._id },
    {
      $set: {
        references,
        lifecycle: references.length ? "linked" : "archived",
        updatedAt: new Date(),
      },
    }
  );
  await recordWorkflow({
    entityType: "file",
    entityId: input.fileId,
    status: `unlinked:${input.entityType}`,
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

export async function purgeRejectedPortalFile(input: {
  fileId: string;
  actorId: number;
}) {
  const metadata = await portalFileById(input.fileId);
  if (!metadata) return { deleted: false as const };
  if (metadata.references.some(reference => reference.entityType === "paper"))
    throw new Error(
      "A file linked to a published paper cannot be purged as a rejected submission."
    );

  for (const reference of metadata.references) {
    await unlinkPortalFile({
      fileId: input.fileId,
      actorId: input.actorId,
      entityType: reference.entityType,
      entityId: reference.entityId,
    });
  }
  await deletePortalFile(input);
  await recordWorkflow({
    entityType: "file",
    entityId: input.fileId,
    status: "rejected:purged",
    actorId: input.actorId,
    detail: "GridFS bytes and active file metadata deleted",
  });
  return { deleted: true as const };
}

export async function readPortalFileBytes(fileId: string) {
  const metadata = await portalFileById(fileId);
  if (!metadata) throw new Error("The requested file is unavailable.");
  if (metadata.byteLength > MAX_SCAN_BYTES)
    throw new Error("The selected file exceeds the safety scan limit.");

  const stream = (await portalFiles()).openDownloadStream(new ObjectId(fileId));
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of stream) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.byteLength;
    if (total > MAX_SCAN_BYTES)
      throw new Error("The selected file exceeds the safety scan limit.");
    chunks.push(buffer);
  }
  return Buffer.concat(chunks, total);
}

export async function streamPortalFile(
  fileId: string,
  response: Response,
  options: { disposition?: "inline" | "attachment" } = {}
) {
  const metadata = await portalFileById(fileId);
  if (!metadata) throw new Error("The requested file is unavailable.");
  const stream = (await portalFiles()).openDownloadStream(new ObjectId(fileId));
  response.setHeader("Content-Type", metadata.mimeType);
  if (
    ["text/html", "application/xhtml+xml"].includes(
      metadata.mimeType.split(";", 1)[0].trim().toLowerCase()
    )
  ) {
    response.setHeader(
      "Content-Security-Policy",
      "sandbox; default-src 'none'; base-uri 'none'; form-action 'none'; img-src data:; style-src 'unsafe-inline'"
    );
  }
  response.setHeader("Content-Length", String(metadata.byteLength));
  response.setHeader(
    "Content-Disposition",
    `${options.disposition ?? "attachment"}; filename*=UTF-8''${encodeURIComponent(metadata.fileName)}`
  );
  response.setHeader("Cache-Control", "private, no-store");
  await new Promise<void>((resolve, reject) => {
    stream.once("error", reject);
    stream.once("end", resolve);
    stream.pipe(response);
  });
  return metadata;
}


type ChunkUploadSession = {
  _id: string;
  ownerId: number;
  purpose: FilePurpose;
  fileName: string;
  mimeType: string;
  totalBytes: number;
  totalChunks: number;
  createdAt: Date;
  expiresAt: Date;
};

export async function beginChunkedPortalUpload(input: {
  ownerId: number;
  purpose: FilePurpose;
  fileName: string;
  mimeType: string;
  totalBytes: number;
  totalChunks: number;
}) {
  validateUpload({
    fileName: input.fileName,
    mimeType: input.mimeType,
    byteLength: input.totalBytes,
  });
  if (
    !Number.isInteger(input.totalChunks) ||
    input.totalChunks < 1 ||
    input.totalChunks > Math.ceil(MAX_UPLOAD_BYTES / CHUNK_UPLOAD_BYTES)
  )
    throw new Error("The upload contains an invalid number of chunks.");
  const uploadId = randomUUID();
  await (await mongo()).collection<ChunkUploadSession>("upload_sessions").insertOne({
    _id: uploadId,
    ownerId: input.ownerId,
    purpose: input.purpose,
    fileName: input.fileName,
    mimeType: input.mimeType,
    totalBytes: input.totalBytes,
    totalChunks: input.totalChunks,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
  });
  return { uploadId, chunkSize: CHUNK_UPLOAD_BYTES };
}

export async function storePortalUploadChunk(input: {
  uploadId: string;
  ownerId: number;
  index: number;
  bytes: Buffer;
}) {
  const database = await mongo();
  const session = await database
    .collection<ChunkUploadSession>("upload_sessions")
    .findOne({ _id: input.uploadId, ownerId: input.ownerId });
  if (!session || session.expiresAt.getTime() < Date.now())
    throw new Error("This upload session has expired. Start the upload again.");
  if (
    !Number.isInteger(input.index) ||
    input.index < 0 ||
    input.index >= session.totalChunks
  )
    throw new Error("The upload chunk number is invalid.");
  if (input.bytes.byteLength > CHUNK_UPLOAD_BYTES)
    throw new Error("The upload chunk is too large.");
  await database.collection("upload_chunks").updateOne(
    { uploadId: input.uploadId, index: input.index },
    {
      $set: {
        uploadId: input.uploadId,
        index: input.index,
        bytes: input.bytes,
        byteLength: input.bytes.byteLength,
        expiresAt: session.expiresAt,
        updatedAt: new Date(),
      },
    },
    { upsert: true }
  );
  const received = await database
    .collection("upload_chunks")
    .countDocuments({ uploadId: input.uploadId });
  return { received, totalChunks: session.totalChunks };
}

export async function completeChunkedPortalUpload(input: {
  uploadId: string;
  ownerId: number;
}) {
  const database = await mongo();
  const sessions = database.collection<ChunkUploadSession>("upload_sessions");
  const session = await sessions.findOne({
    _id: input.uploadId,
    ownerId: input.ownerId,
  });
  if (!session || session.expiresAt.getTime() < Date.now())
    throw new Error("This upload session has expired. Start the upload again.");
  const chunks = await database
    .collection<{ index: number; bytes: Buffer }>("upload_chunks")
    .find({ uploadId: input.uploadId })
    .sort({ index: 1 })
    .toArray();
  if (
    chunks.length !== session.totalChunks ||
    chunks.some((chunk, index) => chunk.index !== index)
  )
    throw new Error("Some upload chunks are missing. Please retry the upload.");
  const totalBytes = chunks.reduce(
    (sum, chunk) => sum + chunk.bytes.byteLength,
    0
  );
  if (totalBytes !== session.totalBytes)
    throw new Error("The uploaded file size does not match its upload manifest.");
  const firstChunk = chunks[0]?.bytes ?? Buffer.alloc(0);
  const validated = validateUpload({
    fileName: session.fileName,
    mimeType: session.mimeType,
    byteLength: totalBytes,
    bytes: firstChunk,
  });
  const bucket = await portalFiles();
  const hash = createHash("sha256");
  const upload = bucket.openUploadStream(validated.fileName, {
    metadata: {
      ownerId: session.ownerId,
      purpose: session.purpose,
      uploadedAt: new Date(),
      originalName: validated.fileName,
      mimeType: validated.mimeType,
    },
  });
  try {
    for (const chunk of chunks) {
      hash.update(chunk.bytes);
      upload.write(chunk.bytes);
    }
    upload.end();
    await new Promise<void>((resolve, reject) => {
      upload.once("error", reject);
      upload.once("finish", resolve);
    });
    const now = new Date();
    const metadata: PortalFileMetadata = {
      _id: new ObjectId(),
      gridFsId: upload.id.toString(),
      ownerId: session.ownerId,
      purpose: session.purpose,
      lifecycle: "pending",
      fileName: validated.fileName,
      mimeType: validated.mimeType,
      byteLength: totalBytes,
      sha256: hash.digest("hex"),
      references: [],
      createdAt: now,
      updatedAt: now,
    };
    await database
      .collection<PortalFileMetadata>("file_metadata")
      .insertOne(metadata);
    await recordWorkflow({
      entityType: "file",
      entityId: metadata.gridFsId,
      status: "uploaded",
      actorId: session.ownerId,
      detail: `${session.purpose}:chunked`,
    });
    await recordOperationalEvent({
      eventType: "file.uploaded",
      actorId: session.ownerId,
      subjectType: "file",
      subjectId: metadata.gridFsId,
      detail: {
        purpose: session.purpose,
        byteLength: metadata.byteLength,
        mimeType: metadata.mimeType,
        chunked: true,
      },
    });
    await database.collection("upload_chunks").deleteMany({ uploadId: input.uploadId });
    await sessions.deleteOne({ _id: input.uploadId });
    return metadata;
  } catch (error) {
    await bucket.delete(upload.id).catch(() => undefined);
    throw error;
  }
}
