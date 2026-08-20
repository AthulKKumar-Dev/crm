import { clsx, type ClassValue } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [
        {
          text: [
            "micro",
            "caption",
            "label",
            "body",
            "section",
            "subhead",
            "page-title",
            "stat",
          ],
        },
      ],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Format a monetary amount using the given ISO currency code.
 * Currency comes from the active organization (synced from Shopify on channel connect).
 * Falls back to a simple "{CODE} {amount}" rendering if Intl rejects the currency code.
 */
export function formatCurrency(
  amount: number | string,
  currency: string,
  options: { minimumFractionDigits?: number; maximumFractionDigits?: number } = {},
): string {
  const value = typeof amount === "string" ? Number(amount) : amount;
  if (!Number.isFinite(value)) return `${currency} 0.00`;
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      minimumFractionDigits: options.minimumFractionDigits ?? 2,
      maximumFractionDigits: options.maximumFractionDigits ?? 2,
    }).format(value);
  } catch {
    return `${currency} ${value.toFixed(options.maximumFractionDigits ?? 2)}`;
  }
}

/**
 * Compute profit (price − cost) and margin percentage. Returns null when
 * cost isn't set or pricing is invalid, so callers can render an "—".
 */
export function calcMargin(
  price: number | string | null | undefined,
  cost: number | string | null | undefined,
): { profit: number; marginPct: number } | null {
  const p = typeof price === "string" ? Number(price) : price;
  const c = typeof cost === "string" ? Number(cost) : cost;
  if (p == null || c == null || !Number.isFinite(p) || !Number.isFinite(c) || p <= 0) {
    return null;
  }
  const profit = p - c;
  return { profit, marginPct: (profit / p) * 100 };
}

/**
 * Render margin as "$5.00 (33%)" using the org's currency. Returns "—" when
 * margin can't be computed (e.g. cost is not set).
 */
export function formatMargin(
  price: number | string | null | undefined,
  cost: number | string | null | undefined,
  currency: string,
): string {
  const m = calcMargin(price, cost);
  if (!m) return "—";
  return `${formatCurrency(m.profit, currency)} (${m.marginPct.toFixed(0)}%)`;
}
