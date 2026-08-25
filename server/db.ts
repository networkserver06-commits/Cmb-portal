import { asUser, mongo, nextId } from "./mongoStore";
import type { InsertUser, User } from "../drizzle/schema";

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const users = (await mongo()).collection("users");
  const now = new Date();
  await users.updateOne(
    { openId: user.openId },
    {
      $set: {
        name: user.name ?? null,
        email: user.email ?? null,
        loginMethod: user.loginMethod ?? null,
        role:
          user.role ??
          (user.openId === process.env.OWNER_OPEN_ID ? "admin" : "user"),
        updatedAt: now,
        lastSignedIn: user.lastSignedIn ?? now,
      },
      $setOnInsert: {
        legacyId: await nextId("users"),
        openId: user.openId,
        createdAt: user.createdAt ?? now,
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
