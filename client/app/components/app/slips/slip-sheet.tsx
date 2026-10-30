/**
 * Every page of the run, in document order. THIS is what gets printed.
 *
 * Structural rules the print path depends on — see `slip-print-styles.tsx`:
 *  - `.slip-sheet` must be a DIRECT child of the route root and a sibling of
 *    the editor. No ancestor between it and <body> may carry padding,
 *    `overflow`, `max-height` or — most importantly — `transform`. A transform
 *    ancestor establishes a containing block and breaks CSS fragmentation, so
 *    `break-after: page` stops working and every page collapses onto one.
 *  - On screen it is parked off-screen by a rule scoped to `@media screen`,
 *    and must stay LAID OUT (never `display: none`): the slips measure
 *    themselves to shrink long addresses, and that measurement is what prints.
 */
import { memo } from "react";
import type { OrderSlipData } from "~/types/api";
import { SlipPage, type SlipRenderProps } from "./slip-page";

/**
 * Memoised because it is the expensive half of the screen — up to 100 slips —
 * and most editor state (hover, the preview stepper, the store panel being
 * open) changes nothing that prints. Every prop the editor passes is stable
 * across those updates; keep it that way.
 */
export const SlipSheet = memo(function SlipSheet({
  pages,
  ...rest
}: Omit<SlipRenderProps, "highlight"> & { pages: Array<Array<OrderSlipData | null>> }) {
  return (
    <div className="slip-sheet" aria-hidden>
      {pages.map((page, pi) => (
        <SlipPage key={pi} page={page} {...rest} />
      ))}
    </div>
  );
});
