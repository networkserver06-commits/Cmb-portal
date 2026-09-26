import {
  portalFileById,
  readPortalFileBytes,
  validateUpload,
  type PortalFileMetadata,
} from "./fileStore";

export type SubmissionSafetyResult = {
  decision: "auto_publish" | "admin_review";
  reasons: string[];
};

const safeAutoPublishExtensions = new Set([
  "pdf",
  "doc",
  "docx",
  "ppt",
  "pptx",
  "xls",
  "xlsx",
  "odt",
  "odp",
  "ods",
  "rtf",
  "epub",
  "md",
  "html",
  "txt",
  "csv",
  "json",
  "xml",
  "yaml",
  "yml",
  "tex",
  "log",
  "ini",
]);
const suspiciousContentPattern =
  /<script\b|<iframe\b|javascript:|data:text\/html|powershell|cmd\.exe|bash\s+-c|base64_decode/i;
const activePdfPattern = /\/javascript\b|\/js\b|\/launch\b|\/embeddedfile\b/i;

function extensionOf(fileName: string) {
  return (
    fileName
      .trim()
      .toLowerCase()
      .match(/\.([a-z0-9]+)$/)?.[1] ?? ""
  );
}

export async function detectSubmissionSafety(
  metadata: PortalFileMetadata
): Promise<SubmissionSafetyResult> {
  const reasons: string[] = [];
  const extension = extensionOf(metadata.fileName);

  try {
    const bytes = await readPortalFileBytes(metadata.gridFsId);
    validateUpload({
      fileName: metadata.fileName,
      mimeType: metadata.mimeType,
      byteLength: metadata.byteLength,
      bytes,
    });

    if (!safeAutoPublishExtensions.has(extension)) {
      reasons.push(
        "This document format needs administrator review before publication."
      );
    }

    const sample = bytes.subarray(0, 512 * 1024).toString("latin1");
    if (suspiciousContentPattern.test(sample)) {
      reasons.push(
        "The file contains active or executable-looking content and was held for review."
      );
    }
    if (extension === "pdf" && activePdfPattern.test(sample)) {
      reasons.push(
        "The PDF contains an active-content marker and was held for review."
      );
    }
  } catch {
    reasons.push(
      "The safety scan could not verify this file, so administrator review is required."
    );
  }

  return {
    decision: reasons.length ? "admin_review" : "auto_publish",
    reasons,
  };
}

export async function detectSubmissionSafetyByFileId(fileId: string) {
  const metadata = await portalFileById(fileId);
  if (!metadata) {
    return {
      decision: "admin_review" as const,
      reasons: ["The uploaded file could not be verified safely."],
    };
  }
  return detectSubmissionSafety(metadata);
}
