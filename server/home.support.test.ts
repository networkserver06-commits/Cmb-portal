import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("homepage support and credit surfaces", () => {
  const homeSource = readFileSync(
    resolve(process.cwd(), "client/src/pages/Home.tsx"),
    "utf8"
  );
  const routerSource = readFileSync(
    resolve(process.cwd(), "server/routers.ts"),
    "utf8"
  );
  const indexSource = readFileSync(
    resolve(process.cwd(), "client/index.html"),
    "utf8"
  );

  it("keeps an accessible WhatsApp support link for the configured number", () => {
    expect(homeSource).toContain("https://wa.me/254116553618");
    expect(homeSource).toContain(
      "Contact ScholarShelf support on WhatsApp at plus 254 116 553 618"
    );
    expect(homeSource).toContain('target="_blank"');
    expect(homeSource).toContain('rel="noreferrer"');
  });

  it("uses the broader Elite Resources public identity", () => {
    expect(indexSource).toContain("ScholarShelf · Elite Resources");
    expect(indexSource).toContain(
      "Elite examination resources for focused revision"
    );
    expect(indexSource).not.toContain("CDACC resources");
  });

  it("keeps the Lee Tech attribution in the public footer", () => {
    expect(homeSource).toContain("Powered by");
    expect(homeSource).toContain("Lee Tech");
  });

  it("keeps the role-aware View dashboard action visible for authenticated users", () => {
    expect(homeSource).toContain("View dashboard");
    expect(homeSource).toContain(
      'user?.role === "admin" ? "/admin" : "/account"'
    );
    expect(homeSource).toContain(
      'href={user?.role === "admin" ? "/admin" : "/account"}'
    );
  });

  it("keeps direct login and create-account actions visible from the homepage", () => {
    expect(homeSource).toContain('href="/login"');
    expect(homeSource).toContain('href="/create-account"');
    expect(homeSource).toContain("Ready to begin?");
    expect(homeSource).toContain("Sign in");
    expect(homeSource).toContain("Create account");
  });

  it("offers visitors direct full-paper access for Free resources", () => {
    expect(homeSource).toContain("publicPaperHref");
    expect(homeSource).toContain("View free paper");
    expect(homeSource).toContain("View full paper");
    expect(homeSource).toContain(
      "No account is required for Free access."
    );
  });

  it("keeps free posts out of paid checkout and adds them to the student library", () => {
    expect(homeSource).toContain("claimFreePaper");
    expect(homeSource).toContain('paper.accessMode === "free"');
    expect(homeSource).toContain("Add to library");
    expect(homeSource).toContain("Paper details");
    expect(homeSource).toContain("Buy securely");
    expect(homeSource).toContain("setSelectedPaperId(paper.id)");
    expect(routerSource).toContain("claimFreePaper: protectedProcedure");
    expect(routerSource).toContain('source: "free"');
    expect(routerSource).toContain(
      "This paper is free and does not require payment"
    );
  });

  it("does not ship hardcoded paper fixtures or sample paper prices", () => {
    expect(homeSource).not.toContain("const papers = [");
    expect(homeSource).not.toContain("Communication Skills");
    expect(homeSource).not.toContain("KES 180");
    expect(homeSource).toContain(
      "No papers are published yet. Check back soon."
    );
  });
});
