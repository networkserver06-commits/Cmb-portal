import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
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
  CHUNK_UPLOAD_BYTES,
  MAX_UPLOAD_BYTES,
  beginChunkedPortalUpload,
  completeChunkedPortalUpload,
  portalFileById,
  readPortalFileBytes,
  storePortalUploadChunk,
  streamPortalFile,
  uploadPortalFile,
} from "../fileStore";
import { officePreviewFileType, renderOfficePreview } from "../officePreview";
import { runRetentionCleanup } from "../retentionCleanup";
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
  app.use(express.json({ limit: "1mb" }));
  const requestUser = async (req: express.Request, res: express.Response) =>
    (await createContext({ req, res } as any)).user;
  app.get("/api/health", (_req, res) =>
    res.status(200).json({
      status: "ok",
      appBaseUrlConfigured: Boolean(ENV.appBaseUrl),
      paymentCollection: "leetec-stkpush",
    })
  );

  app.post("/api/scheduled/retentionCleanup", async (req, res) => {
    try {
      const user = await sdk.authenticateRequest(req);
      if (!user.isCron || !user.taskUid)
        return res.status(403).json({ error: "cron-only" });
      const result = await runRetentionCleanup({ actorId: user.id });
      return res.status(200).json({ ok: true, ...result });
    } catch (error) {
      return res.status(500).json({
        error: error instanceof Error ? error.message : String(error),
        context: {
          url: req.originalUrl,
          taskUid: req.headers["x-manus-task-uid"] ?? null,
        },
        timestamp: new Date().toISOString(),
      });
    }
  });
  app.post(
    "/api/files/upload",
    express.raw({ type: "application/octet-stream", limit: CHUNK_UPLOAD_BYTES }),
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
            message.includes("250 MiB") || message.includes("larger") ? 413 : 400
          )
          .json({ error: message });
      }
    }
  );
  app.post("/api/files/upload/init", async (req, res) => {
    try {
      const user = await requestUser(req, res);
      if (!user) return res.status(401).json({ error: "Authentication required" });
      const purpose = req.body?.purpose;
      if (purpose !== "submission" && purpose !== "paper")
        return res.status(400).json({ error: "Use a supported upload purpose." });
      if (purpose === "paper" && user.role !== "admin")
        return res.status(403).json({ error: "Administrator access is required for publication files." });
      const result = await beginChunkedPortalUpload({
        ownerId: user.id,
        purpose,
        fileName: String(req.body?.fileName ?? ""),
        mimeType: String(req.body?.mimeType ?? "application/octet-stream"),
        totalBytes: Number(req.body?.totalBytes),
        totalChunks: Number(req.body?.totalChunks),
      });
      return res.status(201).json(result);
    } catch (error) {
      return res.status(400).json({ error: error instanceof Error ? error.message : "Unable to start upload." });
    }
  });
  app.post(
    "/api/files/upload/chunk",
    express.raw({ type: "application/octet-stream", limit: CHUNK_UPLOAD_BYTES }),
    async (req, res) => {
      try {
        const user = await requestUser(req, res);
        if (!user) return res.status(401).json({ error: "Authentication required" });
        if (!Buffer.isBuffer(req.body))
          return res.status(400).json({ error: "Send the upload chunk as binary data." });
        const result = await storePortalUploadChunk({
          uploadId: String(req.header("x-upload-id") ?? ""),
          ownerId: user.id,
          index: Number(req.header("x-chunk-index")),
          bytes: req.body,
        });
        return res.status(200).json(result);
      } catch (error) {
        return res.status(400).json({ error: error instanceof Error ? error.message : "Unable to store upload chunk." });
      }
    }
  );
  app.post("/api/files/upload/complete", async (req, res) => {
    try {
      const user = await requestUser(req, res);
      if (!user) return res.status(401).json({ error: "Authentication required" });
      const file = await completeChunkedPortalUpload({
        uploadId: String(req.body?.uploadId ?? ""),
        ownerId: user.id,
      });
      return res.status(201).json({
        fileId: file.gridFsId,
        fileName: file.fileName,
        mimeType: file.mimeType,
        byteLength: file.byteLength,
        status: "uploaded",
      });
    } catch (error) {
      return res.status(400).json({ error: error instanceof Error ? error.message : "Unable to complete upload." });
    }
  });
  const handleProtectedFile = async (
    req: express.Request,
    res: express.Response,
    disposition: "inline" | "attachment"
  ) => {
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
          .findOne({ fileId: file.gridFsId, isAvailable: true });
        if (paper)
          allowed = Boolean(await entitlementFor(user.id, paper.legacyId));
      }
      if (!allowed)
        allowed = Boolean(
          await db.collection("submissions").findOne({
            fileId: file.gridFsId,
            userId: user.id,
            status: { $ne: "rejected" },
          })
        );
      if (!allowed)
        return res
          .status(403)
          .json({ error: "You do not have access to this file." });

      await recordOperationalEvent({
        eventType: disposition === "inline" ? "file.viewed" : "file.downloaded",
        actorId: user.id,
        subjectType: "file",
        subjectId: file.gridFsId,
      });
      res.setHeader("X-Content-Type-Options", "nosniff");
      await streamPortalFile(file.gridFsId, res, { disposition });
    } catch (error) {
      console.error("GridFS file access error", error);
      if (!res.headersSent)
        return res
          .status(500)
          .json({ error: "Unable to prepare the protected document" });
    }
  };
  app.get("/api/files/:fileId/download", (req, res) =>
    handleProtectedFile(req, res, "attachment")
  );
  app.get("/api/files/:fileId/view", (req, res) =>
    handleProtectedFile(req, res, "inline")
  );
  app.use(express.urlencoded({ limit: "1mb", extended: true }));
  registerOAuthRoutes(app);
  const handleProtectedPaper = async (
    req: express.Request,
    res: express.Response,
    disposition: "inline" | "attachment"
  ) => {
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
      if (disposition === "attachment")
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
          eventType:
            disposition === "inline" ? "paper.viewed" : "paper.downloaded",
          actorId: user.id,
          subjectType: "paper",
          subjectId: String(paperId),
          detail: { fileId: paper.fileId },
        });
        res.setHeader("X-Content-Type-Options", "nosniff");
        await streamPortalFile(paper.fileId, res, { disposition });
        return;
      }
      return res.redirect(307, await storageGetSignedUrl(paper.fileKey!));
    } catch (error) {
      console.error("Protected paper access error", error);
      return res
        .status(500)
        .json({ error: "Unable to prepare the protected document" });
    }
  };
  const handlePublicFreePaper = async (
    req: express.Request,
    res: express.Response
  ) => {
    try {
      const paperId = Number(req.params.paperId);
      if (!Number.isInteger(paperId))
        return res.status(404).json({ error: "Paper not found" });
      const paper = await paperById(paperId);
      if (
        !paper?.isAvailable ||
        paper.accessMode !== "free" ||
        Number(paper.priceKes) !== 0
      )
        return res
          .status(403)
          .json({ error: "This paper is not available for public viewing" });
      if (paper.fileId) {
        if (!(await portalFileById(paper.fileId)))
          return res.status(404).json({ error: "Paper document not found" });
        res.setHeader("X-Content-Type-Options", "nosniff");
        await streamPortalFile(paper.fileId, res, { disposition: "inline" });
        return;
      }
      if (paper.fileKey) {
        res.setHeader("X-Content-Type-Options", "nosniff");
        return res.redirect(307, await storageGetSignedUrl(paper.fileKey));
      }
      return res.status(404).json({ error: "Paper document not found" });
    } catch (error) {
      console.error("Public Free paper access error", error);
      if (!res.headersSent)
        return res
          .status(500)
          .json({ error: "Unable to prepare the public document" });
    }
  };
  const handlePublicOfficePreview = async (
    req: express.Request,
    res: express.Response
  ) => {
    try {
      const paperId = Number(req.params.paperId);
      if (!Number.isInteger(paperId))
        return res.status(404).json({ error: "Paper not found" });
      const paper = await paperById(paperId);
      if (
        !paper?.isAvailable ||
        paper.accessMode !== "free" ||
        Number(paper.priceKes) !== 0
      )
        return res
          .status(403)
          .json({ error: "This paper is not available for public preview" });

      const fileName = String(paper.fileName ?? paper.fileKey ?? "document");
      const mimeType = String(paper.fileMimeType ?? "application/octet-stream");
      if (!officePreviewFileType(mimeType, fileName))
        return res.status(415).json({
          error:
            "This document format is not supported for automatic in-portal preview.",
        });

      let bytes: Buffer;
      if (paper.fileId) {
        if (!(await portalFileById(paper.fileId)))
          return res.status(404).json({ error: "Paper document not found" });
        bytes = await readPortalFileBytes(paper.fileId);
      } else if (paper.fileKey) {
        const signedUrl = await storageGetSignedUrl(paper.fileKey);
        const response = await fetch(signedUrl);
        if (!response.ok)
          return res.status(404).json({ error: "Paper document not found" });
        const arrayBuffer = await response.arrayBuffer();
        if (arrayBuffer.byteLength > MAX_UPLOAD_BYTES)
          return res
            .status(413)
            .json({ error: "The selected file is too large" });
        bytes = Buffer.from(arrayBuffer);
      } else {
        return res.status(404).json({ error: "Paper document not found" });
      }

      const preview = await renderOfficePreview({ bytes, fileName, mimeType });
      if (!preview)
        return res.status(415).json({
          error:
            "This document format is not supported for automatic in-portal preview.",
        });
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader(
        "Content-Security-Policy",
        "default-src 'none'; img-src data:; style-src 'unsafe-inline';"
      );
      res.setHeader("Cache-Control", "private, no-store");
      return res.type("html").send(preview.html);
    } catch (error) {
      console.error("Public office preview error", error);
      if (!res.headersSent)
        return res.status(422).json({
          error:
            "This document could not be converted for automatic in-portal preview.",
        });
    }
  };
  app.get("/api/papers/:paperId/free-view", handlePublicFreePaper);
  app.get("/api/papers/:paperId/office-preview", handlePublicOfficePreview);
  app.get("/api/papers/:paperId/download", (req, res) =>
    handleProtectedPaper(req, res, "attachment")
  );
  app.get("/api/papers/:paperId/view", (req, res) =>
    handleProtectedPaper(req, res, "inline")
  );
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
          error: "Files must be 250 MiB or smaller for reliable chunked uploads.",
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
