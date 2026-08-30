import { z } from "zod";
import { parse } from "cookie";
import { COOKIE_NAME } from "../shared/const";
import {
  EDUCATION_LEVELS,
  normalizeEducationLevel,
} from "../shared/educationLevels";
import { RESOURCE_TYPES } from "../shared/resourceTypes";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import {
  adminProcedure,
  protectedProcedure,
  publicProcedure,
  router,
} from "./_core/trpc";
import {
  ACCOUNT_COOKIE,
  createAccount,
  loginAccount,
  logoutAccount,
  requestEmailVerification,
  requestPasswordReset,
  resetAccountPassword,
  validatePasswordResetToken,
  verifyEmailToken,
  publicPortalUrl,
} from "./mongoAuth";
import {
  mongo,
  nextId,
  paperById,
  orderByReference,
  entitlementFor,
  walletForUser,
  walletSummaryForAdmin,
  walletTopUpByReference,
  walletTopUpPaymentMatches,
  fulfillWalletTopUp,
  recordOperationalEvent,
} from "./mongoStore";
import { getUserById } from "./db";
import {
  claimPortalFile,
  deletePortalFile,
  linkPortalFile,
  listPortalFiles,
  portalFileById,
  purgeRejectedPortalFile,
  unlinkPortalFile,
} from "./fileStore";
import { detectSubmissionSafety } from "./submissionSafety";
import {
  auditStorage,
  cleanupStorage,
  STORAGE_CLEANUP_CONFIRMATION,
} from "./storageManagement";
import {
  createPaymentReference,
  createWalletTopUpReference,
  fulfillSuccessfulPayment,
  getPaystackReadiness,
  initializePaystackCheckout,
  paymentMatchesOrder,
  verifyPaystackTransaction,
} from "./paystack";

const educationLevelInput = z.enum(EDUCATION_LEVELS);
const resourceTypeInput = z.enum(RESOURCE_TYPES).default("examination-paper");

const paperInput = z
  .object({
    course: z.string().min(2, "Add the subject, course, or collection name."),
    level: educationLevelInput,
    cycle: z.string().min(1, "Add a year, term, or cycle label."),
    unit: z.string().min(2, "Add the unit, topic, or document section."),
    paperType: z.string().min(2, "Add a short format or document label."),
    documentType: resourceTypeInput,
    title: z.string().min(2, "Add a document title."),
    description: z.string().optional(),
    priceKes: z.number().min(0),
    fileId: z.string().optional(),
    mode: z.enum(["free", "paid"]).default("paid"),
  })
  .superRefine((input, ctx) => {
    if (input.mode === "paid" && input.priceKes <= 0)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["priceKes"],
        message: "Paid resources must have a price greater than zero.",
      });
    if (input.mode === "free" && input.priceKes !== 0)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["priceKes"],
        message: "Free resources must have a zero price.",
      });
  });
async function publishSubmissionAsPaper(
  db: any,
  submission: any,
  actorId: number,
  publicationMode: "automatic" | "admin_review"
) {
  const existing = await db.collection("papers").findOne({
    submissionId: submission.legacyId,
  });
  if (existing) return existing;

  const now = new Date();
  const paper = {
    _id: new (await import("mongodb")).ObjectId(),
    legacyId: await nextId("papers"),
    submissionId: submission.legacyId,
    course: submission.course,
    level: normalizeEducationLevel(submission.level),
    cycle: submission.cycle,
    unit: submission.unit,
    paperType: submission.paperType,
    documentType: submission.documentType ?? "examination-paper",
    title: submission.title,
    description: submission.description ?? "",
    priceKes: 0,
    fileId: submission.fileId,
    fileName: submission.fileName,
    fileMimeType: submission.mimeType,
    isAvailable: true,
    accessMode: "free",
    createdAt: now,
    updatedAt: now,
    publishedBy: actorId,
    submittedBy: submission.userId,
    publicationMode,
  };
  await db.collection("papers").insertOne(paper);
  if (submission.fileId)
    await linkPortalFile({
      fileId: submission.fileId,
      actorId,
      entityType: "paper",
      entityId: paper.legacyId,
    });
  return paper;
}

