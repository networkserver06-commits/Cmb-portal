import { afterAll, afterEach, describe, expect, it } from "vitest";
import {
  deletePortalFile,
  CHUNK_UPLOAD_BYTES,
  chunkCountForBytes,
  MAX_UPLOAD_BYTES,
  portalFileById,
  uploadPortalFile,
  validateUpload,
} from "./fileStore";
import { closeMongoConnectionForTests, mongo } from "./mongoStore";

const createdFileIds: string[] = [];

afterEach(async () => {
  if (!createdFileIds.length) return;
  const db = await mongo();
  await db
    .collection("operational_records")
    .deleteMany({ subjectId: { $in: createdFileIds } });
  createdFileIds.length = 0;
});

afterAll(async () => {
  await closeMongoConnectionForTests();
});

describe("GridFS upload validation", () => {
  it("accepts a valid PDF signature and rejects unsafe type, size, and signature combinations", () => {
    expect(
      validateUpload({
        fileName: "revision.pdf",
        mimeType: "application/pdf",
        byteLength: 9,
        bytes: Buffer.from("%PDF-1.4"),
      }).fileName
    ).toBe("revision.pdf");
    expect(() =>
      validateUpload({
        fileName: "revision.exe",
        mimeType: "application/octet-stream",
        byteLength: 1,
      })
    ).toThrow("Supported files include PDF");
    expect(() =>
      validateUpload({
        fileName: "revision.pdf",
        mimeType: "text/plain",
        byteLength: 9,
      })
    ).toThrow("does not match");
    expect(() =>
      validateUpload({
        fileName: "revision.pdf",
        mimeType: "application/pdf",
        byteLength: MAX_UPLOAD_BYTES + 1,
      })
    ).toThrow("250 MiB");
    expect(() =>
      validateUpload({
        fileName: "revision.pdf",
        mimeType: "application/pdf",
        byteLength: 6,
        bytes: Buffer.from("NOTPDF"),
      })
    ).toThrow("signature");
  });

  it("accepts modern office formats and legacy document fallbacks", () => {
    const cases = [
      [
        "revision.docx",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ],
      [
        "revision.xlsx",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      ],
      [
        "revision.pptx",
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      ],
      ["revision.odt", "application/vnd.oasis.opendocument.text"],
      ["revision.ods", "application/vnd.oasis.opendocument.spreadsheet"],
      ["revision.odp", "application/vnd.oasis.opendocument.presentation"],
      ["revision.rtf", "application/rtf"],
      ["revision.epub", "application/epub+zip"],
      ["revision.md", "text/markdown"],
      ["revision.html", "text/html"],
      ["revision.doc", "application/msword"],
      ["revision.xls", "application/vnd.ms-excel"],
      ["revision.ppt", "application/vnd.ms-powerpoint"],
    ] as const;

    for (const [fileName, mimeType] of cases) {
      expect(
        validateUpload({ fileName, mimeType, byteLength: 4 }).extension
      ).toBe(fileName.split(".").pop());
    }
  });

  it("derives stable chunk manifests at boundaries through the maximum upload size", () => {
    expect(chunkCountForBytes(1)).toBe(1);
    expect(chunkCountForBytes(CHUNK_UPLOAD_BYTES)).toBe(1);
    expect(chunkCountForBytes(CHUNK_UPLOAD_BYTES + 1)).toBe(2);
    expect(chunkCountForBytes(MAX_UPLOAD_BYTES)).toBe(
      Math.ceil(MAX_UPLOAD_BYTES / CHUNK_UPLOAD_BYTES)
    );
    expect(chunkCountForBytes(MAX_UPLOAD_BYTES)).toBe(72);
  });

  it("persists an uploaded document in GridFS with MongoDB metadata and removes it safely when unreferenced", async () => {
    const file = await uploadPortalFile({
      ownerId: 999_001,
      purpose: "submission",
      fileName: `test-${Date.now()}.pdf`,
      mimeType: "application/pdf",
      bytes: Buffer.from("%PDF-1.4\nunit-test"),
    });
    createdFileIds.push(file.gridFsId);
    expect(file.gridFsId).toMatch(/^[a-f0-9]{24}$/);
    expect(file.byteLength).toBeGreaterThan(5);
    expect(file.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect((await portalFileById(file.gridFsId))?.lifecycle).toBe("pending");
    await deletePortalFile({ fileId: file.gridFsId, actorId: 999_001 });
    expect(await portalFileById(file.gridFsId)).toBeNull();
    const db = await mongo();
    await db
      .collection("operational_records")
      .deleteMany({ subjectId: file.gridFsId });
    createdFileIds.splice(createdFileIds.indexOf(file.gridFsId), 1);
  }, 45_000);
});
