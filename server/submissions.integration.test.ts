import { describe, expect, it } from "vitest";
import { ObjectId } from "mongodb";
import { appRouter } from "./routers";
import { mongo } from "./mongoStore";
import {
  deletePortalFile,
  portalFileById,
  uploadPortalFile,
} from "./fileStore";
import { portalFiles } from "./mongoStore";
import type { TrpcContext } from "./_core/context";

const runId = `submission-test-${Date.now()}`;
const studentA = 910000 + Math.floor(Math.random() * 1000);
const studentB = studentA + 1;
const adminId = studentA + 2;

function user(
  id: number,
  role: "user" | "admin"
): NonNullable<TrpcContext["user"]> {
  return {
    id,
    openId: `${runId}-${id}`,
    name: role === "admin" ? "Test Admin" : "Test Student",
    email: `${runId}-${id}@example.com`,
    loginMethod: "password",
    role,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };
}

function context(currentUser: TrpcContext["user"]): TrpcContext {
  return {
    user: currentUser,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("paper submission ownership and moderation", () => {
  it("returns only submissions owned by the authenticated student", async () => {
    const db = await mongo();
    await db.collection("submissions").insertMany([
      {
        _id: new ObjectId(),
        legacyId: studentA,
        userId: studentA,
        title: `${runId}-owned`,
        createdAt: new Date(),
        status: "pending",
      },
      {
        _id: new ObjectId(),
        legacyId: studentA + 10,
        userId: studentB,
        title: `${runId}-other`,
        createdAt: new Date(),
        status: "pending",
      },
    ]);
    try {
      const result = await appRouter
        .createCaller(context(user(studentA, "user")))
        .student.submissions();
      expect(result).toHaveLength(1);
      expect(result[0]?.userId).toBe(studentA);
      expect(result[0]?.title).toBe(`${runId}-owned`);
    } finally {
      await db
        .collection("submissions")
        .deleteMany({ title: { $regex: `^${runId}` } });
    }
  }, 90_000);

  it("auto-publishes safe submissions, holds uncertain files, and purges rejected bytes", async () => {
    const db = await mongo();
    const safeFile = await uploadPortalFile({
      ownerId: studentA,
      purpose: "submission",
      fileName: `${runId}-safe.pdf`,
      mimeType: "application/pdf",
      bytes: Buffer.from("%PDF-1.4\\nsafe-submission"),
    });
    const heldFile = await uploadPortalFile({
      ownerId: studentA,
      purpose: "submission",
      fileName: `${runId}-held.docx`,
      mimeType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      bytes: Buffer.from("PK\\x03\\x04 office-document"),
    });
    const suspiciousFile = await uploadPortalFile({
      ownerId: studentA,
      purpose: "submission",
      fileName: `${runId}-suspicious.pdf`,
      mimeType: "application/pdf",
      bytes: Buffer.from("%PDF-1.4\\n/JavaScript alert"),
    });
    const caller = appRouter.createCaller(context(user(studentA, "user")));
    try {
      const safe = await caller.student.submitPaper({
        title: `${runId}-safe-paper`,
        course: "ScholarShelf Studies",
        level: "university",
        cycle: "June 2026",
        unit: "Communication Skills",
        paperType: "Theory",
        description: "Safe submission",
        fileId: safeFile.gridFsId,
        authorized: true,
      });
      expect(safe.publication.status).toBe("published");
      expect(safe.submission.status).toBe("approved");
      const safePaper = await db.collection<any>("papers").findOne({
        submissionId: safe.submission.legacyId,
      });
      expect(safePaper).toMatchObject({
        isAvailable: true,
        accessMode: "free",
        publicationMode: "automatic",
        fileId: safeFile.gridFsId,
      });
      const catalogue = await appRouter
        .createCaller(context(null))
        .catalogue({});
      expect(catalogue).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            legacyId: safePaper.legacyId,
            title: `${runId}-safe-paper`,
            isAvailable: true,
            accessMode: "free",
          }),
        ])
      );

      const held = await caller.student.submitPaper({
        title: `${runId}-held-paper`,
        course: "ScholarShelf Studies",
        level: "university",
        cycle: "June 2026",
        unit: "Communication Skills",
        paperType: "Theory",
        description: "Held office document",
        fileId: heldFile.gridFsId,
        authorized: true,
      });
      expect(held.publication.status).toBe("held_for_review");
      expect(held.submission.status).toBe("pending");
      expect(held.submission.safetyStatus).toBe("held");
      expect(
        await db.collection("papers").findOne({
          submissionId: held.submission.legacyId,
        })
      ).toBeNull();

      const suspicious = await caller.student.submitPaper({
        title: `${runId}-suspicious-paper`,
        course: "ScholarShelf Studies",
        level: "university",
        cycle: "June 2026",
        unit: "Communication Skills",
        paperType: "Theory",
        description: "Held active-content PDF",
        fileId: suspiciousFile.gridFsId,
        authorized: true,
      });
      expect(suspicious.publication.status).toBe("held_for_review");
      expect(suspicious.submission.safetyReasons).toContain(
        "The PDF contains an active-content marker and was held for review."
      );

      const rejected = await appRouter
        .createCaller(context(user(adminId, "admin")))
        .admin.reviewSubmission({
          submissionId: held.submission.legacyId,
          status: "rejected",
          reviewNote: "Unsafe format for automatic publication",
        });
      expect(rejected).toMatchObject({ success: true, storagePurged: true });
      expect(await portalFileById(heldFile.gridFsId)).toBeNull();
      expect(
        await (await portalFiles())
          .find({ _id: new ObjectId(heldFile.gridFsId) })
          .hasNext()
      ).toBe(false);
      expect(
        await db.collection<any>("submissions").findOne({
          legacyId: held.submission.legacyId,
        })
      ).toMatchObject({ status: "rejected", storagePurged: true });
    } finally {
      await db
        .collection("papers")
        .deleteMany({ title: { $regex: `^${runId}` } });
      await db
        .collection("submissions")
        .deleteMany({ title: { $regex: `^${runId}` } });
      for (const file of [safeFile, heldFile, suspiciousFile]) {
        if (await portalFileById(file.gridFsId)) {
          await db
            .collection("file_metadata")
            .updateOne(
              { gridFsId: file.gridFsId },
              { $set: { references: [] } }
            );
          await deletePortalFile({ fileId: file.gridFsId, actorId: adminId });
        }
      }
      await db
        .collection("operational_records")
        .deleteMany({ subjectId: { $regex: `^${runId}` } });
    }
  }, 90_000);

  it("publishes an approved submission as a free paper and records rejection outcomes", async () => {
    const db = await mongo();
    const approvedId = studentA + 20;
    const rejectedId = studentA + 21;
    const rejectedFile = await uploadPortalFile({
      ownerId: studentB,
      purpose: "submission",
      fileName: `${runId}-rejected.pdf`,
      mimeType: "application/pdf",
      bytes: Buffer.from("%PDF-1.4\\nrejected-submission"),
    });
    const approvedFile = await uploadPortalFile({
      ownerId: studentA,
      purpose: "submission",
      fileName: `${runId}-approved.pdf`,
      mimeType: "application/pdf",
      bytes: Buffer.from("%PDF-1.4\nsubmission-test"),
    });
    await db.collection("submissions").insertMany([
      {
        _id: new ObjectId(),
        legacyId: approvedId,
        userId: studentA,
        title: `${runId}-approve`,
        course: "CDACC",
        level: "university",
        cycle: "June 2026",
        unit: "Communication Skills",
        paperType: "Theory",
        description: "Approved test paper",
        fileId: approvedFile.gridFsId,
        fileName: approvedFile.fileName,
        mimeType: approvedFile.mimeType,
        status: "pending",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        _id: new ObjectId(),
        legacyId: rejectedId,
        userId: studentB,
        title: `${runId}-reject`,
        course: "CDACC",
        level: "university",
        cycle: "June 2026",
        unit: "Communication Skills",
        paperType: "Theory",
        description: "Rejected test paper",
        fileId: rejectedFile.gridFsId,
        fileName: rejectedFile.fileName,
        mimeType: rejectedFile.mimeType,
        status: "pending",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    try {
      const caller = appRouter.createCaller(context(user(adminId, "admin")));
      const approved = await caller.admin.reviewSubmission({
        submissionId: approvedId,
        status: "approved",
        reviewNote: "Ready for learners",
      });
      expect(approved.success).toBe(true);
      const approval = await db
        .collection<any>("submissions")
        .findOne({ legacyId: approvedId });
      const published = await db
        .collection<any>("papers")
        .findOne({ legacyId: approved.paperId });
      expect(approval?.status).toBe("approved");
      expect(approval?.reviewNote).toBe("Ready for learners");
      expect(published).toMatchObject({
        title: `${runId}-approve`,
        priceKes: 0,
        accessMode: "free",
        isAvailable: true,
        submittedBy: studentA,
        level: "university",
      });

      const approvedAgain = await caller.admin.reviewSubmission({
        submissionId: approvedId,
        status: "approved",
        reviewNote: "Duplicate approval request",
      });
      expect(approvedAgain).toEqual({
        success: true,
        paperId: approved.paperId,
      });
      expect(
        await db.collection("papers").countDocuments({
          title: `${runId}-approve`,
        })
      ).toBe(1);

      const rejected = await caller.admin.reviewSubmission({
        submissionId: rejectedId,
        status: "rejected",
        reviewNote: "Needs source confirmation",
      });
      expect(rejected).toMatchObject({ success: true, storagePurged: true });
      expect(await portalFileById(rejectedFile.gridFsId)).toBeNull();
      const rejection = await db
        .collection<any>("submissions")
        .findOne({ legacyId: rejectedId });
      expect(rejection).toMatchObject({
        status: "rejected",
        reviewNote: "Needs source confirmation",
        reviewedBy: adminId,
      });
    } finally {
      const published = await db
        .collection<any>("papers")
        .findOne({ submittedBy: studentA, title: `${runId}-approve` });
      await db
        .collection("papers")
        .deleteMany({ title: { $regex: `^${runId}` } });
      await db
        .collection("submissions")
        .deleteMany({ title: { $regex: `^${runId}` } });
      if (published)
        await db.collection("papers").deleteOne({ _id: published._id });
      for (const file of [approvedFile, rejectedFile]) {
        if (await portalFileById(file.gridFsId)) {
          await db
            .collection("file_metadata")
            .updateOne(
              { gridFsId: file.gridFsId },
              { $set: { references: [] } }
            );
          await deletePortalFile({ fileId: file.gridFsId, actorId: adminId });
        }
      }
      await db
        .collection("operational_records")
        .deleteMany({ subjectId: approvedFile.gridFsId });
    }
  }, 90_000);
});
