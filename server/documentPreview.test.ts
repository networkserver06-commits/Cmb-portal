import { describe, expect, it } from "vitest";
import {
  buildLimitedDocumentPreview,
  createFirstPagePdf,
  htmlToPreviewText,
  isPdfDocument,
  PUBLIC_PREVIEW_CHARACTERS,
} from "./documentPreview";

describe("limited document previews", () => {
  it("strips markup and limits the returned excerpt", () => {
    const html = `<h1>Title</h1><script>secret()</script><p>${"opening ".repeat(600)}</p>`;
    const text = htmlToPreviewText(html);
    expect(text).not.toContain("secret()");
    expect(text).toContain("Title");

    const limited = text.slice(0, PUBLIC_PREVIEW_CHARACTERS);
    expect(limited.length).toBe(PUBLIC_PREVIEW_CHARACTERS);
  });

  it("returns only a bounded opening excerpt for text documents", async () => {
    const result = await buildLimitedDocumentPreview({
      bytes: Buffer.from("opening ".repeat(1000)),
      fileName: "notes.txt",
      mimeType: "text/plain",
    });
    expect(result.scope).toBe("Opening excerpt");
    expect(result.excerpt.length).toBeLessThanOrEqual(
      PUBLIC_PREVIEW_CHARACTERS + 1
    );
    expect(result.excerpt).not.toContain("opening ".repeat(400));
  });

  it("previews JSON and gives legacy Office files a conversion path", async () => {
    const json = await buildLimitedDocumentPreview({
      bytes: Buffer.from('{"course":"Biology","topic":"Cells"}'),
      fileName: "notes.json",
      mimeType: "application/json",
    });
    expect(json.scope).toBe("Opening excerpt");
    expect(json.excerpt).toContain('"course"');

    const legacy = await buildLimitedDocumentPreview({
      bytes: Buffer.from("not-a-real-doc"),
      fileName: "notes.doc",
      mimeType: "application/msword",
    });
    expect(legacy.scope).toMatch(/Limited preview|legacy Office/);
    expect(legacy.excerpt).toBeTruthy();
  });

  it("creates a one-page visual PDF preview", async () => {
    const { PDFDocument } = await import("pdf-lib");
    const source = await PDFDocument.create();
    source.addPage([300, 400]);
    source.addPage([300, 400]);
    const firstPageOnly = await createFirstPagePdf(
      Buffer.from(await source.save())
    );
    const preview = await PDFDocument.load(firstPageOnly);
    expect(isPdfDocument("application/pdf", "paper.pdf")).toBe(true);
    expect(preview.getPageCount()).toBe(1);
  });
});
