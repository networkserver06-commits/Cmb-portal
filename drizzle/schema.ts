import {
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
  decimal,
  boolean,
  index,
  uniqueIndex,
} from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  phone: varchar("phone", { length: 32 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const papers = mysqlTable(
  "papers",
  {
    id: int("id").autoincrement().primaryKey(),
    course: varchar("course", { length: 160 }).notNull(),
    level: varchar("level", { length: 80 }).notNull(),
    cycle: varchar("cycle", { length: 80 }).notNull(),
    unit: varchar("unit", { length: 160 }).notNull(),
    paperType: varchar("paperType", { length: 80 }).notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    description: text("description"),
    priceKes: decimal("priceKes", { precision: 10, scale: 2 }).notNull(),
    isAvailable: boolean("isAvailable").default(true).notNull(),
    isFeatured: boolean("isFeatured").default(false).notNull(),
    accessMode: mysqlEnum("accessMode", ["purchase", "manual", "disabled"])
      .default("purchase")
      .notNull(),
    fileKey: varchar("fileKey", { length: 512 }),
    fileName: varchar("fileName", { length: 255 }),
    fileMimeType: varchar("fileMimeType", { length: 120 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({
    catalogIdx: index("papers_catalog_idx").on(
      table.course,
      table.level,
      table.cycle,
      table.unit
    ),
  })
);

export const orders = mysqlTable(
  "orders",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull(),
    paperId: int("paperId").notNull(),
    reference: varchar("reference", { length: 120 }).notNull().unique(),
    amountKes: decimal("amountKes", { precision: 10, scale: 2 }).notNull(),
    status: mysqlEnum("status", ["pending", "paid", "failed", "cancelled"])
      .default("pending")
      .notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    paidAt: timestamp("paidAt"),
  },
  table => ({
    userIdx: index("orders_user_idx").on(table.userId),
  })
);

export const payments = mysqlTable(
  "payments",
  {
    id: int("id").autoincrement().primaryKey(),
    orderId: int("orderId").notNull(),
    userId: int("userId").notNull(),
    provider: varchar("provider", { length: 40 }).default("paystack").notNull(),
    providerReference: varchar("providerReference", { length: 120 })
      .notNull()
      .unique(),
    channel: varchar("channel", { length: 80 }),
    amountKes: decimal("amountKes", { precision: 10, scale: 2 }).notNull(),
    status: varchar("status", { length: 40 }).notNull(),
    rawEvent: text("rawEvent"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => ({
    orderIdx: uniqueIndex("payments_order_idx").on(table.orderId),
  })
);

export const entitlements = mysqlTable(
  "entitlements",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull(),
    paperId: int("paperId").notNull(),
    orderId: int("orderId"),
    source: mysqlEnum("source", ["purchase", "manual"])
      .default("purchase")
      .notNull(),
    grantedAt: timestamp("grantedAt").defaultNow().notNull(),
  },
  table => ({
    uniqueAccess: uniqueIndex("entitlements_user_paper_idx").on(
      table.userId,
      table.paperId
    ),
  })
);

export const downloads = mysqlTable("downloads", {
  id: int("id").autoincrement().primaryKey(),
  entitlementId: int("entitlementId").notNull(),
  userId: int("userId").notNull(),
  paperId: int("paperId").notNull(),
  ipAddress: varchar("ipAddress", { length: 64 }),
  userAgent: text("userAgent"),
  downloadedAt: timestamp("downloadedAt").defaultNow().notNull(),
});

export const announcements = mysqlTable("announcements", {
  id: int("id").autoincrement().primaryKey(),
  title: varchar("title", { length: 180 }).notNull(),
  message: text("message").notNull(),
  severity: mysqlEnum("severity", ["info", "warning", "emergency"])
    .default("info")
    .notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  startsAt: timestamp("startsAt").defaultNow().notNull(),
  endsAt: timestamp("endsAt"),
  createdBy: int("createdBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const activityLogs = mysqlTable("activityLogs", {
  id: int("id").autoincrement().primaryKey(),
  actorId: int("actorId"),
  action: varchar("action", { length: 120 }).notNull(),
  entityType: varchar("entityType", { length: 80 }),
  entityId: int("entityId"),
  metadata: text("metadata"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Paper = typeof papers.$inferSelect;
export type Order = typeof orders.$inferSelect;
