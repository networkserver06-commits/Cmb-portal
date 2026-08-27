import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const serverSource = readFileSync(
  new URL("./_core/index.ts", import.meta.url),
  "utf8"
);
const fileStoreSource = readFileSync(
  new URL("./fileStore.ts", import.meta.url),
  "utf8"
);
const routerSource = readFileSync(
  new URL("./routers.ts", import.meta.url),
  "utf8"
);
const adminSource = readFileSync(
  new URL("../client/src/pages/AdminOperations.tsx", import.meta.url),
  "utf8"
);
const adminDashboardSource = readFileSync(
  new URL("../client/src/pages/Admin.tsx", import.meta.url),
  "utf8"
);
const storageSource = readFileSync(
  new URL("../client/src/pages/StorageManagement.tsx", import.meta.url),
  "utf8"
);
const adminControlsSource = readFileSync(
  new URL("../client/src/pages/AdminControls.tsx", import.meta.url),
  "utf8"
);
const accountSource = readFileSync(
  new URL("../client/src/pages/Account.tsx", import.meta.url),
  "utf8"
);
const librarySource = readFileSync(
  new URL("../client/src/pages/Library.tsx", import.meta.url),
  "utf8"
);
const publishSource = readFileSync(
  new URL("../client/src/pages/PublishPaper.tsx", import.meta.url),
  "utf8"
);
const homeSource = readFileSync(
  new URL("../client/src/pages/Home.tsx", import.meta.url),
  "utf8"
);
const appSource = readFileSync(
  new URL("../client/src/App.tsx", import.meta.url),
  "utf8"
);
const publicViewerSource = readFileSync(
  new URL("../client/src/pages/PublicPaperViewer.tsx", import.meta.url),
  "utf8"
);

describe("protected document viewing and rejection cleanup", () => {
  it("registers inline and attachment routes with authenticated access checks", () => {
    expect(serverSource).toContain('app.get("/api/files/:fileId/download"');
    expect(serverSource).toContain('app.get("/api/files/:fileId/view"');
    expect(serverSource).toContain('app.get("/api/papers/:paperId/download"');
    expect(serverSource).toContain('app.get("/api/papers/:paperId/view"');
    expect(serverSource).toContain(
      'status(401).json({ error: "Authentication required" })'
    );
    expect(serverSource).toMatch(
      /status\(403\)[\s\S]*You do not have access to this file/
    );
    expect(serverSource).toContain('disposition === "inline"');
    expect(fileStoreSource).toContain('options.disposition ?? "attachment"');
    expect(fileStoreSource).toContain('"Content-Disposition"');
    expect(fileStoreSource).toContain('"Cache-Control", "private, no-store"');
  });

  it("exposes a public reader only for active zero-priced Free papers", () => {
    expect(serverSource).toContain(
      'app.get("/api/papers/:paperId/free-view", handlePublicFreePaper)'
    );
    expect(serverSource).toContain('paper.accessMode !== "free"');
    expect(serverSource).toContain("Number(paper.priceKes) !== 0");
    expect(serverSource).toContain("!paper?.isAvailable");
    expect(homeSource).toContain("publicPaperHref");
    expect(homeSource).toContain("View free paper");
    expect(homeSource).toContain("View full paper");
    expect(appSource).toContain('path={"/paper/:paperId"}');
    expect(publicViewerSource).toContain(
      "No account required to read this resource."
    );
    expect(publicViewerSource).toContain(
      "/api/papers/${publicPaper.legacyId}/free-view"
    );
    expect(publicViewerSource).toContain("pdfjsLib.getDocument({ url: href })");
    expect(publicViewerSource).toContain("Opening every page…");
    expect(publicViewerSource).toContain("Open separately");
    expect(publicViewerSource).toContain("Open document separately");
    expect(publicViewerSource).not.toContain("<iframe");
  });

  it("keeps file access scoped to administrators, owners, active submissions, and entitlements", () => {
    expect(serverSource).toContain(
      'user.role === "admin" || file.ownerId === user.id'
    );
    expect(serverSource).toContain(
      "findOne({ fileId: file.gridFsId, isAvailable: true })"
    );
    expect(serverSource).toContain('status: { $ne: "rejected" }');
    expect(serverSource).toContain("entitlementFor(user.id, paper.legacyId)");
  });

  it("exposes view actions to administrators and authorized students", () => {
    expect(adminSource).toContain("View document");
    expect(adminSource).toContain(
      "/api/files/${encodeURIComponent(submission.fileId)}/view"
    );
    expect(adminDashboardSource).toContain("View document");
    expect(adminDashboardSource).toContain(
      "/api/files/${encodeURIComponent(paper.fileId)}/view"
    );
    expect(storageSource).toContain("View document");
    expect(storageSource).toContain(
      "/api/files/${encodeURIComponent(item.key)}/view"
    );
    expect(adminSource).toContain("Reject & purge");
    expect(adminControlsSource).toContain(
      "trpc.admin.setAvailability.useMutation"
    );
    expect(adminControlsSource).toContain("isAvailable: !item.isAvailable");
    expect(adminControlsSource).toContain(
      'item.isAvailable ? "Live" : "Paused"'
    );
    expect(accountSource).toContain("/api/papers/${item.paper!.legacyId}/view");
    expect(accountSource).toContain(
      "/api/files/${encodeURIComponent(submission.fileId)}/view"
    );
    expect(librarySource).toContain("/api/papers/${item.paper!.legacyId}/view");
  });

  it("keeps the upload station compact and actionable on mobile", () => {
    expect(adminControlsSource).toContain(
      "lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]"
    );
    expect(adminControlsSource).toContain(
      'aria-label="Remove selected document"'
    );
    expect(adminControlsSource).toContain("Ready");
    expect(adminControlsSource).toContain("View document");
    expect(adminControlsSource).toContain("No catalogue resources yet");
    expect(adminControlsSource).toContain(
      "Learners can open this resource without payment."
    );
  });

  it("documents the detector result and keeps student submission messaging accurate", () => {
    expect(publishSource).toContain(
      'result.publication.status === "published"'
    );
    expect(publishSource).toContain("published in the free catalogue");
    expect(publishSource).toContain("held for administrator review");
    expect(routerSource).toContain("detectSubmissionSafety(file)");
    expect(routerSource).toContain(
      'safetyStatus: automaticallyPublished ? "passed" : "held"'
    );
    expect(routerSource).toContain("status: automaticallyPublished ?");
    expect(routerSource).toContain('"approved" as const');
    expect(routerSource).toContain('"pending" as const');
  });

  it("purges rejected files before recording rejection and preserves moderation history", () => {
    expect(fileStoreSource).toContain(
      "export async function purgeRejectedPortalFile"
    );
    expect(fileStoreSource).toContain('status: "rejected:purged"');
    expect(routerSource).toContain("await purgeRejectedPortalFile");
    expect(routerSource).toContain("storagePurged: Boolean(purgedFileId)");
    expect(routerSource).toContain(
      "Published contributions cannot be rejected"
    );
    expect(adminSource).toMatch(
      /rejected document bytes are permanently purged from\s+GridFS/
    );
  });
});
