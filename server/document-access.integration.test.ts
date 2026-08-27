import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ObjectId } from "mongodb";
import { strToU8, zipSync } from "fflate";
import { createAccount, loginAccount, ACCOUNT_COOKIE } from "./mongoAuth";
import { createApp } from "./_core/index";
import {
  deletePortalFile,
  portalFileById,
  uploadPortalFile,
} from "./fileStore";
import { mongo, nextId } from "./mongoStore";

const runId = `document-access-${Date.now()}`;
const password = "DocumentAccess123!";
const emails = [
  `${runId}-admin@example.com`,
  `${runId}-owner@example.com`,
  `${runId}-entitled@example.com`,
  `${runId}-stranger@example.com`,
  `${runId}-free-upload@example.com`,
];
let server: Server;
let baseUrl = "";

function requestStub() {
  return { protocol: "http", headers: {} };
}

function responseStub() {
  let token = "";
  return {
    cookie: (_name: string, value: string) => {
      token = value;
    },
    clearCookie: () => undefined,
    getToken: () => token,
  };
}

function renderableDocx() {
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;
  const relationships = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;
  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>ScholarShelf runtime DOCX preview</w:t></w:r></w:p>
    <w:p><w:r><w:t>Anonymous visitors can read this office document.</w:t></w:r></w:p>
  </w:body>
</w:document>`;
  return zipSync({
    "[Content_Types].xml": strToU8(contentTypes),
    "_rels/.rels": strToU8(relationships),
    "word/document.xml": strToU8(document),
  });
}

function renderablePdf() {
  const stream =
    "BT\n/F1 18 Tf\n72 720 Td\n(ScholarShelf public viewer test) Tj\nET\n";
  const objects = [
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
    "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n",
    "4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n",
    `5 0 obj\n<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}endstream\nendobj\n`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (const object of objects) {
    offsets.push(Buffer.byteLength(pdf));
    pdf += object;
  }
  const xrefOffset = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1))
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return pdf;
}

async function createSession(
  email: string,
  name: string,
  role: "admin" | "user"
) {
  const created = await createAccount(
    email,
    password,
    name,
    requestStub(),
    responseStub()
  );
  const db = await mongo();
  await db
    .collection("accounts")
    .updateOne({ email }, { $set: { emailVerified: true } });
  const account = await db.collection<any>("accounts").findOne({ email });
  await db
    .collection("users")
    .updateOne({ openId: account.mysqlOpenId }, { $set: { role } });
  const response = responseStub();
  const user = await loginAccount(email, password, requestStub(), response);
  const token = response.getToken();
  expect(created.email).toBe(email);
  expect(token).toBeTruthy();
  return {
    user: user!,
    cookie: `${ACCOUNT_COOKIE}=${token}`,
  };
}

beforeAll(async () => {
  server = createServer(await createApp());
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;
}, 180_000);

afterAll(async () => {
  await new Promise<void>(resolve => server.close(() => resolve()));
  const db = await mongo();
  await db.collection("accounts").deleteMany({ email: { $in: emails } });
  await db.collection("users").deleteMany({ email: { $in: emails } });
}, 180_000);

describe("protected document access routes", () => {
  it("uploads and publishes a free administrator paper through HTTP with a working view", async () => {
    const admin = await createSession(emails[4]!, "Free Upload Admin", "admin");
    const db = await mongo();
    let fileId = "";
    let officeFileId = "";
    let paperId = 0;
    let officePaperId = 0;
    let paidPaperId = 0;
    let privatePaperId = 0;
    try {
      const upload = await fetch(`${baseUrl}/api/files/upload`, {
        method: "POST",
        headers: {
          cookie: admin.cookie,
          "content-type": "application/octet-stream",
          "x-file-name": encodeURIComponent(`${runId}-free-upload.pdf`),
          "x-file-type": "application/pdf",
          "x-file-purpose": "paper",
        },
        body: Buffer.from(renderablePdf()),
      });
      expect(upload.status).toBe(201);
      const uploaded = (await upload.json()) as { fileId?: string };
      fileId = uploaded.fileId ?? "";
      expect(fileId).toMatch(/^[a-f0-9]{24}$/);

      const officeUpload = await fetch(`${baseUrl}/api/files/upload`, {
        method: "POST",
        headers: {
          cookie: admin.cookie,
          "content-type": "application/octet-stream",
          "x-file-name": encodeURIComponent(`${runId}-office-upload.docx`),
          "x-file-type":
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "x-file-purpose": "paper",
        },
        body: renderableDocx(),
      });
      expect(officeUpload.status).toBe(201);
      officeFileId =
        ((await officeUpload.json()) as { fileId?: string }).fileId ?? "";
      expect(officeFileId).toMatch(/^[a-f0-9]{24}$/);

      const input = {
        title: `${runId}-free-paper`,
        course: "ScholarShelf QA",
        level: "university",
        cycle: "August 2026",
        unit: "Document viewing",
        paperType: "Admin verification",
        description: "Free upload regression",
        priceKes: 0,
        mode: "free",
        fileId,
      };
      const create = await fetch(
        `${baseUrl}/api/trpc/admin.createPaper?batch=1`,
        {
          method: "POST",
          headers: {
            cookie: admin.cookie,
            "content-type": "application/json",
            accept: "application/json",
          },
          body: JSON.stringify({ 0: { json: input } }),
        }
      );
      expect(create.status).toBe(200);
      const createdPayload = (await create.json()) as Array<{
        result?: { data?: { json?: { paper?: { legacyId?: number } } } };
      }>;
      paperId = createdPayload[0]?.result?.data?.json?.paper?.legacyId ?? 0;
      expect(paperId).toBeGreaterThan(0);

      const saved = await db.collection<any>("papers").findOne({
        legacyId: paperId,
      });
      expect(saved).toEqual(
        expect.objectContaining({
          fileId,
          priceKes: 0,
          accessMode: "free",
          postMode: "free",
          isAvailable: true,
        })
      );

      const officeCreate = await fetch(
        `${baseUrl}/api/trpc/admin.createPaper?batch=1`,
        {
          method: "POST",
          headers: {
            cookie: admin.cookie,
            "content-type": "application/json",
            accept: "application/json",
          },
          body: JSON.stringify({
            0: {
              json: {
                ...input,
                title: `${runId}-office-paper`,
                fileId: officeFileId,
              },
            },
          }),
        }
      );
      expect(officeCreate.status).toBe(200);
      const officeCreatedPayload = (await officeCreate.json()) as Array<{
        result?: { data?: { json?: { paper?: { legacyId?: number } } } };
      }>;
      officePaperId =
        officeCreatedPayload[0]?.result?.data?.json?.paper?.legacyId ?? 0;
      expect(officePaperId).toBeGreaterThan(0);

      const anonymousOfficePreview = await fetch(
        `${baseUrl}/api/papers/${officePaperId}/office-preview`
      );
      expect(anonymousOfficePreview.status).toBe(200);
      expect(anonymousOfficePreview.headers.get("content-type")).toContain(
        "text/html"
      );
      await expect(anonymousOfficePreview.text()).resolves.toContain(
        "ScholarShelf runtime DOCX preview"
      );

      paidPaperId = await nextId("papers");
      privatePaperId = await nextId("papers");
      await db.collection("papers").insertMany([
        {
          _id: new ObjectId(),
          legacyId: paidPaperId,
          title: `${runId}-paid-paper`,
          course: "ScholarShelf QA",
          level: "university",
          cycle: "August 2026",
          unit: "Paid access boundary",
          paperType: "Theory",
          description: "Paid paper must remain protected",
          priceKes: 50,
          fileId,
          fileName: saved.fileName,
          fileMimeType: saved.fileMimeType,
          isAvailable: true,
          accessMode: "purchase",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          _id: new ObjectId(),
          legacyId: privatePaperId,
          title: `${runId}-private-paper`,
          course: "ScholarShelf QA",
          level: "university",
          cycle: "August 2026",
          unit: "Inactive access boundary",
          paperType: "Theory",
          description: "Paused paper must remain protected",
          priceKes: 0,
          fileId,
          fileName: saved.fileName,
          fileMimeType: saved.fileMimeType,
          isAvailable: false,
          accessMode: "free",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const anonymousFreeView = await fetch(
        `${baseUrl}/api/papers/${paperId}/free-view`
      );
      expect(anonymousFreeView.status).toBe(200);
      expect(anonymousFreeView.headers.get("content-disposition")).toContain(
        "inline"
      );
      const anonymousPdf = Buffer.from(await anonymousFreeView.arrayBuffer());
      expect(anonymousPdf.subarray(0, 8).toString()).toBe("%PDF-1.4");

      const anonymousPaidView = await fetch(
        `${baseUrl}/api/papers/${paidPaperId}/free-view`
      );
      expect(anonymousPaidView.status).toBe(403);

      const anonymousPrivateView = await fetch(
        `${baseUrl}/api/papers/${privatePaperId}/free-view`
      );
      expect(anonymousPrivateView.status).toBe(403);

      const anonymousProtectedView = await fetch(
        `${baseUrl}/api/papers/${paperId}/view`
      );
      expect(anonymousProtectedView.status).toBe(401);

      const view = await fetch(`${baseUrl}/api/files/${fileId}/view`, {
        headers: { cookie: admin.cookie },
      });
      expect(view.status).toBe(200);
      expect(view.headers.get("content-disposition")).toContain("inline");
      const adminPdf = Buffer.from(await view.arrayBuffer());
      expect(adminPdf.subarray(0, 8).toString()).toBe("%PDF-1.4");
    } finally {
      if (paperId)
        await db.collection("papers").deleteMany({
          legacyId: {
            $in: [paperId, officePaperId, paidPaperId, privatePaperId],
          },
        });
      for (const uploadedFileId of [fileId, officeFileId]) {
        if (!uploadedFileId) continue;
        await db
          .collection("file_metadata")
          .updateOne(
            { gridFsId: uploadedFileId },
            { $set: { references: [] } }
          );
        if (await portalFileById(uploadedFileId))
          await deletePortalFile({
            fileId: uploadedFileId,
            actorId: admin.user.id,
          });
      }
    }
  }, 180_000);

  it("allows admin and authorized student viewing while denying unrelated users", async () => {
    const admin = await createSession(emails[0]!, "Document Admin", "admin");
    const owner = await createSession(emails[1]!, "Document Owner", "user");
    const entitled = await createSession(
      emails[2]!,
      "Entitled Student",
      "user"
    );
    const stranger = await createSession(
      emails[3]!,
      "Unrelated Student",
      "user"
    );
    const db = await mongo();
    const file = await uploadPortalFile({
      ownerId: owner.user.id,
      purpose: "submission",
      fileName: `${runId}.pdf`,
      mimeType: "application/pdf",
      bytes: Buffer.from("%PDF-1.4\\nruntime-view-test"),
    });
    const paperId = await nextId("papers");
    await db.collection("papers").insertOne({
      _id: new ObjectId(),
      legacyId: paperId,
      title: `${runId}-paper`,
      course: "ScholarShelf Studies",
      level: "university",
      cycle: "June 2026",
      unit: "Communication Skills",
      paperType: "Theory",
      description: "Runtime access test",
      priceKes: 0,
      fileId: file.gridFsId,
      fileName: file.fileName,
      fileMimeType: file.mimeType,
      isAvailable: true,
      accessMode: "free",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await db.collection("entitlements").insertOne({
      _id: new ObjectId(),
      legacyId: await nextId("entitlements"),
      userId: entitled.user.id,
      paperId,
      source: "free",
      grantedAt: new Date(),
    });
    try {
      const adminView = await fetch(
        `${baseUrl}/api/files/${file.gridFsId}/view`,
        { headers: { cookie: admin.cookie } }
      );
      expect(adminView.status).toBe(200);
      expect(adminView.headers.get("content-disposition")).toContain("inline");
      await expect(adminView.text()).resolves.toContain("%PDF-1.4");

      const ownerView = await fetch(
        `${baseUrl}/api/files/${file.gridFsId}/view`,
        { headers: { cookie: owner.cookie } }
      );
      expect(ownerView.status).toBe(200);

      const forbiddenFileView = await fetch(
        `${baseUrl}/api/files/${file.gridFsId}/view`,
        { headers: { cookie: stranger.cookie } }
      );
      expect(forbiddenFileView.status).toBe(403);

      const entitledPaperView = await fetch(
        `${baseUrl}/api/papers/${paperId}/view`,
        { headers: { cookie: entitled.cookie } }
      );
      expect(entitledPaperView.status).toBe(200);
      expect(entitledPaperView.headers.get("content-disposition")).toContain(
        "inline"
      );

      const forbiddenPaperView = await fetch(
        `${baseUrl}/api/papers/${paperId}/view`,
        { headers: { cookie: stranger.cookie } }
      );
      expect(forbiddenPaperView.status).toBe(403);
    } finally {
      await db.collection("entitlements").deleteMany({ paperId });
      await db.collection("papers").deleteMany({ legacyId: paperId });
      await db
        .collection("file_metadata")
        .updateOne({ gridFsId: file.gridFsId }, { $set: { references: [] } });
      if (await portalFileById(file.gridFsId))
        await deletePortalFile({
          fileId: file.gridFsId,
          actorId: admin.user.id,
        });
    }
  }, 180_000);
});
