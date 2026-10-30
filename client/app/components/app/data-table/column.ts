import type { ReactNode } from "react";

export type SortDir = "asc" | "desc";

/**
 * What kind of value a sortable column holds. Decides the direction a first
 * click lands on (newest / highest first, A–Z for text) and how the Sort menu
 * words the two directions.
 */
export type SortType = "date" | "number" | "text";

export interface ColumnDef<Row> {
  /** Unique within the table; the key under which visibility is remembered. */
  key: string;
  label: string;
  /** Definition shown on hover beside the label (Stock's Available / On hand). */
  headerTooltip?: ReactNode;
  /**
   * Preferred width in px. Columns share the card's width in proportion to
   * it and may shrink to a small floor; only once every column is at its
   * floor does the table scroll sideways.
   */
  width: number;
  /** Hard lower bound in px, for a column that cannot shrink (an inline editor). */
  minWidth?: number;
  align?: "left" | "right";
  /** Server field the column sorts by. Omit for an unsortable column. */
  sortKey?: string;
  sortType?: SortType;
  /** Always visible and sticky on the left. Only the first column should set it. */
  locked?: boolean;
  hiddenByDefault?: boolean;
  /**
   * Cells clip and ellipsize by default. An editor that paints outside its
   * line box (a stepper with a validation message) opts out.
   */
  overflow?: "hidden" | "visible";
  cell: (row: Row) => ReactNode;
  className?: string;
}

/** Keys of the columns the viewer has hidden. Locked columns are never in it. */
export type HiddenColumns = Record<string, true>;

export function defaultHidden<Row>(columns: ReadonlyArray<ColumnDef<Row>>): HiddenColumns {
  const hidden: HiddenColumns = {};
  for (const column of columns) if (column.hiddenByDefault && !column.locked) hidden[column.key] = true;
  return hidden;
}

export function visibleColumns<Row>(
  columns: ReadonlyArray<ColumnDef<Row>>,
  hidden: HiddenColumns,
): ColumnDef<Row>[] {
  return columns.filter((column) => column.locked || !hidden[column.key]);
}

export function sortableColumns<Row>(columns: ReadonlyArray<ColumnDef<Row>>): ColumnDef<Row>[] {
  return columns.filter((column) => column.sortKey !== undefined);
}

export function sortTypeOf<Row>(column: ColumnDef<Row>): SortType {
  return column.sortType ?? "text";
}

export function defaultDirFor(type: SortType): SortDir {
  return type === "text" ? "asc" : "desc";
}

export function dirLabel(type: SortType, dir: SortDir): string {
  if (type === "date") return dir === "desc" ? "Newest first" : "Oldest first";
  if (type === "number") return dir === "desc" ? "High to low" : "Low to high";
  return dir === "asc" ? "A–Z" : "Z–A";
}
