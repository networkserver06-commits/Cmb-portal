export type DashboardLibraryPaper = {
  title?: string | null;
  course?: string | null;
  unit?: string | null;
  level?: string | null;
  cycle?: string | null;
  fileName?: string | null;
};

export type DashboardLibraryItem = {
  paper?: DashboardLibraryPaper | null;
  entitlement: {
    grantedAt?: unknown;
  };
};

export type LibrarySort = "recent" | "oldest" | "title";

export type LibraryFilterOptions = {
  query?: string;
  level?: string;
  sort?: LibrarySort;
};

function text(value: unknown) {
  return String(value ?? "").trim();
}

function timestamp(value: unknown) {
  const parsed = value instanceof Date ? value.getTime() : Date.parse(text(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

function searchableText(item: DashboardLibraryItem) {
  const paper = item.paper;
  return [
    paper?.title,
    paper?.course,
    paper?.unit,
    paper?.level,
    paper?.cycle,
    paper?.fileName,
  ]
    .map(text)
    .join(" ")
    .toLocaleLowerCase();
}

export function filterAndSortLibrary<T extends DashboardLibraryItem>(
  items: T[],
  options: LibraryFilterOptions = {}
) {
  const query = text(options.query).toLocaleLowerCase();
  const level = text(options.level);
  const sort = options.sort ?? "recent";

  return items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => {
      if (!item.paper) return false;
      if (level && text(item.paper.level) !== level) return false;
      return !query || searchableText(item).includes(query);
    })
    .sort((left, right) => {
      const leftPaper = left.item.paper;
      const rightPaper = right.item.paper;
      let comparison = 0;
      if (sort === "title") {
        comparison = text(leftPaper?.title).localeCompare(
          text(rightPaper?.title),
          undefined,
          { sensitivity: "base" }
        );
      } else {
        comparison = timestamp(right.item.entitlement.grantedAt) - timestamp(left.item.entitlement.grantedAt);
        if (sort === "oldest") comparison *= -1;
      }
      return comparison || left.index - right.index;
    })
    .map(({ item }) => item);
}
