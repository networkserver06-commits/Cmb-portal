import "dotenv/config";
import express from "express";
import { createServer } from "http";
import { Readable } from "node:stream";
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
import {
  officePreviewFileType,
  renderLegacyOfficeText,
  renderOfficePreview,
} from "../officePreview";
import {
  buildLimitedDocumentPreview,
  createFirstPagePdf,
  isPdfDocument,
  MAX_PREVIEW_SOURCE_BYTES,
  readPreviewResponse,
} from "../documentPreview";
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
  const scholarshelfApkUrl =
    "https://expo.dev/artifacts/eas/PkZ-KS7LyPuIO7WdQSurW_mVGQCjswv4ctytUsay3BE.apk";
  app.get("/api/health", (_req, res) =>
    res.status(200).json({
      status: "ok",
      appBaseUrlConfigured: Boolean(ENV.appBaseUrl),
      paymentCollection: "leetec-stkpush",
    })
  );
  app.get("/api/app-download", async (_req, res) => {
    try {
      const upstream = await fetch(scholarshelfApkUrl);
      if (!upstream.ok || !upstream.body)
        return res
          .status(502)
          .json({ error: "The ScholarShelf APK is temporarily unavailable." });

      res.status(200);
      res.setHeader("Content-Type", "application/vnd.android.package-archive");
      res.setHeader(
        "Content-Disposition",
        'attachment; filename="ScholarShelf.apk"'
      );
      res.setHeader("Cache-Control", "public, max-age=300");
      const contentLength = upstream.headers.get("content-length");
      if (contentLength) res.setHeader("Content-Length", contentLength);
      Readable.fromWeb(
        upstream.body as unknown as import("node:stream/web").ReadableStream
      ).pipe(res);
      return undefined;
    } catch {
      return res
        .status(502)
        .json({ error: "The ScholarShelf APK is temporarily unavailable." });
    }
  });

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
    express.raw({
      type: "application/octet-stream",
      limit: CHUNK_UPLOAD_BYTES,
    }),
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
            message.includes("250 MiB") || message.includes("larger")
              ? 413
              : 400
          )
          .json({ error: message });
      }
    }
  );
  app.post("/api/files/upload/init", async (req, res) => {
    try {
      const user = await requestUser(req, res);
      if (!user)
        return res.status(401).json({ error: "Authentication required" });
      const purpose = req.body?.purpose;
      if (purpose !== "submission" && purpose !== "paper")
        return res
          .status(400)
          .json({ error: "Use a supported upload purpose." });
      if (purpose === "paper" && user.role !== "admin")
        return res.status(403).json({
          error: "Administrator access is required for publication files.",
        });
      const result = await beginChunkedPortalUpload({
        ownerId: user.id,
        purpose,
        fileName: String(req.body?.fileName ?? ""),
        mimeType: String(req.body?.mimeType ?? "application/octet-stream"),
        totalBytes: Number(req.body?.totalBytes),
      });
      return res.status(201).json(result);
    } catch (error) {
      return res.status(400).json({
        error:
          error instanceof Error ? error.message : "Unable to start upload.",
      });
    }
  });
  app.post(
    "/api/files/upload/chunk",
    express.raw({
      type: "application/octet-stream",
      limit: CHUNK_UPLOAD_BYTES,
    }),
    async (req, res) => {
      try {
        const user = await requestUser(req, res);
        if (!user)
          return res.status(401).json({ error: "Authentication required" });
        if (!Buffer.isBuffer(req.body))
          return res
            .status(400)
            .json({ error: "Send the upload chunk as binary data." });
        const result = await storePortalUploadChunk({
          uploadId: String(req.header("x-upload-id") ?? ""),
          ownerId: user.id,
          index: Number(req.header("x-chunk-index")),
          bytes: req.body,
        });
        return res.status(200).json(result);
      } catch (error) {
        return res.status(400).json({
          error:
            error instanceof Error
              ? error.message
              : "Unable to store upload chunk.",
        });
      }
    }
  );
  app.post("/api/files/upload/complete", async (req, res) => {
    try {
      const user = await requestUser(req, res);
      if (!user)
        return res.status(401).json({ error: "Authentication required" });
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
      return res.status(400).json({
        error:
          error instanceof Error ? error.message : "Unable to complete upload.",
      });
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
  const escapeReviewHtml = (value: string) =>
    value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  app.get("/api/files/:fileId/review-preview", async (req, res) => {
    try {
      const user = await requestUser(req, res);
      if (!user)
        return res.status(401).json({ error: "Authentication required" });
      if (user.role !== "admin")
        return res
          .status(403)
          .json({ error: "Administrator access is required" });
      const file = await portalFileById(req.params.fileId);
      if (!file) return res.status(404).json({ error: "File not found" });
      const fileName = file.fileName.toLowerCase();
      const normalizedMime = file.mimeType
        .split(";", 1)[0]
        .trim()
        .toLowerCase();
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader(
        "Content-Security-Policy",
        "sandbox; default-src 'none'; style-src 'unsafe-inline'"
      );
      res.setHeader("Cache-Control", "private, no-store");
      if (isPdfDocument(normalizedMime, file.fileName))
        return streamPortalFile(file.gridFsId, res, { disposition: "inline" });
      const bytes = await readPortalFileBytes(
        file.gridFsId,
        MAX_PREVIEW_SOURCE_BYTES
      );
      const office = officePreviewFileType(normalizedMime, file.fileName);
      if (office) {
        const rendered = await renderOfficePreview({
          bytes,
          fileName: file.fileName,
          mimeType: file.mimeType,
        });
        if (rendered)
          return res
            .type("html")
            .send(
              `<!doctype html><html><head><meta charset="utf-8"><title>${escapeReviewHtml(file.fileName)}</title><style>body{margin:0;padding:28px;color:#243f37;font:15px/1.7 system-ui,sans-serif}table{border-collapse:collapse;max-width:100%}td,th{border:1px solid #cdded7;padding:6px 9px}img{max-width:100%;height:auto}</style></head><body>${rendered.html}</body></html>`
            );
      }
      if (["doc", "xls", "ppt"].includes(fileName.split(".").pop() ?? "")) {
        const text = await renderLegacyOfficeText({
          bytes,
          fileName: file.fileName,
        });
        if (text)
          return res
            .type("html")
            .send(
              `<!doctype html><html><head><meta charset="utf-8"><title>${escapeReviewHtml(file.fileName)}</title><style>body{margin:0;padding:28px;color:#243f37;font:15px/1.7 system-ui,sans-serif;white-space:pre-wrap}</style></head><body>${escapeReviewHtml(text)}</body></html>`
            );
      }
      const textLike =
        normalizedMime.startsWith("text/") ||
        [
          "csv",
          "json",
          "xml",
          "yaml",
          "yml",
          "md",
          "html",
          "htm",
          "txt",
          "log",
          "ini",
          "tex",
        ].includes(fileName.split(".").pop() ?? "");
      if (textLike)
        return res
          .type("html")
          .send(
            `<!doctype html><html><head><meta charset="utf-8"><title>${escapeReviewHtml(file.fileName)}</title><style>body{margin:0;padding:28px;color:#243f37;font:15px/1.7 system-ui,sans-serif;white-space:pre-wrap}</style></head><body>${escapeReviewHtml(bytes.toString("utf8"))}</body></html>`
          );
      return streamPortalFile(file.gridFsId, res, { disposition: "inline" });
    } catch (error) {
      console.error("Admin document review preview error", error);
      if (!res.headersSent)
        return res.status(422).json({
          error: "The complete document preview could not be prepared.",
        });
    }
  });
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
  const handlePublicPaperPreview = async (
    req: express.Request,
    res: express.Response
  ) => {
    let previewPriceKes = 0;
    try {
      const paperId = Number(req.params.paperId);
      if (!Number.isInteger(paperId))
        return res.status(404).json({ error: "Paper not found" });
      const paper = await paperById(paperId);
      if (!paper?.isAvailable || (!paper.fileId && !paper.fileKey))
        return res.status(404).json({ error: "Paper preview unavailable" });
      previewPriceKes = Number(paper.priceKes);

      let bytes: Buffer;
      if (paper.fileId) {
        if (!(await portalFileById(paper.fileId)))
          return res.status(404).json({ error: "Paper document not found" });
        bytes = await readPortalFileBytes(
          paper.fileId,
          MAX_PREVIEW_SOURCE_BYTES
        );
      } else {
        const signedUrl = await storageGetSignedUrl(paper.fileKey!);
        const response = await fetch(signedUrl);
        if (!response.ok)
          return res.status(404).json({ error: "Paper document not found" });
        bytes = await readPreviewResponse(response);
      }

      const preview = await buildLimitedDocumentPreview({
        bytes,
        fileName: String(paper.fileName ?? paper.fileKey ?? "document"),
        mimeType: String(paper.fileMimeType ?? "application/octet-stream"),
      });
      const fileName = String(paper.fileName ?? paper.fileKey ?? "document");
      const mimeType = String(paper.fileMimeType ?? "application/octet-stream");
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Cache-Control", "private, no-store");
      return res.json({
        title: paper.title,
        scope: preview.scope,
        excerpt: preview.excerpt,
        isPaid: paper.accessMode === "purchase" || Number(paper.priceKes) > 0,
        priceKes: Number(paper.priceKes),
        kind: isPdfDocument(mimeType, fileName) ? "pdf" : "text",
        previewFileUrl: isPdfDocument(mimeType, fileName)
          ? `/api/papers/${paperId}/preview-file`
          : null,
      });
    } catch (error) {
      console.error("Public paper preview error", error);
      if (!res.headersSent) {
        res.setHeader("X-Content-Type-Options", "nosniff");
        res.setHeader("Cache-Control", "private, no-store");
        return res.status(200).json({
          title: "Limited preview",
          scope: "Preview temporarily limited",
          excerpt:
            "The opening excerpt is temporarily unavailable for this resource. You can still review the paper details and unlock the complete document through secure checkout.",
          isPaid: true,
          priceKes: previewPriceKes,
        });
      }
    }
  };
  const handlePublicPaperPreviewFile = async (
    req: express.Request,
    res: express.Response
  ) => {
    try {
      const paperId = Number(req.params.paperId);
      if (!Number.isInteger(paperId))
        return res.status(404).json({ error: "Paper not found" });
      const paper = await paperById(paperId);
      if (!paper?.isAvailable || (!paper.fileId && !paper.fileKey))
        return res.status(404).json({ error: "Paper preview unavailable" });
      const fileName = String(
        paper.fileName ?? paper.fileKey ?? "document.pdf"
      );
      const mimeType = String(paper.fileMimeType ?? "application/octet-stream");
      if (!isPdfDocument(mimeType, fileName))
        return res.status(415).json({
          error: "Visual preview is available for PDF documents only.",
        });

      let bytes: Buffer;
      if (paper.fileId) {
        if (!(await portalFileById(paper.fileId)))
          return res.status(404).json({ error: "Paper document not found" });
        bytes = await readPortalFileBytes(
          paper.fileId,
          MAX_PREVIEW_SOURCE_BYTES
        );
      } else {
        const signedUrl = await storageGetSignedUrl(paper.fileKey!);
        const response = await fetch(signedUrl);
        if (!response.ok)
          return res.status(404).json({ error: "Paper document not found" });
        bytes = await readPreviewResponse(response);
      }
      const firstPage = await createFirstPagePdf(bytes);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        'inline; filename="ScholarShelf-preview.pdf"'
      );
      res.setHeader("Content-Length", firstPage.byteLength);
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Cache-Control", "private, no-store");
      return res.send(firstPage);
    } catch (error) {
      console.error("Public paper visual preview error", error);
      if (!res.headersSent)
        return res
          .status(422)
          .json({ error: "The visual preview could not be prepared." });
    }
  };
  app.get("/api/papers/:paperId/free-view", handlePublicFreePaper);
  app.get("/api/papers/:paperId/office-preview", handlePublicOfficePreview);
  app.get("/api/papers/:paperId/preview", handlePublicPaperPreview);
  app.get("/api/papers/:paperId/preview-file", handlePublicPaperPreviewFile);
  app.get("/api/papers/:paperId/download", (req, res) =>
    handleProtectedPaper(req, res, "attachment")
  );
  app.get("/api/papers/:paperId/view", (req, res) =>
    handleProtectedPaper(req, res, "inline")
  );
  app.get("/api/papers/:paperId/full-view", async (req, res) => {
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
      const paperId = Number(req.params.paperId);
      const paper = Number.isInteger(paperId) ? await paperById(paperId) : null;
      if (!paper?.isAvailable || (!paper.fileId && !paper.fileKey))
        return res.status(404).json({ error: "Paper not found" });
      const publicFree =
        paper.accessMode === "free" && Number(paper.priceKes) === 0;
      const unlocked = user
        ? Boolean(await entitlementFor(user.id, paperId))
        : false;
      if (!publicFree && !unlocked && user?.role !== "admin")
        return res.status(user ? 403 : 401).json({
          error: user
            ? "This paper is not unlocked for your account"
            : "Authentication required",
        });
      const fileName = String(paper.fileName ?? paper.fileKey ?? "document");
      const mimeType = String(paper.fileMimeType ?? "application/octet-stream");
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Cache-Control", "private, no-store");
      if (isPdfDocument(mimeType, fileName)) {
        if (paper.fileId) {
          await recordOperationalEvent({
            eventType: "paper.viewed",
            actorId: user?.id ?? 0,
            subjectType: "paper",
            subjectId: String(paperId),
            detail: { fileId: paper.fileId, shared: true },
          });
          return streamPortalFile(paper.fileId, res, { disposition: "inline" });
        }
        res.setHeader(
          "Content-Disposition",
          `inline; filename*=UTF-8''${encodeURIComponent(fileName)}`
        );
        return res.redirect(307, await storageGetSignedUrl(paper.fileKey!));
      }
      let bytes: Buffer;
      if (paper.fileId) {
        if (!(await portalFileById(paper.fileId)))
          return res.status(404).json({ error: "Paper document not found" });
        bytes = await readPortalFileBytes(
          paper.fileId,
          MAX_PREVIEW_SOURCE_BYTES
        );
      } else {
        const response = await fetch(await storageGetSignedUrl(paper.fileKey!));
        if (!response.ok)
          return res.status(404).json({ error: "Paper document not found" });
        bytes = await readPreviewResponse(response);
      }
      const office = officePreviewFileType(mimeType, fileName);
      if (office) {
        const rendered = await renderOfficePreview({
          bytes,
          fileName,
          mimeType,
        });
        if (rendered)
          return res
            .type("html")
            .send(
              `<!doctype html><html><head><meta charset="utf-8"><title>${escapeReviewHtml(fileName)}</title><style>body{margin:0;padding:28px;color:#243f37;font:15px/1.7 system-ui,sans-serif}table{border-collapse:collapse;max-width:100%}td,th{border:1px solid #cdded7;padding:6px 9px}img{max-width:100%;height:auto}</style></head><body>${rendered.html}</body></html>`
            );
      }
      if (
        ["doc", "xls", "ppt"].includes(
          fileName.toLowerCase().split(".").pop() ?? ""
        )
      ) {
        const text = await renderLegacyOfficeText({ bytes, fileName });
        if (text)
          return res
            .type("html")
            .send(
              `<!doctype html><html><head><meta charset="utf-8"><title>${escapeReviewHtml(fileName)}</title><style>body{margin:0;padding:28px;color:#243f37;font:15px/1.7 system-ui,sans-serif;white-space:pre-wrap}</style></head><body>${escapeReviewHtml(text)}</body></html>`
            );
      }
      const extension = fileName.toLowerCase().split(".").pop() ?? "";
      const textLike =
        mimeType.toLowerCase().startsWith("text/") ||
        [
          "csv",
          "json",
          "xml",
          "yaml",
          "yml",
          "md",
          "html",
          "htm",
          "txt",
          "log",
          "ini",
          "tex",
        ].includes(extension);
      if (textLike)
        return res
          .type("html")
          .send(
            `<!doctype html><html><head><meta charset="utf-8"><title>${escapeReviewHtml(fileName)}</title><style>body{margin:0;padding:28px;color:#243f37;font:15px/1.7 system-ui,sans-serif;white-space:pre-wrap}</style></head><body>${escapeReviewHtml(bytes.toString("utf8"))}</body></html>`
          );
      res.setHeader(
        "Content-Disposition",
        `inline; filename*=UTF-8''${encodeURIComponent(fileName)}`
      );
      return res.type(mimeType).send(bytes);
    } catch (error) {
      console.error("Full document view error", error);
      if (!res.headersSent)
        return res
          .status(422)
          .json({ error: "The full document view could not be prepared." });
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
      req: express.Request,
      res: express.Response,
      next: express.NextFunction
    ) => {
      if (
        error.type === "entity.too.large" ||
        error.status === 413 ||
        error.statusCode === 413
      )
        return res.status(413).json({
          error:
            "Files must be 250 MiB or smaller for reliable chunked uploads.",
        });
      if (req.path.startsWith("/api/")) {
        console.error("[API error]", error);
        return res.status(error.status ?? error.statusCode ?? 500).json({
          error: "A server error occurred while processing your request.",
        });
      }
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
