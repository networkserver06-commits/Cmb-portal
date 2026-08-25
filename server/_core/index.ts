import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import {
  mongo,
  entitlementFor,
  paperById,
  recordOperationalEvent,
} from "../mongoStore";
import { parse } from "cookie";
import { ACCOUNT_COOKIE, authenticateAccount } from "../mongoAuth";
import { storageGetSignedUrl } from "../storage";
import {
  MAX_UPLOAD_BYTES,
  portalFileById,
  streamPortalFile,
  uploadPortalFile,
} from "../fileStore";
import { sdk } from "./sdk";
import { ENV } from "./env";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

export async function createApp() {
  const app = express();
  const requestUser = async (req: express.Request, res: express.Response) =>
    (await createContext({ req, res } as any)).user;
  app.get("/api/health", (_req, res) =>
    res.status(200).json({
      status: "ok",
      appBaseUrlConfigured: Boolean(ENV.appBaseUrl),
      paymentCollection: "paystack-hosted",
    })
  );
  // Paystack signs the exact raw payload. Keep this endpoint before JSON parsing.
  app.post(
    "/api/paystack/webhook",
    express.raw({ type: "application/json" }),
    async (req, res) => {
      const {
        isValidPaystackSignature,
        paymentMatchesOrder,
        verifyPaystackTransaction,
        fulfillSuccessfulPayment,
      } = await import("../paystack");
      const rawBody = Buffer.isBuffer(req.body)
        ? req.body.toString("utf8")
        : "";
      if (
        !isValidPaystackSignature(rawBody, req.header("x-paystack-signature"))
      ) {
        return res.status(401).send("Invalid signature");
      }
      try {
        const event = JSON.parse(rawBody) as {
          event?: string;
          data?: {
            reference?: string;
            amount?: number;
            currency?: string;
            status?: string;
          };
        };
        if (event.event === "charge.success" && event.data?.reference) {
          const verified = await verifyPaystackTransaction(
            event.data.reference
          );
          if (
            verified.data?.status !== "success" ||
            !paymentMatchesOrder(
              verified.data,
              event.data.reference,
              Number(event.data.amount ?? 0) / 100
            )
          ) {
            return res.status(400).send("Verification mismatch");
          }
          // Fulfilment is intentionally idempotent: existing entitlements are checked before access is granted.
          await fulfillSuccessfulPayment(
            event.data.reference,
            verified.data,
            rawBody
          );
        }
        return res.sendStatus(200);
      } catch (error) {
        console.error("Paystack webhook error", error);
        return res.sendStatus(500);
      }
    }
  );
  app.post(
    "/api/files/upload",
    express.raw({ type: "application/octet-stream", limit: MAX_UPLOAD_BYTES }),
    async (req, res) => {
      try {
        const user = await requestUser(req, res);
        if (!user)
          return res.status(401).json({ error: "Authentication required" });
        const purpose = req.header("x-file-purpose");
        if (purpose !== "submission" && purpose !== "paper")
          return res
            .status(400)
            .json({ error: "Use a supported upload purpose." });
        if (purpose === "paper" && user.role !== "admin")
          return res.status(403).json({
            error: "Administrator access is required for publication files.",
          });
        const fileName = decodeURIComponent(req.header("x-file-name") ?? "");
        const mimeType =
          req.header("x-file-type") ?? "application/octet-stream";
        if (!Buffer.isBuffer(req.body))
          return res
            .status(400)
            .json({ error: "Send the document as a binary upload body." });
        const file = await uploadPortalFile({
          ownerId: user.id,
          purpose,
          fileName,
          mimeType,
          bytes: req.body,
        });
        return res.status(201).json({
          fileId: file.gridFsId,
          fileName: file.fileName,
          mimeType: file.mimeType,
          byteLength: file.byteLength,
          status: "uploaded",
        });
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "The file could not be uploaded.";
        return res
          .status(
            message.includes("4 MiB") || message.includes("larger") ? 413 : 400
          )
          .json({ error: message });
      }
    }
  );
  app.get("/api/files/:fileId/download", async (req, res) => {
    try {
      const user = await requestUser(req, res);
      if (!user)
        return res.status(401).json({ error: "Authentication required" });
      const file = await portalFileById(req.params.fileId);
      if (!file) return res.status(404).json({ error: "File not found" });
      let allowed = user.role === "admin" || file.ownerId === user.id;
      const db = await mongo();
      if (!allowed) {
        const paper = await db
          .collection<any>("papers")
          .findOne({ fileId: file.gridFsId });
        if (paper)
          allowed = Boolean(await entitlementFor(user.id, paper.legacyId));
      }
      if (!allowed)
        allowed = Boolean(
          await db
            .collection("submissions")
            .findOne({ fileId: file.gridFsId, userId: user.id })
        );
      if (!allowed)
        return res
          .status(403)
          .json({ error: "You do not have access to this file." });
      await recordOperationalEvent({
        eventType: "file.downloaded",
        actorId: user.id,
        subjectType: "file",
        subjectId: file.gridFsId,
      });
      await streamPortalFile(file.gridFsId, res);
    } catch (error) {
      console.error("GridFS download error", error);
      if (!res.headersSent)
        return res
          .status(500)
          .json({ error: "Unable to prepare the protected download" });
    }
  });
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ limit: "1mb", extended: true }));
  registerStorageProxy(app);
  registerOAuthRoutes(app);
  app.get("/api/papers/:paperId/download", async (req, res) => {
    try {
      let user = null;
      try {
        user = await sdk.authenticateRequest(req);
      } catch {
        user = null;
      }
      if (!user) {
        try {
          user =
            (await authenticateAccount(
              parse(req.headers.cookie ?? "")[ACCOUNT_COOKIE]
            )) ?? null;
        } catch {
          user = null;
        }
      }
      if (!user)
        return res.status(401).json({ error: "Authentication required" });
      const paperId = Number(req.params.paperId);
      if (!Number.isInteger(paperId))
        return res.status(404).json({ error: "Paper not found" });
      const [entitlement, paper] = await Promise.all([
        entitlementFor(user.id, paperId),
        paperById(paperId),
      ]);
      if (!entitlement || (!paper?.fileId && !paper?.fileKey))
        return res
          .status(403)
          .json({ error: "This paper is not unlocked for your account" });
      await (await mongo()).collection("downloads").insertOne({
        userId: user.id,
        paperId,
        entitlementId: entitlement.legacyId,
        ipAddress: req.ip,
        userAgent: req.get("user-agent") ?? null,
        createdAt: new Date(),
      });
      if (paper.fileId) {
        await recordOperationalEvent({
          eventType: "paper.downloaded",
          actorId: user.id,
          subjectType: "paper",
          subjectId: String(paperId),
          detail: { fileId: paper.fileId },
        });
        await streamPortalFile(paper.fileId, res);
        return;
      }
      return res.redirect(307, await storageGetSignedUrl(paper.fileKey!));
    } catch (error) {
      console.error("Protected download error", error);
      return res.status(500).json({ error: "Unable to prepare download" });
    }
  });
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  app.use(
    (
      error: { type?: string; status?: number; statusCode?: number },
      _req: express.Request,
      res: express.Response,
      next: express.NextFunction
    ) => {
      if (
        error.type === "entity.too.large" ||
        error.status === 413 ||
        error.statusCode === 413
      )
        return res.status(413).json({
          error: "Files must be 4 MiB or smaller for reliable Vercel uploads.",
        });
      return next(error);
    }
  );
  return app;
}

async function startServer() {
  const { serveStatic, setupVite } = await import("./vite");
  const app = await createApp();
  const server = createServer(app);
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

if (!process.env.VERCEL) startServer().catch(console.error);
