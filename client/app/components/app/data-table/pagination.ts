export type PageItem = { kind: "page"; page: number } | { kind: "gap" };

/**
 * Up to seven slots: first, last, a window around the current page, and a gap
 * marker where pages are skipped. `1 … 4 5 6 … 50`, never more.
 */
export function pageItems(page: number, pages: number): PageItem[] {
  if (pages <= 7) {
    return Array.from({ length: pages }, (_, i) => ({ kind: "page", page: i + 1 }));
  }
  const start = Math.max(2, Math.min(page - 1, pages - 4));
  const end = Math.min(pages - 1, Math.max(page + 1, 5));
  const items: PageItem[] = [{ kind: "page", page: 1 }];
  if (start > 2) items.push({ kind: "gap" });
  for (let i = start; i <= end; i++) items.push({ kind: "page", page: i });
  if (end < pages - 1) items.push({ kind: "gap" });
  items.push({ kind: "page", page: pages });
  return items;
}
