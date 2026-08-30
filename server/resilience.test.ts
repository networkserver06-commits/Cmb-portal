import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { isStaleAssetError } from "../client/src/lib/staleAssetRecovery";

const projectRoot = path.resolve(import.meta.dirname, "..");

function readProjectFile(relativePath: string) {
  return fs.readFileSync(path.join(projectRoot, relativePath), "utf8");
}

describe("sharing and deployment resilience", () => {
  it("uses the existing ScholarShelf home visual for social previews", () => {
    const html = readProjectFile("client/index.html");
    expect(html).toContain(
      "https://portal.leetec.online/scholarshelf-home-share-preview.jpg"
    );
    expect(html).toContain('name="twitter:card" content="summary_large_image"');
    expect(html).toContain(
      "ScholarShelf is a trusted learning resource library"
    );
  });

  it("shows a user-facing offline and reconnecting state", () => {
    const source = readProjectFile("client/src/components/NetworkStatus.tsx");
    expect(source).toContain("You’re offline");
    expect(source).toContain("Connection restored");
    expect(source).toContain('addEventListener("offline"');
    expect(source).toContain('addEventListener("online"');
  });

  it("recognizes common stale lazy-module failures", () => {
    expect(
      isStaleAssetError(
        new TypeError(
          "Failed to fetch dynamically imported module: https://portal.leetec.online/assets/Account-DHm7bpPh.js"
        )
      )
    ).toBe(true);
    expect(isStaleAssetError(new Error("The page could not be loaded"))).toBe(
      false
    );
  });

  it("omits unresolved analytics placeholders from the SPA shell", () => {
    const html = readProjectFile("client/index.html");
    const mainSource = readProjectFile("client/src/main.tsx");
    expect(html).not.toContain("%VITE_ANALYTICS_ENDPOINT%");
    expect(html).not.toContain("%VITE_ANALYTICS_WEBSITE_ID%");
    expect(mainSource).toContain("installOptionalAnalytics();");
    expect(mainSource).toContain("VITE_ANALYTICS_ENDPOINT");
    expect(mainSource).toContain("VITE_ANALYTICS_WEBSITE_ID");
  });

  it("sandboxes HTML document responses", () => {
    const fileStoreSource = readProjectFile("server/fileStore.ts");
    expect(fileStoreSource).toContain('"text/html", "application/xhtml+xml"');
    expect(fileStoreSource).toContain("Content-Security-Policy");
    expect(fileStoreSource).toContain("sandbox; default-src 'none'");
  });

  it("installs guarded recovery and keeps the SPA shell fresh", () => {
    const appSource = readProjectFile("client/src/main.tsx");
    const boundarySource = readProjectFile(
      "client/src/components/ErrorBoundary.tsx"
    );
    const vercel = readProjectFile("vercel.json");
    expect(appSource).toContain("installStaleAssetRecovery();");
    expect(boundarySource).toContain("markAssetRecoveryAttempt");
    expect(boundarySource).toContain("ScholarShelf needs a quick refresh.");
    expect(vercel).toContain('"Cache-Control"');
    expect(vercel).toContain("no-store, no-cache, must-revalidate");
  });
});
