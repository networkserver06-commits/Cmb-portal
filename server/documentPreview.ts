import { officePreviewFileType, renderOfficePreview } from "./officePreview";

export const PUBLIC_PREVIEW_CHARACTERS = 2400;

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
  if (normalizedMime === "application/pdf" || normalizedMime.endsWith("+pdf"))
    return await extractPdfFirstPage(input.bytes);

  if (
    normalizedMime.startsWith("text/") ||
    normalizedMime === "application/csv" ||
    normalizedMime === "application/json"
  ) {
    return {
      excerpt: limitPreview(input.bytes.toString("utf8")),
      scope: "Opening excerpt",
    };
  }

  if (officePreviewFileType(normalizedMime, input.fileName)) {
    const rendered = await renderOfficePreview(input);
    const text = rendered ? htmlToPreviewText(rendered.html) : "";
    return {
      excerpt: limitPreview(text),
      scope: "Opening excerpt",
    };
  }

  return {
    excerpt:
      "A preview is available after purchase for this file format. Review the document details and unlock it to read the complete resource.",
    scope: "Limited preview",
  };
}
