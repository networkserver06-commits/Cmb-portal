import { describe, expect, it } from "vitest";
import {
  buildLimitedDocumentPreview,
  htmlToPreviewText,
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
    expect(result.excerpt.length).toBeLessThanOrEqual(PUBLIC_PREVIEW_CHARACTERS + 1);
    expect(result.excerpt).not.toContain("opening ".repeat(400));
  });
});
