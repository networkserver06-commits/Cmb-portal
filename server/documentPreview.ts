import {
  officePreviewFileType,
  renderLegacyOfficeText,
  renderOfficePreview,
} from "./officePreview";

export const PUBLIC_PREVIEW_CHARACTERS = 2400;
export const MAX_PREVIEW_SOURCE_BYTES = 128 * 1024 * 1024;

export async function readPreviewResponse(response: Response) {
  if (!response.body) return Buffer.from(await response.arrayBuffer());
  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      const chunk = Buffer.from(part.value);
      total += chunk.byteLength;
      if (total > MAX_PREVIEW_SOURCE_BYTES) {
        await reader.cancel();
        throw new Error(
          "The preview source exceeds the 128 MiB preview limit."
        );
      }
      chunks.push(chunk);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, total);
}

export function isPdfDocument(mimeType: string, fileName: string) {
  const normalizedMime = mimeType.split(";", 1)[0].trim().toLowerCase();
  return (
    normalizedMime === "application/pdf" ||
    normalizedMime.endsWith("+pdf") ||
    fileName.toLowerCase().endsWith(".pdf")
  );
}

export async function createFirstPagePdf(bytes: Buffer) {
  const { PDFDocument } = await import("pdf-lib");
  const source = await PDFDocument.load(bytes, { ignoreEncryption: true });
  if (source.getPageCount() < 1) throw new Error("The PDF has no pages");
  const preview = await PDFDocument.create();
  const [page] = await preview.copyPages(source, [0]);
  preview.addPage(page);
  return Buffer.from(await preview.save({ useObjectStreams: true }));
}

function decodeBasicEntities(value: string) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

export function htmlToPreviewText(html: string) {
  return decodeBasicEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|li|h[1-6]|tr|section|article)>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/[ \t]+/g, " ")
      .replace(/\n\s+/g, "\n")
      .trim()
  );
}

function limitPreview(value: string) {
  const normalized = value.replace(/\r\n/g, "\n").trim();
  if (normalized.length <= PUBLIC_PREVIEW_CHARACTERS) return normalized;
  return `${normalized.slice(0, PUBLIC_PREVIEW_CHARACTERS).trimEnd()}…`;
}

async function extractPdfFirstPage(bytes: Buffer) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const document = await pdfjs.getDocument({
    data: new Uint8Array(bytes),
    useWorkerFetch: false,
    useSystemFonts: true,
  }).promise;
  try {
    const page = await document.getPage(1);
    const content = await page.getTextContent();
    const text = content.items
      .map(item => ("str" in item ? item.str : ""))
      .join(" ");
    return {
      excerpt: limitPreview(text),
      scope: `First page of ${document.numPages} total page${document.numPages === 1 ? "" : "s"}`,
    };
  } finally {
    await (document as any).cleanup?.();
  }
}

export async function buildLimitedDocumentPreview(input: {
  bytes: Buffer;
  fileName: string;
  mimeType: string;
}) {
  const normalizedMime = input.mimeType.split(";", 1)[0].trim().toLowerCase();
  const extension = input.fileName.toLowerCase().split(".").pop() ?? "";
  if (isPdfDocument(normalizedMime, input.fileName)) {
    try {
      const preview = await extractPdfFirstPage(input.bytes);
      return preview.excerpt
        ? preview
        : {
            excerpt:
              "This PDF is image-based, so text cannot be extracted safely in the preview. The first page is available after purchase.",
            scope: "First page protected preview",
          };
    } catch {
      return {
        excerpt:
          "This PDF preview is temporarily limited because its text layer could not be read safely. The complete first page and document are available after purchase.",
        scope: "First page protected preview",
      };
    }
  }

  if (
    normalizedMime.startsWith("text/") ||
    normalizedMime === "application/csv" ||
    normalizedMime === "application/json" ||
    [
      "txt",
      "md",
      "csv",
      "json",
      "xml",
      "yaml",
      "yml",
      "html",
      "htm",
      "log",
      "ini",
      "tex",
    ].includes(extension)
  ) {
    return {
      excerpt: limitPreview(input.bytes.toString("utf8")),
      scope: "Opening excerpt",
    };
  }

  if (officePreviewFileType(normalizedMime, input.fileName)) {
    try {
      const rendered = await renderOfficePreview(input);
      const text = rendered ? htmlToPreviewText(rendered.html) : "";
      return {
        excerpt:
          limitPreview(text) ||
          "The opening excerpt is available after purchase.",
        scope: "Opening excerpt",
      };
    } catch {
      return {
        excerpt:
          "This document’s opening excerpt could not be rendered safely. Unlock the resource to read the complete document.",
        scope: "Limited preview",
      };
    }
  }

  if (["doc", "xls", "ppt"].includes(extension)) {
    try {
      const text = await renderLegacyOfficeText({
        bytes: input.bytes,
        fileName: input.fileName,
      });
      if (text)
        return {
          excerpt: limitPreview(text),
          scope: "Opening excerpt from legacy Office document",
        };
    } catch {
      // Keep the secure generic fallback when LibreOffice is unavailable.
    }
  }

  return {
    excerpt:
      "A preview is available after purchase for this file format. Review the document details and unlock it to read the complete resource.",
    scope: "Limited preview",
  };
}
