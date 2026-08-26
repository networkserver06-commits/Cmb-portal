import { describe, expect, it } from "vitest";
import { ObjectId } from "mongodb";
import { appRouter } from "./routers";
import { mongo } from "./mongoStore";
import { deletePortalFile, uploadPortalFile } from "./fileStore";
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
  }, 45_000);

  it("publishes an approved submission as a free paper and records rejection outcomes", async () => {
    const db = await mongo();
    const approvedId = studentA + 20;
    const rejectedId = studentA + 21;
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
        fileName: "rejected.pdf",
        mimeType: "application/pdf",
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

      const rejected = await caller.admin.reviewSubmission({
        submissionId: rejectedId,
        status: "rejected",
        reviewNote: "Needs source confirmation",
      });
      expect(rejected.success).toBe(true);
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
      await db
        .collection("file_metadata")
        .updateOne(
          { gridFsId: approvedFile.gridFsId },
          { $set: { references: [] } }
        );
      await deletePortalFile({
        fileId: approvedFile.gridFsId,
        actorId: adminId,
      });
      await db
        .collection("operational_records")
        .deleteMany({ subjectId: approvedFile.gridFsId });
    }
  }, 45_000);
});
