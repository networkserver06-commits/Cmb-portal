import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function context(user: TrpcContext["user"]): TrpcContext {
  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("paper submission access controls", () => {
  it("requires an authenticated student to submit a paper", async () => {
    const caller = appRouter.createCaller(context(null));
    await expect(caller.student.submissions()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("prevents a regular student from moderating submissions", async () => {
    const caller = appRouter.createCaller(
      context({
        id: 9,
        openId: "student",
        name: "Student",
        email: "student@example.com",
        loginMethod: "password",
        role: "user",
        createdAt: new Date(),
        updatedAt: new Date(),
        lastSignedIn: new Date(),
      })
    );
    await expect(caller.admin.listSubmissions()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});
