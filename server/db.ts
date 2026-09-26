import { asUser, mongo, nextId } from "./mongoStore";
import type { InsertUser, User } from "../drizzle/schema";
import { ENV } from "./_core/env";

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const users = (await mongo()).collection("users");
  const now = new Date();
  const set: Record<string, unknown> = {
    name: user.name ?? null,
    email: user.email ?? null,
    loginMethod: user.loginMethod ?? null,
    updatedAt: now,
    lastSignedIn: user.lastSignedIn ?? now,
  };
  if (user.username !== undefined) set.username = user.username ?? null;
  const isPrimaryAdmin =
    Boolean(ENV.ownerOpenId) && user.openId === ENV.ownerOpenId;
  if (isPrimaryAdmin) {
    set.role = "admin";
    set.isPrimaryAdmin = true;
  } else if (user.role) {
    set.role = user.role;
  }
  await users.updateOne(
    { openId: user.openId },
    {
      $set: set,
      $setOnInsert: {
        legacyId: await nextId("users"),
        openId: user.openId,
        createdAt: user.createdAt ?? now,
        role: isPrimaryAdmin ? "admin" : "user",
        isPrimaryAdmin,
      },
    },
    { upsert: true }
  );
}

export async function getUserByOpenId(
  openId: string
): Promise<User | undefined> {
  if (!openId) return undefined;
  const record = await (await mongo()).collection("users").findOne({ openId });
  return record ? asUser(record as any) : undefined;
}

export async function getUserById(id: number): Promise<User | undefined> {
  const record = await (await mongo())
    .collection("users")
    .findOne({ legacyId: id });
  return record ? asUser(record as any) : undefined;
}
