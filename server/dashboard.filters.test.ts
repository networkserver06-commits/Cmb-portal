import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { filterAndSortLibrary } from "../client/src/lib/libraryFilters";

const oldDate = new Date("2026-08-20T10:00:00.000Z");
const newDate = new Date("2026-08-25T10:00:00.000Z");

const items = [
  {
    paper: {
      title: "Business Law Revision",
      course: "Commerce",
      unit: "BLW 204",
      level: "university",
      cycle: "2025",
      fileName: "business-law.pdf",
    },
    entitlement: { grantedAt: oldDate },
  },
  {
    paper: {
      title: "Accounting Principles",
      course: "Finance",
      unit: "ACC 101",
      level: "college",
      cycle: "2026",
      fileName: "accounting.pdf",
    },
    entitlement: { grantedAt: newDate },
  },
  {
    paper: {
      title: "Chemistry Practical",
      course: "Science",
      unit: "CHEM 110",
      level: "university",
      cycle: "2024",
      fileName: "chemistry.pdf",
    },
    entitlement: { grantedAt: newDate },
  },
  {
    paper: null,
    entitlement: { grantedAt: newDate },
  },
];

describe("dashboard library filtering and sorting", () => {
  it("searches across title and metadata while excluding missing papers", () => {
    expect(filterAndSortLibrary(items, { query: "acc 101" }).map(item => item.paper?.title)).toEqual([
      "Accounting Principles",
    ]);
    expect(filterAndSortLibrary(items, { query: "chemistry.pdf" }).map(item => item.paper?.title)).toEqual([
      "Chemistry Practical",
    ]);
    expect(filterAndSortLibrary(items).map(item => item.paper?.title)).toHaveLength(3);
  });

  it("filters by education level and supports title sorting", () => {
    expect(
      filterAndSortLibrary(items, { level: "university", sort: "title" }).map(item => item.paper?.title)
    ).toEqual(["Business Law Revision", "Chemistry Practical"]);
    expect(filterAndSortLibrary(items, { query: "missing" })).toEqual([]);
  });

  it("sorts recent and oldest entries predictably with stable ties", () => {
    expect(filterAndSortLibrary(items, { sort: "recent" }).map(item => item.paper?.title)).toEqual([
      "Accounting Principles",
      "Chemistry Practical",
      "Business Law Revision",
    ]);
    expect(filterAndSortLibrary(items, { sort: "oldest" }).map(item => item.paper?.title)).toEqual([
      "Business Law Revision",
      "Accounting Principles",
      "Chemistry Practical",
    ]);
  });

  it("exposes accessible search, filter, sort, and no-match controls on the dashboard", () => {
    const source = readFileSync(
      new URL("../client/src/pages/Account.tsx", import.meta.url),
      "utf8"
    );
    expect(source).toContain('aria-label="Search unlocked papers"');
    expect(source).toContain('aria-label="Filter by education level"');
    expect(source).toContain('aria-label="Sort unlocked papers"');
    expect(source).toContain('aria-label="Clear library filters"');
    expect(source).toContain("No unlocked papers match these filters.");
    expect(source).toContain('role="status" aria-live="polite"');
  });
});
