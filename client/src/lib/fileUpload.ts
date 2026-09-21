export const MAX_PORTAL_UPLOAD_BYTES = 250 * 1024 * 1024;
export const PORTAL_UPLOAD_CHUNK_BYTES = 3.5 * 1024 * 1024;

const extensions = new Set([
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
]);

function extensionOf(fileName: string) {
  return fileName.toLowerCase().split(".").pop() ?? "";
}

function messageFromResponse(responseText: string) {
  try {
    const payload = JSON.parse(responseText) as { error?: string };
    return payload.error ?? "The upload could not be completed.";
  } catch {
    return "The upload could not be completed.";
  }
}

async function jsonRequest<T>(url: string, init: RequestInit) {
  const response = await fetch(url, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...init.headers },
  });
  const text = await response.text();
  if (!response.ok) throw new Error(messageFromResponse(text));
  return JSON.parse(text) as T;
}

async function sendChunkWithRetry(
  uploadId: string,
  index: number,
  chunk: Blob,
  onProgress: (loaded: number) => void
) {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch("/api/files/upload/chunk", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/octet-stream",
          "x-upload-id": uploadId,
          "x-chunk-index": String(index),
        },
        body: chunk,
      });
      const text = await response.text();
      if (!response.ok) throw new Error(messageFromResponse(text));
      onProgress(chunk.size);
      return;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("Chunk upload failed.");
      if (attempt < 3)
        await new Promise(resolve => setTimeout(resolve, 500 * 2 ** attempt));
    }
  }
  throw lastError ?? new Error("Chunk upload failed.");
}

export function validatePortalDocument(
  file: File,
  _purpose: "submission" | "paper"
) {
  if (!extensions.has(extensionOf(file.name)))
    return "Use a PDF, Word, Excel, PowerPoint, OpenDocument, RTF, EPUB, Markdown, HTML, TXT, or CSV document.";
  if (file.size < 1) return "Select a non-empty document.";
  if (file.size > MAX_PORTAL_UPLOAD_BYTES)
    return "Files must be 250 MiB or smaller.";
  return null;
}

export async function uploadPortalDocument(input: {
  file: File;
  purpose: "submission" | "paper";
  onProgress?: (percent: number) => void;
}) {
  const validationError = validatePortalDocument(input.file, input.purpose);
  if (validationError) throw new Error(validationError);
  const totalChunks = Math.ceil(input.file.size / PORTAL_UPLOAD_CHUNK_BYTES);
  const initialized = await jsonRequest<{
    uploadId: string;
    chunkSize: number;
  }>("/api/files/upload/init", {
    method: "POST",
    body: JSON.stringify({
      purpose: input.purpose,
      fileName: input.file.name,
      mimeType: input.file.type || "application/octet-stream",
      totalBytes: input.file.size,
      totalChunks,
    }),
  });
  let uploadedBytes = 0;
  const chunkSize = initialized.chunkSize || PORTAL_UPLOAD_CHUNK_BYTES;
  let nextIndex = 0;
  const worker = async () => {
    while (nextIndex < totalChunks) {
      const index = nextIndex++;
      const start = index * chunkSize;
      const chunk = input.file.slice(
        start,
        Math.min(input.file.size, start + chunkSize)
      );
      await sendChunkWithRetry(initialized.uploadId, index, chunk, loaded => {
        uploadedBytes += loaded;
        input.onProgress?.(
          Math.min(99, Math.round((uploadedBytes / input.file.size) * 100))
        );
      });
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(3, totalChunks) }, () => worker())
  );
  const response = await jsonRequest<{
    fileId?: string;
    fileName?: string;
    mimeType?: string;
    byteLength?: number;
  }>("/api/files/upload/complete", {
    method: "POST",
    body: JSON.stringify({ uploadId: initialized.uploadId }),
  });
  if (
    !response.fileId ||
    !response.fileName ||
    !response.mimeType ||
    !Number.isFinite(response.byteLength)
  )
    throw new Error("The server did not return valid file metadata.");
  input.onProgress?.(100);
  return {
    fileId: response.fileId,
    fileName: response.fileName,
    mimeType: response.mimeType,
    byteLength: Number(response.byteLength),
  };
}
