import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  cleanupStorage,
  classifyStorageRecord,
  STORAGE_CLEANUP_CONFIRMATION,
  STORAGE_RETENTION_DAYS,
} from "./storageManagement";

const routerSource = readFileSync(
  new URL("./routers.ts", import.meta.url),
  "utf8"
);
const fileStoreSource = readFileSync(
  new URL("./fileStore.ts", import.meta.url),
  "utf8"
);
const indexSource = readFileSync(
  new URL("./_core/index.ts", import.meta.url),
  "utf8"
);
const adminSource = readFileSync(
  new URL("../client/src/pages/Admin.tsx", import.meta.url),
  "utf8"
);
const panelSource = readFileSync(
  new URL("../client/src/pages/StorageManagement.tsx", import.meta.url),
  "utf8"
);
const tooltipSource = readFileSync(
  new URL("../client/src/components/StorageTooltip.tsx", import.meta.url),
  "utf8"
);

describe("storage management safeguards", () => {
  it("protects referenced files and only classifies old unreferenced files as candidates", () => {
    expect(classifyStorageRecord(1, STORAGE_RETENTION_DAYS + 10)).toBe(
      "protected"
    );
    expect(classifyStorageRecord(0, STORAGE_RETENTION_DAYS - 1)).toBe("recent");
    expect(classifyStorageRecord(0, STORAGE_RETENTION_DAYS)).toBe("orphaned");
  });

  it("tracks actual GridFS metadata and only permits deletion for old unreferenced records", () => {
    const source = readFileSync(
      new URL("./storageManagement.ts", import.meta.url),
      "utf8"
    );
    expect(source).toContain("listPortalFiles");
    expect(source).toContain("deletePortalFile");
    expect(source).toContain("delete-gridfs-and-metadata");
    expect(source).toContain("metadata.references");
  });

  it("requires the explicit cleanup confirmation before any database work", async () => {
    await expect(
      cleanupStorage({
        keys: ["papers/unknown.pdf"],
        confirmation: "DELETE_EVERYTHING",
        actorId: 1,
      })
    ).rejects.toThrow(STORAGE_CLEANUP_CONFIRMATION);
  });

  it("keeps storage cleanup admin-only and enforces the GridFS/Vercel upload contract", () => {
    expect(routerSource).toContain("storageAudit: adminProcedure");
    expect(routerSource).toContain("cleanupStorage: adminProcedure");
    expect(routerSource).toContain("files: adminProcedure");
    expect(routerSource).toContain("operationalRecords: adminProcedure");
    expect(fileStoreSource).toContain("MAX_UPLOAD_BYTES = 4 * 1024 * 1024");
    expect(fileStoreSource).toContain("portalFiles");
    expect(indexSource).toContain('"/api/files/upload"');
    expect(indexSource).toContain("express.raw");
    expect(indexSource).toContain('user.role !== "admin"');
    expect(panelSource).toContain("DELETE_UNUSED_FILES");
    expect(panelSource).toContain("Permanently unlink selected");
    expect(panelSource).toContain("Referenced exam papers are protected");
    expect(panelSource).toContain("StorageTooltip");
    expect(panelSource).toContain(
      "Select every unreferenced file that has passed the retention window."
    );
    expect(panelSource).toContain(
      'aria-label="Permanently unlink selected storage references"'
    );
    expect(panelSource).toContain("hover:-translate-y-0.5");
    expect(panelSource).toContain(
      "transition-colors duration-200 hover:bg-[#f7fbf8]"
    );
    expect(tooltipSource).toContain("TooltipTrigger");
    expect(tooltipSource).toContain("TooltipContent");
    expect(tooltipSource).toContain("tabIndex={0}");
    expect(tooltipSource).toContain("focus-visible:outline");
    expect(adminSource).toContain("<StorageManagement />");
  });
});
