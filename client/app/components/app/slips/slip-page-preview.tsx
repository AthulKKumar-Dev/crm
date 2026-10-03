/**
 * The rail's live preview: one real page (or one slip from it), scaled to fit.
 *
 * Same contract as the label preview — it renders the SAME `<SlipPage>` the
 * print sheet does under a `transform: scale()`, strictly outside
 * `.slip-sheet`, and the whole thing carries `.no-print` so its box cannot push
 * page 1 down at print time.
 */
import { ChevronLeft, ChevronRight } from "lucide-react";
import { previewScale, useElementWidth } from "~/components/app/labels/label-page-preview";
import { cn } from "~/lib/utils";
import type { OrderSlipData } from "~/types/api";
import { SlipCell, SlipPage, type SlipRenderProps } from "./slip-page";

export type SlipPreviewView = "sheet" | "slip";

/** Tallest the preview may get — an A4 at rail width is well under this. */
const BOX_H_PX = 520;

export function SlipPagePreview({
  pages,
  index,
  onIndexChange,
  view,
  caption,
  profile,
  ...rest
}: SlipRenderProps & {
  pages: Array<Array<OrderSlipData | null>>;
  index: number;
  onIndexChange: (next: number) => void;
  view: SlipPreviewView;
  /** "A4 · 4 per sheet · 105 × 149 mm each" — built by the editor. */
  caption: string;
}) {
  const page = pages[index] ?? [];
  const single = view === "slip" && profile.perPage > 1;
  const [boxRef, boxWidth] = useElementWidth<HTMLDivElement>();
  const { scale, clipWidthPx, clipHeightPx } = previewScale({
    pageWidthMm: single ? profile.widthMm : profile.pageWidthMm,
    pageHeightMm: single ? profile.heightMm : profile.pageHeightMm,
    boxWidthPx: boxWidth ?? undefined,
    boxHeightPx: BOX_H_PX,
  });

  return (
    <div className="no-print space-y-2">
      <div
        ref={boxRef}
        className="flex min-h-60 items-center justify-center rounded-lg bg-card p-4 ring-1 ring-border"
      >
        <div
          className="max-w-full overflow-hidden bg-white shadow-sm ring-1 ring-border"
          style={{ width: clipWidthPx, height: clipHeightPx }}
        >
          <div style={{ transform: `scale(${scale})`, transformOrigin: "top left" }}>
            {single ? (
              <SlipCell order={page.find(Boolean) ?? null} profile={profile} {...rest} />
            ) : (
              <SlipPage page={page} profile={profile} {...rest} />
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 text-caption text-muted-foreground">
        <span className="min-w-0">{caption}</span>
        {pages.length > 1 && (
          <span className="flex flex-none items-center gap-1.5">
            <PageStep
              label="Previous sheet"
              disabled={index === 0}
              onClick={() => onIndexChange(index - 1)}
            >
              <ChevronLeft className="size-3.5" />
            </PageStep>
            <span className="tabular-nums">
              Sheet {index + 1} of {pages.length}
            </span>
            <PageStep
              label="Next sheet"
              disabled={index >= pages.length - 1}
              onClick={() => onIndexChange(index + 1)}
            >
              <ChevronRight className="size-3.5" />
            </PageStep>
          </span>
        )}
      </div>
    </div>
  );
}

function PageStep({
  children,
  label,
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  label: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "grid size-6 place-items-center rounded-md border border-input bg-card text-foreground transition-colors",
        "hover:bg-muted disabled:pointer-events-none disabled:opacity-40",
      )}
    >
      {children}
    </button>
  );
}
