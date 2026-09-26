import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = (file: string) => readFileSync(resolve(process.cwd(), file), "utf8");

describe("administrator role management", () => {
  const router = source("server/routers.ts");
  const ui = source("client/src/pages/AdminOperations.tsx");
  const auth = source("server/_core/trpc.ts");

  it("keeps role mutation administrator-only and validates the target", () => {
    expect(router).toMatch(/setUserRole:\s*adminProcedure/);
    expect(router).toContain('role: z.enum(["user", "admin"])');
    expect(router).toContain('message: "User not found."');
    expect(router).toContain("ctx.user.id === input.userId");
    expect(router).toContain("OWNER_OPEN_ID");
    expect(router).toContain("adminCount <= 1");
    expect(router).toContain("At least one administrator account must remain.");
    expect(auth).toContain('ctx.user.role !== "admin"');
  });

  it("shows all users with search, role filters, and explicit role choices", () => {
    expect(ui).toContain("Search users for role management");
    expect(ui).toContain("Filter users by role");
    expect(ui).toContain("Administrators");
    expect(ui).toContain("setRole.mutate");
    expect(ui).toContain('value="admin">Administrator</option>');
    expect(ui).not.toContain("users.data?.slice(0, 6)");
    expect(ui).toContain("owner account");
  });
});
