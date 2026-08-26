import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ObjectId } from "mongodb";
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
}, 90_000);

afterAll(async () => {
  await new Promise<void>(resolve => server.close(() => resolve()));
  const db = await mongo();
  await db.collection("accounts").deleteMany({ email: { $in: emails } });
  await db.collection("users").deleteMany({ email: { $in: emails } });
}, 90_000);

describe("protected document access routes", () => {
  it("uploads and publishes a free administrator paper through HTTP with a working view", async () => {
    const admin = await createSession(emails[4]!, "Free Upload Admin", "admin");
    const db = await mongo();
    let fileId = "";
    let paperId = 0;
    try {
      const upload = await fetch(`${baseUrl}/api/files/upload`, {
        method: "POST",
        headers: {
          cookie: admin.cookie,
          "content-type": "application/octet-stream",
          "x-file-name": encodeURIComponent(`${runId}-free-upload.txt`),
          "x-file-type": "text/plain",
          "x-file-purpose": "paper",
        },
        body: Buffer.from("ScholarShelf browser upload regression"),
      });
      expect(upload.status).toBe(201);
      const uploaded = (await upload.json()) as { fileId?: string };
      fileId = uploaded.fileId ?? "";
      expect(fileId).toMatch(/^[a-f0-9]{24}$/);

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

      const view = await fetch(`${baseUrl}/api/files/${fileId}/view`, {
        headers: { cookie: admin.cookie },
      });
      expect(view.status).toBe(200);
      expect(view.headers.get("content-disposition")).toContain("inline");
      await expect(view.text()).resolves.toContain("browser upload regression");
    } finally {
      if (paperId)
        await db.collection("papers").deleteOne({ legacyId: paperId });
      if (fileId) {
        await db
          .collection("file_metadata")
          .updateOne({ gridFsId: fileId }, { $set: { references: [] } });
        if (await portalFileById(fileId))
          await deletePortalFile({ fileId, actorId: admin.user.id });
      }
    }
  }, 90_000);

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
  }, 90_000);
});