const postInput = z
  .object({
    title: z.string().min(2, "Add a document title.").max(180),
    course: z.string().min(2, "Add the subject, course, or collection name.").max(100),
    level: educationLevelInput,
    cycle: z.string().min(1, "Add a year, term, or cycle label.").max(60),
    unit: z.string().min(2, "Add the unit, topic, or document section.").max(120),
    paperType: z.string().min(2, "Add a short format or document label.").max(80),
    documentType: resourceTypeInput,
    description: z.string().max(2000).optional(),
    fileId: z.string().min(12).max(80),
    mode: z.enum(["free", "paid"]),
    priceKes: z.number().min(0),
  })
  .superRefine((input, ctx) => {
    if (input.mode === "paid" && input.priceKes <= 0)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["priceKes"],
        message: "Paid posts must have a price greater than zero.",
      });
    if (input.mode === "free" && input.priceKes !== 0)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["priceKes"],
        message: "Free posts must have a zero price.",
      });
  });

export async function reconcileWalletTopUp(userId: number, reference: string) {
  const db = await mongo();
  const topUp = await walletTopUpByReference(userId, reference);
  if (!topUp || topUp.status !== "pending") return topUp;
  try {
    const verified = await verifyPaystackTransaction(reference);
    const data = verified.data;
    if (
      verified.status &&
      data?.status === "success" &&
      walletTopUpPaymentMatches(
        {
          reference: data.reference,
          amount: data.amount,
          currency: data.currency,
        },
        reference,
        topUp.amountKes
      )
    ) {
      await fulfillWalletTopUp(reference, data);
    } else if (
      ["failed", "abandoned", "cancelled"].includes(data?.status ?? "")
    ) {
      await db
        .collection("wallet_topups")
        .updateOne(
          { _id: topUp._id, status: "pending" },
          { $set: { status: "failed", updatedAt: new Date() } }
        );
    }
  } catch {
    /* Keep pending for a transient provider or database error. */
  }
  return await walletTopUpByReference(userId, reference);
}

