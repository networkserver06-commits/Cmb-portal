import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
const legacyOfficeExtensions = new Set(["doc", "xls", "ppt"]);

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

/** Convert legacy binary Office files to a bounded plain-text preview. */
export async function renderLegacyOfficeText(input: {
  bytes: Buffer;
  fileName: string;
}) {
  const extension = input.fileName.toLowerCase().split(".").pop() ?? "";
  if (!legacyOfficeExtensions.has(extension)) return null;
  const directory = await mkdtemp(join(tmpdir(), "scholarshelf-preview-"));
  const sourcePath = join(directory, `document.${extension}`);
  const outputPath = join(directory, "document.txt");
  try {
    await writeFile(sourcePath, input.bytes, { mode: 0o600 });
    await new Promise<void>((resolve, reject) => {
      const child = spawn(
        "libreoffice",
        [
          "--headless",
          "--nologo",
          "--nodefault",
          "--nofirststartwizard",
          "--convert-to",
          "txt:Text",
          "--outdir",
          directory,
          sourcePath,
        ],
        {
          env: { ...process.env, HOME: directory },
          stdio: ["ignore", "ignore", "ignore"],
        }
      );
      const timeout = setTimeout(() => {
        child.kill("SIGKILL");
        reject(new Error("Legacy Office preview timed out."));
      }, 15_000);
      child.once("error", error => {
        clearTimeout(timeout);
        reject(error);
      });
      child.once("exit", code => {
        clearTimeout(timeout);
        code === 0
          ? resolve()
          : reject(new Error("Legacy Office preview conversion failed."));
      });
    });
    return (await readFile(outputPath, "utf8")).trim();
  } finally {
    await rm(directory, { recursive: true, force: true }).catch(
      () => undefined
    );
  }
}
