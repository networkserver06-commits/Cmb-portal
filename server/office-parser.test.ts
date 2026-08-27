import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { OfficeParser } from "officeparser";
import { officePreviewFileType, renderOfficePreview } from "./officePreview";

function createDocxFixture() {
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;
  const relationships = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;
  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>ScholarShelf DOCX preview</w:t></w:r></w:p>
    <w:p><w:r><w:t>Visitors can read this document inside the portal.</w:t></w:r></w:p>
  </w:body>
</w:document>`;
  return zipSync({
    "[Content_Types].xml": strToU8(contentTypes),
    "_rels/.rels": strToU8(relationships),
    "word/document.xml": strToU8(document),
  });
}

describe("office document rendering", () => {
  it("parses DOCX bytes and generates readable HTML", async () => {
    const ast = await OfficeParser.parseOffice(createDocxFixture(), {
      fileType: "docx",
    });
    const html = await ast.to("html", {
      includeFormatting: true,
      htmlConfig: { containerWidth: "100%" },
    });

    expect(ast.type).toBe("docx");
    expect(String(html.value)).toContain("ScholarShelf DOCX preview");
    expect(String(html.value)).toContain(
      "Visitors can read this document inside the portal."
    );
  });

  it("converts the server preview using MIME or filename detection", async () => {
    expect(
      officePreviewFileType("application/octet-stream", "revision.docx")
    ).toBe("docx");
    expect(officePreviewFileType("application/msword", "revision.doc")).toBe(
      null
    );

    const preview = await renderOfficePreview({
      bytes: createDocxFixture(),
      fileName: "revision.docx",
      mimeType: "application/octet-stream",
    });
    expect(preview?.fileType).toBe("docx");
    expect(preview?.html).toContain("ScholarShelf DOCX preview");
  });

  it("rejects malformed DOCX bytes instead of returning executable markup", async () => {
    await expect(
      OfficeParser.parseOffice(new Uint8Array([1, 2, 3, 4]), {
        fileType: "docx",
      })
    ).rejects.toBeDefined();
  });
});
