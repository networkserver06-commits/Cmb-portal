import { describe, expect, it } from "vitest";

import { appRouter } from "./routers";
import { mongo } from "./mongoStore";
import { deletePortalFile, uploadPortalFile } from "./fileStore";
import type { TrpcContext } from "./_core/context";

const runId = `admin-posting-${Date.now()}`;
const adminId = 930000 + Math.floor(Math.random() * 1000);

function context(): TrpcContext {
  return {
    user: {
      id: adminId,
      openId: `${runId}-admin`,
      name: "Posting Test Admin",
      email: `${runId}@example.com`,
      loginMethod: "password",
      role: "admin",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("administrator posting persistence", () => {
  it("persists selected education levels and publication modes for papers and posts", async () => {
    const db = await mongo();
    const paperFile = await uploadPortalFile({
      ownerId: adminId,
      purpose: "paper",
      fileName: `${runId}-paper.pdf`,
      mimeType: "application/pdf",
      bytes: Buffer.from("%PDF-1.4\nadmin-paper"),
    });
    const postFile = await uploadPortalFile({
      ownerId: adminId,
      purpose: "paper",
      fileName: `${runId}-post.pdf`,
      mimeType: "application/pdf",
      bytes: Buffer.from("%PDF-1.4\nadmin-post"),
    });
    try {
      const caller = appRouter.createCaller(context());
      const createdPaper = await caller.admin.createPaper({
        title: `${runId}-paper`,
        course: "Computer Science",
        level: "university",
        cycle: "Semester 1",
        unit: "Data Structures",
        paperType: "Revision paper",
        description: "Administrator paper",
        priceKes: 150,
        fileId: paperFile.gridFsId,
      });
      const publishedPost = await caller.admin.publishPost({
        title: `${runId}-post`,
        course: "Electrical Installation",
        level: "tvet",
        cycle: "Term 2",
        unit: "Safety Practice",
        paperType: "Study post",
        description: "Administrator post",
        priceKes: 0,
        mode: "free",
        fileId: postFile.gridFsId,
      });
      const saved = await db
        .collection<any>("papers")
        .find({ title: { $in: [`${runId}-paper`, `${runId}-post`] } })
        .toArray();
      expect(createdPaper.success).toBe(true);
      expect(publishedPost.success).toBe(true);
      expect(saved).toHaveLength(2);
      expect(saved).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            title: `${runId}-paper`,
            level: "university",
            accessMode: "purchase",
            priceKes: 150,
            isAvailable: true,
          }),
          expect.objectContaining({
            title: `${runId}-post`,
            level: "tvet",
            accessMode: "free",
            postMode: "free",
            priceKes: 0,
            isAvailable: true,
          }),
        ])
      );
    } finally {
      await db.collection("papers").deleteMany({
        title: { $in: [`${runId}-paper`, `${runId}-post`] },
      });
      for (const fileId of [paperFile.gridFsId, postFile.gridFsId]) {
        await db
          .collection("file_metadata")
          .updateOne({ gridFsId: fileId }, { $set: { references: [] } });
        await deletePortalFile({ fileId, actorId: adminId });
      }
      await db.collection("operational_records").deleteMany({
        subjectId: { $in: [paperFile.gridFsId, postFile.gridFsId] },
      });
    }
  }, 45_000);
});
