export const MAX_PORTAL_UPLOAD_BYTES = 4 * 1024 * 1024;

const extensions = new Set(["pdf", "doc", "docx", "ppt", "pptx", "txt", "csv"]);

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

export function validatePortalDocument(
  file: File,
  purpose: "submission" | "paper"
) {
  if (!extensions.has(extensionOf(file.name)))
    return "Use a PDF, DOC, DOCX, PPT, PPTX, TXT, or CSV document.";
  if (file.size < 1) return "Select a non-empty document.";
  if (file.size > MAX_PORTAL_UPLOAD_BYTES)
    return "Files must be 4 MiB or smaller for reliable uploads.";
  return null;
}

export async function uploadPortalDocument(input: {
  file: File;
  purpose: "submission" | "paper";
  onProgress?: (percent: number) => void;
}) {
  const validationError = validatePortalDocument(input.file, input.purpose);
  if (validationError) throw new Error(validationError);
  return await new Promise<{
    fileId: string;
    fileName: string;
    mimeType: string;
    byteLength: number;
  }>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", "/api/files/upload");
    request.withCredentials = true;
    request.setRequestHeader("Content-Type", "application/octet-stream");
    request.setRequestHeader(
      "x-file-name",
      encodeURIComponent(input.file.name)
    );
    request.setRequestHeader(
      "x-file-type",
      input.file.type || "application/octet-stream"
    );
    request.setRequestHeader("x-file-purpose", input.purpose);
    request.upload.onprogress = event => {
      if (event.lengthComputable)
        input.onProgress?.(
          Math.min(
            99,
            Math.max(1, Math.round((event.loaded / event.total) * 100))
          )
        );
    };
    request.onerror = () =>
      reject(new Error("Network error while uploading the document."));
    request.onload = () => {
      if (request.status < 200 || request.status >= 300)
        return reject(new Error(messageFromResponse(request.responseText)));
      try {
        const response = JSON.parse(request.responseText) as {
          fileId?: string;
          fileName?: string;
          mimeType?: string;
          byteLength?: number;
        };
        if (
          !response.fileId ||
          !response.fileName ||
          !response.mimeType ||
          !Number.isFinite(response.byteLength)
        )
          throw new Error("The server did not return valid file metadata.");
        input.onProgress?.(100);
        resolve({
          fileId: response.fileId,
          fileName: response.fileName,
          mimeType: response.mimeType,
          byteLength: Number(response.byteLength),
        });
      } catch (error) {
        reject(
          error instanceof Error
            ? error
            : new Error("The server returned an invalid upload response.")
        );
      }
    };
    request.send(input.file);
  });
}