async function reconcilePendingWalletTopUps(userId: number) {
  const wallet = await walletForUser(userId);
  const pending = wallet.transactions
    .filter(topUp => topUp.status === "pending")
    .slice(0, 10);
  await Promise.allSettled(
    pending.map(topUp => reconcileWalletTopUp(userId, topUp.reference))
  );
  return await walletForUser(userId);
}

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(async ({ ctx }) => {
      const options = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...options, maxAge: -1 });
      await logoutAccount(
        parse(ctx.req.headers.cookie ?? "")[ACCOUNT_COOKIE],
        ctx.req,
        ctx.res
      );
      return { success: true } as const;
    }),
    createAccount: publicProcedure
      .input(
        z.object({
          name: z.string().min(2),
          email: z.string().email(),
          password: z.string().min(8),
        })
      )
      .mutation(({ ctx, input }) =>
        createAccount(input.email, input.password, input.name, ctx.req, ctx.res)
      ),
    requestEmailVerification: publicProcedure
      .input(z.object({ email: z.string().email() }))
      .mutation(({ input }) => requestEmailVerification(input.email)),
    verifyEmail: publicProcedure
      .input(z.object({ token: z.string().min(20) }))
      .mutation(({ input }) => verifyEmailToken(input.token)),
    login: publicProcedure
      .input(
        z.object({ email: z.string().email(), password: z.string().min(1) })
      )
      .mutation(({ ctx, input }) =>
        loginAccount(input.email, input.password, ctx.req, ctx.res)
      ),
    requestPasswordReset: publicProcedure
      .input(z.object({ email: z.string().email() }))
      .mutation(async ({ input }) => {
        const result = await requestPasswordReset(input.email);
        return {
          success: true as const,
          previewResetUrl: result.previewToken
            ? `/reset-password?token=${encodeURIComponent(result.previewToken)}`
            : undefined,
        };
      }),
    resetPasswordTokenValid: publicProcedure
      .input(z.object({ token: z.string().min(20) }))
      .query(({ input }) => validatePasswordResetToken(input.token)),
    resetPassword: publicProcedure
      .input(
        z.object({ token: z.string().min(20), password: z.string().min(8) })
      )
      .mutation(({ input }) =>
        resetAccountPassword(input.token, input.password)
      ),
  }),
  catalogue: publicProcedure
    .input(
      z
        .object({
          search: z.string().optional(),
          level: educationLevelInput.optional(),
          documentType: z.enum(RESOURCE_TYPES).optional(),
        })
        .optional()
    )
    .query(async ({ input }) => {
      const rows = await (await mongo())
        .collection("papers")
        .find({ isAvailable: true })
        .sort({ createdAt: -1 })
        .toArray();
      const search = input?.search?.trim().toLowerCase();
      const level = input?.level;
      const documentType = input?.documentType;
      return rows.filter((p: any) => {
        const matchesLevel =
          !level || normalizeEducationLevel(String(p.level)) === level;
        const matchesDocumentType =
          !documentType || (p.documentType ?? "examination-paper") === documentType;
        const matchesSearch =
          !search ||
          [p.title, p.course, p.unit, p.level, p.cycle, p.paperType, p.description, p.documentType].some(v =>
            String(v ?? "").toLowerCase().includes(search)
          );
        return matchesLevel && matchesDocumentType && matchesSearch;
      });
    }),
  announcements: publicProcedure.query(
    async () =>
      await (await mongo())
        .collection("announcements")
        .find({ isActive: true })
        .sort({ createdAt: -1 })
        .toArray()
  ),
  analytics: router({
    recordVisit: publicProcedure
      .input(
        z.object({
          sessionId: z.string().min(16).max(80),
          path: z.string().min(1).max(180),
          screen: z.string().max(32).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const userAgent = String(
          ctx.req.headers["user-agent"] ?? ""
        ).toLowerCase();
        const device = /ipad|tablet/.test(userAgent)
          ? "tablet"
          : /mobile|android|iphone/.test(userAgent)
            ? "mobile"
            : "desktop";
        await (await mongo()).collection("analytics_events").insertOne({
          type: "pageview",
          sessionId: input.sessionId,
          path: input.path,
          screen: input.screen ?? "unknown",
          device,
          createdAt: new Date(),
        });
        return { success: true } as const;
      }),
  }),
  student: router({
    library: protectedProcedure.query(async ({ ctx }) => {
      const ents = await (await mongo())
        .collection<any>("entitlements")
        .find({ userId: ctx.user.id })
        .sort({ grantedAt: -1 })
        .toArray();
      return Promise.all(
        ents.map(async entitlement => ({
          paper: await paperById(entitlement.paperId),
          entitlement,
        }))
      );
    }),
    orders: protectedProcedure.query(async ({ ctx }) => {
      const rows = await (await mongo())
        .collection<any>("orders")
        .find({ userId: ctx.user.id })
        .sort({ createdAt: -1 })
        .toArray();
      return Promise.all(
        rows.map(async order => ({
          order,
          paper: await paperById(order.paperId),
        }))
      );
    }),
    submissions: protectedProcedure.query(
      async ({ ctx }) =>
        await (await mongo())
          .collection("submissions")
          .find({ userId: ctx.user.id })
          .sort({ createdAt: -1 })
          .toArray()
    ),
    wallet: protectedProcedure.query(({ ctx }) =>
      reconcilePendingWalletTopUps(ctx.user.id)
    ),
    updateProfile: protectedProcedure
      .input(z.object({ name: z.string().trim().min(2).max(120) }))
      .mutation(async ({ ctx, input }) => {
        const name = input.name.trim();
        const result = await (await mongo())
          .collection("users")
          .updateOne(
            { legacyId: ctx.user.id },
            { $set: { name, updatedAt: new Date() } }
          );
        if (!result.matchedCount)
          throw new Error("Your profile could not be found.");
        await recordOperationalEvent({
          eventType: "profile.updated",
          actorId: ctx.user.id,
          subjectType: "user",
          subjectId: String(ctx.user.id),
          detail: { field: "name" },
        });
        return { success: true as const, name };
      }),
    submitPaper: protectedProcedure
      .input(
        z.object({
          title: z.string().min(2, "Add a document title."),
          course: z.string().min(2, "Add the subject, course, or collection name."),
          level: educationLevelInput,
          cycle: z.string().min(1, "Add a year, term, or cycle label."),
          unit: z.string().min(2, "Add the unit, topic, or document section."),
          paperType: z.string().min(2, "Add a short format or document label."),
          documentType: resourceTypeInput,
          description: z.string().max(1000).optional(),
          fileId: z.string().min(12).max(80),
          authorized: z.literal(true),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const file = await claimPortalFile({
          fileId: input.fileId,
          actorId: ctx.user.id,
          purpose: "submission",
        });
        const safety = await detectSubmissionSafety(file);
        const automaticallyPublished = safety.decision === "auto_publish";
        const now = new Date();
        const db = await mongo();
        const submission = {
          _id: new (await import("mongodb")).ObjectId(),
          legacyId: await nextId("submissions"),
          userId: ctx.user.id,
          title: input.title,
          course: input.course,
          level: input.level,
          cycle: input.cycle,
          unit: input.unit,
          paperType: input.paperType,
          documentType: input.documentType,
          description: input.description,
          fileId: file.gridFsId,
          fileName: file.fileName,
          mimeType: file.mimeType,
          status: automaticallyPublished
            ? ("approved" as const)
            : ("pending" as const),
          safetyStatus: automaticallyPublished ? "passed" : "held",
          safetyReasons: safety.reasons,
          approvalMode: automaticallyPublished ? "automatic" : "admin_review",
          reviewNote: automaticallyPublished
            ? "Automatically approved by the ScholarShelf safety detector."
            : "Held for administrator review by the ScholarShelf safety detector.",
          createdAt: now,
          updatedAt: now,
        };
        await db.collection("submissions").insertOne(submission);
        await linkPortalFile({
          fileId: file.gridFsId,
          actorId: ctx.user.id,
          entityType: "submission",
          entityId: submission.legacyId,
        });

        let paperId: number | undefined;
        if (automaticallyPublished) {
          const paper = await publishSubmissionAsPaper(
            db,
            submission,
            ctx.user.id,
            "automatic"
          );
          paperId = paper.legacyId;
          await db.collection("submissions").updateOne(
            { _id: submission._id },
            {
              $set: {
                paperId,
                reviewedBy: ctx.user.id,
                reviewedAt: now,
                updatedAt: new Date(),
              },
            }
          );
          await recordOperationalEvent({
            eventType: "submission.auto_published",
            actorId: ctx.user.id,
            subjectType: "submission",
            subjectId: String(submission.legacyId),
            detail: { paperId, detector: "passed" },
          });
        } else {
          await recordOperationalEvent({
            eventType: "submission.held_for_review",
            actorId: ctx.user.id,
            subjectType: "submission",
            subjectId: String(submission.legacyId),
            detail: { reasons: safety.reasons },
          });
        }

        return {
          success: true,
          submission: { ...submission, paperId },
          publication: {
            status: automaticallyPublished ? "published" : "held_for_review",
            reasons: safety.reasons,
          },
        };
      }),
    activity: protectedProcedure.query(
      async ({ ctx }) =>
        await (await mongo())
          .collection("operational_records")
          .find({ actorId: ctx.user.id })
          .sort({ createdAt: -1 })
          .limit(30)
          .toArray()
    ),
    paymentResult: protectedProcedure
      .input(z.object({ reference: z.string().min(8) }))
      .query(async ({ ctx, input }) => {
        const order = await orderByReference(ctx.user.id, input.reference);
        if (!order) return null;
        const paper = await paperById(order.paperId);
        const entitlement = await entitlementFor(ctx.user.id, order.paperId);
        return { order, paper, unlocked: Boolean(entitlement) };
      }),
    paymentStatus: protectedProcedure
      .input(z.object({ reference: z.string().min(8) }))
      .query(async ({ ctx, input }) => {
        const db = await mongo();
        const order = await orderByReference(ctx.user.id, input.reference);
        if (!order) return { status: "pending" as const };
        if (order.status === "pending") {
          try {
            const verified = await verifyPaystackTransaction(input.reference);
            const data = verified.data;
            if (data?.status === "success") {
              if (
                !paymentMatchesOrder(
                  {
                    reference: data.reference,
                    amount: data.amount,
                    currency: data.currency,
                  },
                  input.reference,
                  order.amountKes
                )
              ) {
                await db
                  .collection("orders")
                  .updateOne(
                    { _id: order._id, status: "pending" },
                    { $set: { status: "failed" } }
                  );
              } else {
                await fulfillSuccessfulPayment(
                  input.reference,
                  data,
                  JSON.stringify(verified)
                );
              }
            } else if (
              ["failed", "abandoned", "cancelled"].includes(data?.status ?? "")
            ) {
              await db
                .collection("orders")
                .updateOne(
                  { _id: order._id, status: "pending" },
                  { $set: { status: "failed" } }
                );
            }
          } catch {
            // Keep the order pending for transient provider/database errors; the next poll or webhook can complete it.
          }
        }
        return {
          status:
            (await orderByReference(ctx.user.id, input.reference))?.status ??
            "pending",
        };
      }),
    claimFreePaper: protectedProcedure
      .input(z.object({ paperId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        const db = await mongo();
        const paper = await paperById(input.paperId);
        if (
          !paper?.isAvailable ||
          paper.accessMode !== "free" ||
          Number(paper.priceKes) !== 0
        )
          throw new Error("This paper is not available as a free post");
        const existing = await entitlementFor(ctx.user.id, input.paperId);
        if (!existing)
          await db.collection("entitlements").insertOne({
            _id: new (await import("mongodb")).ObjectId(),
            legacyId: await nextId("entitlements"),
            userId: ctx.user.id,
            paperId: input.paperId,
            source: "free",
            grantedAt: new Date(),
          });
        return { success: true as const, paperId: input.paperId };
      }),
    initializePayment: protectedProcedure
      .input(z.object({ paperId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        const paper = await paperById(input.paperId);
        if (!paper?.isAvailable || paper.accessMode === "free")
          throw new Error("This paper is free and does not require payment");
        const reference = createPaymentReference(paper.legacyId, ctx.user.id);
        const callbackUrl = publicPortalUrl(
          `/payment-result?reference=${encodeURIComponent(reference)}`
        );
        const order = {
          _id: new (await import("mongodb")).ObjectId(),
          legacyId: await nextId("orders"),
          userId: ctx.user.id,
          paperId: paper.legacyId,
          reference,
          amountKes: Number(paper.priceKes),
          status: "pending" as const,
          createdAt: new Date(),
        };
        const db = await mongo();
        await db.collection("orders").insertOne(order);
        try {
          const checkout = await initializePaystackCheckout({
            email: ctx.user.email ?? `${ctx.user.openId}@student.local`,
            amountKes: order.amountKes,
            reference,
            callbackUrl,
          });
          return { reference, authorizationUrl: checkout.authorizationUrl };
        } catch (error) {
          await db
            .collection("orders")
            .updateOne(
              { _id: order._id, status: "pending" },
              { $set: { status: "failed" } }
            );
          throw error;
        }
      }),
    initializeWalletTopUp: protectedProcedure
      .input(z.object({ amountKes: z.number().int().min(10).max(150000) }))
      .mutation(async ({ ctx, input }) => {
        const reference = createWalletTopUpReference(ctx.user.id);
        const callbackUrl = publicPortalUrl(
          `/account?wallet_reference=${encodeURIComponent(reference)}`
        );
        const now = new Date();
        const topUp = {
          _id: new (await import("mongodb")).ObjectId(),
          legacyId: await nextId("wallet_topups"),
          userId: ctx.user.id,
          reference,
          amountKes: input.amountKes,
          status: "pending" as const,
          createdAt: now,
          updatedAt: now,
        };
        await (await mongo()).collection("wallet_topups").insertOne(topUp);
        try {
          const checkout = await initializePaystackCheckout({
            email: ctx.user.email ?? `${ctx.user.openId}@student.local`,
            amountKes: input.amountKes,
            reference,
            callbackUrl,
          });
          return { reference, authorizationUrl: checkout.authorizationUrl };
        } catch (error) {
          await (await mongo())
            .collection("wallet_topups")
            .updateOne(
              { _id: topUp._id, status: "pending" },
              { $set: { status: "failed", updatedAt: new Date() } }
            );
          throw error;
        }
      }),
    walletTopUpStatus: protectedProcedure
      .input(
        z.object({
          reference: z.string().regex(/^WALLET-\\d+-\\d+-[A-Za-z0-9]+$/),
        })
      )
      .query(({ ctx, input }) =>
        reconcileWalletTopUp(ctx.user.id, input.reference)
      ),
  }),
  admin: router({
    summary: adminProcedure.query(async () => {
      const db = await mongo();
      const [papers, orders, paid] = await Promise.all([
        db.collection("papers").countDocuments(),
        db.collection("orders").countDocuments(),
        db.collection("orders").find({ status: "paid" }).toArray(),
      ]);
      return {
        papers,
        orders,
        paidOrders: paid.length,
        revenueKes: paid.reduce(
          (sum: number, row: any) => sum + Number(row.amountKes),
          0
        ),
      };
    }),
    walletSummary: adminProcedure.query(() => walletSummaryForAdmin()),
    operationalStatus: adminProcedure.query(async () => {
      const db = await mongo();
      await db.command({ ping: 1 });
      return {
        maintenanceMode: process.env.MAINTENANCE_MODE === "true",
        environment:
          process.env.NODE_ENV === "production" ? "production" : "development",
        database: "connected" as const,
        paystack: await getPaystackReadiness(),
        checkedAt: new Date().toISOString(),
      };
    }),
    analyticsSummary: adminProcedure.query(async () => {
      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const events = await (
        await mongo()
      )
        .collection<any>("analytics_events")
        .find({ type: "pageview", createdAt: { $gte: since } })
        .project({
          _id: 0,
          sessionId: 1,
          path: 1,
          device: 1,
          screen: 1,
          createdAt: 1,
        })
        .toArray();
      const devices = events.reduce((counts: Record<string, number>, event) => {
        counts[event.device] = (counts[event.device] ?? 0) + 1;
        return counts;
      }, {});
      const routes = events.reduce((counts: Record<string, number>, event) => {
        counts[event.path] = (counts[event.path] ?? 0) + 1;
        return counts;
      }, {});
      const daily = events.reduce((counts: Record<string, number>, event) => {
        const day = new Date(event.createdAt).toISOString().slice(0, 10);
        counts[day] = (counts[day] ?? 0) + 1;
        return counts;
      }, {});
      return {
        since: since.toISOString(),
        pageViews: events.length,
        uniqueVisitors: new Set(events.map(event => event.sessionId)).size,
        devices,
        routes,
        daily,
      };
    }),
    listPapers: adminProcedure.query(
      async () =>
        await (await mongo())
          .collection("papers")
          .find()
          .sort({ updatedAt: -1 })
          .toArray()
    ),
    createPaper: adminProcedure
      .input(paperInput)
      .mutation(async ({ ctx, input }) => {
        const now = new Date();
        const { mode, ...paperFields } = input;
        const file = input.fileId
          ? await claimPortalFile({
              fileId: input.fileId,
              actorId: ctx.user.id,
              purpose: "paper",
              administrator: true,
            })
          : null;
        const paper = {
          ...paperFields,
          fileId: file?.gridFsId,
          fileName: file?.fileName,
          fileMimeType: file?.mimeType,
          _id: new (await import("mongodb")).ObjectId(),
          legacyId: await nextId("papers"),
          priceKes: mode === "free" ? 0 : input.priceKes,
          isAvailable: true,
          accessMode: mode === "free" ? "free" : "purchase",
          postMode: mode,
          createdAt: now,
          updatedAt: now,
        };
        await (await mongo()).collection("papers").insertOne(paper);
        if (file)
          await linkPortalFile({
            fileId: file.gridFsId,
            actorId: ctx.user.id,
            entityType: "paper",
            entityId: paper.legacyId,
          });
        return { success: true, paper };
      }),
    publishPost: adminProcedure
      .input(postInput)
      .mutation(async ({ ctx, input }) => {
        const now = new Date();
        const file = await claimPortalFile({
          fileId: input.fileId,
          actorId: ctx.user.id,
          purpose: "paper",
          administrator: true,
        });
        const paper = {
          _id: new (await import("mongodb")).ObjectId(),
          legacyId: await nextId("papers"),
          course: input.course,
          level: input.level,
    cycle: input.cycle,
    unit: input.unit,
    paperType: input.paperType,
    documentType: input.documentType,
    title: input.title,
          description: input.description ?? "",
          priceKes: input.mode === "free" ? 0 : input.priceKes,
          fileId: file.gridFsId,
          fileName: file.fileName,
          fileMimeType: file.mimeType,
          isAvailable: true,
          accessMode: input.mode === "free" ? "free" : "purchase",
          createdAt: now,
          updatedAt: now,
          publishedBy: ctx.user.id,
          postMode: input.mode,
        };
        await (await mongo()).collection("papers").insertOne(paper);
        await linkPortalFile({
          fileId: file.gridFsId,
          actorId: ctx.user.id,
          entityType: "paper",
          entityId: paper.legacyId,
        });
        return {
          success: true,
          paper: { ...paper, _id: paper._id.toString() },
        };
      }),
    setAvailability: adminProcedure
      .input(
        z.object({
          paperId: z.number().int().positive(),
          isAvailable: z.boolean(),
        })
      )
      .mutation(async ({ input }) => {
        await (await mongo())
          .collection("papers")
          .updateOne(
            { legacyId: input.paperId },
            { $set: { isAvailable: input.isAvailable, updatedAt: new Date() } }
          );
        return { success: true };
      }),
    deletePaper: adminProcedure
      .input(
        z.object({
          paperId: z.number().int().positive(),
          confirmation: z.literal("DELETE_PAPER"),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const db = await mongo();
        const paper = await db.collection<any>("papers").findOne({
          legacyId: input.paperId,
        });
        if (!paper) throw new Error("Paper not found.");
        if (paper.fileId) {
          await unlinkPortalFile({
            fileId: paper.fileId,
            actorId: ctx.user.id,
            entityType: "paper",
            entityId: paper.legacyId,
          });
          const file = await portalFileById(paper.fileId);
          if (file && file.references.length === 0)
            await deletePortalFile({
              fileId: paper.fileId,
              actorId: ctx.user.id,
            });
        }
        const entitlementResult = await db
          .collection("entitlements")
          .deleteMany({ paperId: paper.legacyId });
        await db.collection("papers").deleteOne({ _id: paper._id });
        await recordOperationalEvent({
          eventType: "paper.permanently_deleted",
          actorId: ctx.user.id,
          subjectType: "paper",
          subjectId: String(paper.legacyId),
          detail: {
            title: paper.title,
            removedEntitlements: entitlementResult.deletedCount,
            paymentRecordsRetained: true,
          },
        });
        return {
          success: true,
          paperId: paper.legacyId,
          removedEntitlements: entitlementResult.deletedCount,
        };
      }),
    listAnnouncements: adminProcedure.query(
      async () =>
        await (await mongo())
          .collection("announcements")
          .find()
          .sort({ createdAt: -1 })
          .toArray()
    ),
    createAnnouncement: adminProcedure
      .input(
        z.object({
          title: z.string().min(2),
          message: z.string().min(2),
          severity: z.enum(["info", "warning", "emergency"]),
        })
      )
      .mutation(async ({ ctx, input }) => {
        await (await mongo()).collection("announcements").insertOne({
          ...input,
          _id: new (await import("mongodb")).ObjectId(),
          createdBy: ctx.user.id,
          isActive: true,
          createdAt: new Date(),
        });
        return { success: true };
      }),
    listUsers: adminProcedure.query(
      async () =>
        await (
          await mongo()
        )
          .collection("users")
          .find(
            {},
            {
              projection: {
                _id: 0,
                legacyId: 1,
                id: 1,
                name: 1,
                email: 1,
                role: 1,
                createdAt: 1,
              },
            }
          )
          .sort({ createdAt: -1 })
          .toArray()
    ),
    setUserRole: adminProcedure
      .input(
        z.object({
          userId: z.number().int().positive(),
          role: z.enum(["user", "admin"]),
        })
      )
      .mutation(async ({ input }) => {
        await (await mongo())
          .collection("users")
          .updateOne(
            { legacyId: input.userId },
            { $set: { role: input.role, updatedAt: new Date() } }
          );
        return { success: true };
      }),
    listPayments: adminProcedure.query(async () => {
      const db = await mongo();
      const payments = await db
        .collection<any>("payments")
        .find()
        .sort({ createdAt: -1 })
        .toArray();
      return Promise.all(
        payments.map(async payment => ({
          payment,
          order: await db
            .collection<any>("orders")
            .findOne({ legacyId: payment.orderId }),
          paper: await paperById(
            (
              await db
                .collection<any>("orders")
                .findOne({ legacyId: payment.orderId })
            )?.paperId
          ),
        }))
      );
    }),
    grantAccess: adminProcedure
      .input(
        z.object({
          userId: z.number().int().positive(),
          paperId: z.number().int().positive(),
        })
      )
      .mutation(async ({ input }) => {
        const db = await mongo();
        if (!(await entitlementFor(input.userId, input.paperId)))
          await db.collection("entitlements").insertOne({
            _id: new (await import("mongodb")).ObjectId(),
            legacyId: await nextId("entitlements"),
            userId: input.userId,
            paperId: input.paperId,
            source: "manual",
            grantedAt: new Date(),
          });
        return { success: true };
      }),
    discardUploadedFile: adminProcedure
      .input(z.object({ fileId: z.string().min(12).max(80) }))
      .mutation(async ({ ctx, input }) => {
        const file = await portalFileById(input.fileId);
        if (!file) return { success: true as const, alreadyGone: true as const };
        if (file.references.length)
          return { success: false as const, alreadyGone: false as const };
        await deletePortalFile({ fileId: input.fileId, actorId: ctx.user.id });
        return { success: true as const, alreadyGone: false as const };
      }),
    uploadPaper: adminProcedure
      .input(
        z.object({
          fileId: z.string().min(12).max(80),
          paperId: z.number().int().positive(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const file = await claimPortalFile({
          fileId: input.fileId,
          actorId: ctx.user.id,
          purpose: "paper",
          administrator: true,
        });
        await (await mongo()).collection("papers").updateOne(
          { legacyId: input.paperId },
          {
            $set: {
              fileId: file.gridFsId,
              fileName: file.fileName,
              fileMimeType: file.mimeType,
              updatedAt: new Date(),
            },
          }
        );
        await linkPortalFile({
          fileId: file.gridFsId,
          actorId: ctx.user.id,
          entityType: "paper",
          entityId: input.paperId,
        });
        return { success: true, fileId: file.gridFsId };
      }),
    listSubmissions: adminProcedure.query(
      async () =>
        await (await mongo())
          .collection("submissions")
          .find()
          .sort({ createdAt: -1 })
          .toArray()
    ),
    files: adminProcedure.query(() => listPortalFiles()),
    operationalRecords: adminProcedure.query(
      async () =>
        await (await mongo())
          .collection("operational_records")
          .find()
          .sort({ createdAt: -1 })
          .limit(100)
          .toArray()
    ),
    storageAudit: adminProcedure.query(() => auditStorage()),
    cleanupStorage: adminProcedure
      .input(
        z.object({
          keys: z.array(z.string().min(1)).min(1).max(100),
          confirmation: z.literal(STORAGE_CLEANUP_CONFIRMATION),
        })
      )
      .mutation(({ ctx, input }) =>
        cleanupStorage({
          keys: input.keys,
          confirmation: input.confirmation,
          actorId: ctx.user.id,
        })
      ),
    reviewSubmission: adminProcedure
      .input(
        z.object({
          submissionId: z.number().int().positive(),
          status: z.enum(["approved", "rejected"]),
          reviewNote: z.string().max(1000).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const db = await mongo();
        const submissions = db.collection<any>("submissions");
        const submission = await submissions.findOne({
          legacyId: input.submissionId,
        });
        if (!submission) throw new Error("Submission not found");
        if (input.status === "rejected") {
          if (submission.status === "rejected") return { success: true };
          if (submission.paperId)
            throw new Error(
              "Published contributions cannot be rejected. Hide or permanently delete the catalogue paper instead."
            );

          let purgedFileId: string | undefined;
          if (submission.fileId) {
            await purgeRejectedPortalFile({
              fileId: submission.fileId,
              actorId: ctx.user.id,
            });
            purgedFileId = submission.fileId;
          }
          const reviewedAt = new Date();
          await submissions.updateOne(
            { _id: submission._id },
            {
              $set: {
                status: "rejected",
                reviewNote: input.reviewNote ?? "Not approved for publication.",
                reviewedBy: ctx.user.id,
                reviewedAt,
                updatedAt: reviewedAt,
                safetyStatus: "reviewed",
                approvalMode: "admin_review",
                storagePurged: Boolean(purgedFileId),
                storagePurgedAt: purgedFileId ? reviewedAt : undefined,
              },
            }
          );
          await recordOperationalEvent({
            eventType: "submission.rejected",
            actorId: ctx.user.id,
            subjectType: "submission",
            subjectId: String(submission.legacyId),
            detail: {
              storagePurged: Boolean(purgedFileId),
              fileId: purgedFileId,
            },
          });
          return { success: true, storagePurged: Boolean(purgedFileId) };
        }

        const existingPaper = await db.collection("papers").findOne({
          submissionId: submission.legacyId,
        });
        if (submission.status === "approved" && existingPaper)
          return { success: true, paperId: existingPaper.legacyId };

        const paper = await publishSubmissionAsPaper(
          db,
          submission,
          ctx.user.id,
          "admin_review"
        );
        const now = new Date();
        await submissions.updateOne(
          { _id: submission._id },
          {
            $set: {
              status: "approved",
              paperId: paper.legacyId,
              safetyStatus: "reviewed",
              approvalMode: "admin_review",
              reviewNote: input.reviewNote ?? "",
              reviewedBy: ctx.user.id,
              reviewedAt: now,
              updatedAt: now,
            },
          }
        );
        return { success: true, paperId: paper.legacyId };
      }),
  }),
});
export type AppRouter = typeof appRouter;
