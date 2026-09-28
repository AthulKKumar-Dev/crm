import { cn } from "~/lib/utils";

/**
 * Product wordmark ("collabo"). Source artwork lives in /public/brand.
 *
 * The artwork is solid black, so it disappears on dark surfaces. The image
 * has a real alpha channel, which lets the same file act as a CSS mask
 * (`.brand-logo-mask` in app.css) painted in whatever colour a surface
 * needs — no second asset.
 *
 *  - auto   → black artwork in light theme, solid white in dark theme
 *  - color  → black artwork always (auth/onboarding pages are fixed light)
 *  - light  → solid white (for dark surfaces)
 *  - forest → solid brand-forest (for lime surfaces)
 *
 * Size with a height utility (`h-7`); width follows the 1200×285 aspect ratio.
 *
 * `?v=` is a cache-buster: /public files are not content-hashed, so bump it
 * (here, in `.brand-logo-mask`, and in server email.service.ts) whenever the
 * artwork changes.
 */
type Variant = "auto" | "color" | "light" | "forest";

const WIDTH = 1200;
const HEIGHT = 285;
const SRC = "/brand/collabo-wordmark.webp?v=2";

const MASK_FILL: Record<Exclude<Variant, "auto" | "color">, string> = {
  light: "bg-white",
  forest: "bg-brand-forest",
};

function Artwork({ className }: { className?: string }) {
  return (
    <img
      src={SRC}
      alt="Collabo"
      width={WIDTH}
      height={HEIGHT}
      draggable={false}
      className={cn("h-7 w-auto select-none", className)}
    />
  );
}

function Mask({
  fill,
  display = "inline-block",
  className,
}: {
  fill: "light" | "forest";
  /** Display utilities. Passed explicitly (not merged) so "hidden" never fights a base "inline-block". */
  display?: string;
  className?: string;
}) {
  return (
    <span
      role="img"
      aria-label="Collabo"
      className={cn("brand-logo-mask h-7 aspect-[1200/285] select-none", display, MASK_FILL[fill], className)}
    />
  );
}

export function BrandLogo({ variant = "auto", className }: { variant?: Variant; className?: string }) {
  if (variant === "color") return <Artwork className={className} />;
  if (variant === "light" || variant === "forest") return <Mask fill={variant} className={className} />;
  return (
    <>
      <Artwork className={cn("dark:hidden", className)} />
      <Mask fill="light" display="hidden dark:inline-block" className={className} />
    </>
  );
}
