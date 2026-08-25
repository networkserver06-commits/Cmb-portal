import { ObjectId } from "mongodb";
import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import { mongo } from "./mongoStore";
import type { TrpcContext } from "./_core/context";

const runId = `student-profile-${Date.now()}`;
const studentId = 930000 + Math.floor(Math.random() * 1000);

function context(user: TrpcContext["user"]): TrpcContext {
  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

const student = {
  id: studentId,
  openId: `${runId}-open-id`,
  name: "Original Student",
  email: `${runId}@example.com`,
  loginMethod: "password",
  role: "user" as const,
  createdAt: new Date(),
  updatedAt: new Date(),
  lastSignedIn: new Date(),
};

describe("student profile and activity procedures", () => {
  it("updates only the authenticated profile and returns only that student’s protected activity", async () => {
    const db = await mongo();
    await db.collection("users").insertOne({
      _id: new ObjectId(),
      legacyId: studentId,
      openId: student.openId,
      name: student.name,
      email: student.email,
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    });
    await db.collection("operational_records").insertMany([
      {
        _id: new ObjectId(),
        eventType: "submission.created",
        actorId: studentId,
        subjectType: "submission",
        subjectId: `${runId}-mine`,
        createdAt: new Date(),
      },
      {
        _id: new ObjectId(),
        eventType: "submission.created",
        actorId: studentId + 1,
        subjectType: "submission",
        subjectId: `${runId}-other`,
        createdAt: new Date(),
      },
    ]);
    try {
      const caller = appRouter.createCaller(context(student));
      const result = await caller.student.updateProfile({
        name: "Updated Student",
      });
      expect(result).toEqual({ success: true, name: "Updated Student" });
      expect(
        await db.collection("users").findOne({ legacyId: studentId })
      ).toMatchObject({ name: "Updated Student" });
      const activity = await caller.student.activity();
      expect(activity.every(record => record.actorId === studentId)).toBe(true);
      expect(
        activity.some(record => record.eventType === "profile.updated")
      ).toBe(true);
      expect(
        activity.some(record => record.subjectId === `${runId}-other`)
      ).toBe(false);
    } finally {
      await db.collection("users").deleteMany({ legacyId: studentId });
      await db.collection("operational_records").deleteMany({
        $or: [{ actorId: studentId }, { subjectId: `${runId}-other` }],
      });
    }
  }, 45_000);

  it("rejects profile changes without an authenticated user", async () => {
    const caller = appRouter.createCaller(context(null));
    await expect(
      caller.student.updateProfile({ name: "Unauthenticated" })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});
