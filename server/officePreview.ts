import type { SupportedFileType } from "officeparser";

const officeMimeTypes: Record<string, SupportedFileType> = {
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    "docx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation":
    "pptx",
  "application/vnd.oasis.opendocument.text": "odt",
  "application/vnd.oasis.opendocument.presentation": "odp",
  "application/vnd.oasis.opendocument.spreadsheet": "ods",
  "application/rtf": "rtf",
  "text/rtf": "rtf",
  "application/epub+zip": "epub",
};

const officeExtensions: Record<string, SupportedFileType> = {
  docx: "docx",
  xlsx: "xlsx",
  pptx: "pptx",
  odt: "odt",
  odp: "odp",
  ods: "ods",
  rtf: "rtf",
  epub: "epub",
};

export function officePreviewFileType(
  mimeType: string,
  fileName: string
): SupportedFileType | null {
  const normalizedMimeType = mimeType.split(";", 1)[0].trim().toLowerCase();
  if (officeMimeTypes[normalizedMimeType])
    return officeMimeTypes[normalizedMimeType];
  const extension = fileName.toLowerCase().split(".").pop() ?? "";
  return officeExtensions[extension] ?? null;
}

export async function renderOfficePreview(input: {
  bytes: Buffer;
  fileName: string;
  mimeType: string;
}) {
  const fileType = officePreviewFileType(input.mimeType, input.fileName);
  if (!fileType) return null;
  const { OfficeParser } = await import("officeparser");
  const ast = await OfficeParser.parseOffice(input.bytes, {
    fileType,
    extractAttachments: false,
    ignoreComments: true,
    ignoreNotes: true,
  });
  const html = await ast.to("html", {
    includeFormatting: true,
    htmlConfig: { containerWidth: "100%" },
  });
  return { fileType, html: String(html.value) };
}
