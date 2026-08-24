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
 *
 * `locale` defaults to `en-IN` for INR and to the host locale for everything
 * else. Passing `undefined` for INR meant grouping followed the *viewer's*
 * browser, so an Indian merchant's ₹18,42,300 rendered as ₹1,842,300 for anyone
 * outside India — the lakh/crore grouping that INR amounts are read in is a
 * property of the currency, not of who is looking at it.
 */
export function formatCurrency(
  amount: number | string,
  currency: string,
  options: {
    minimumFractionDigits?: number;
    maximumFractionDigits?: number;
    locale?: string;
  } = {},
): string {
  const value = typeof amount === "string" ? Number(amount) : amount;
  if (!Number.isFinite(value)) return `${currency} 0.00`;
  const locale = options.locale ?? (currency === "INR" ? "en-IN" : undefined);

  const maximumFractionDigits = options.maximumFractionDigits ?? 2;
  // The default *minimum* must never exceed an explicitly requested maximum.
  // Intl throws RangeError when min > max, so a caller asking for whole rupees
  // (`maximumFractionDigits: 0`) fell into the catch below and rendered
  // "INR 1842300" — no symbol, no grouping — instead of "₹18,42,300".
  const minimumFractionDigits =
    options.minimumFractionDigits ?? Math.min(2, maximumFractionDigits);

  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      minimumFractionDigits,
      maximumFractionDigits,
    }).format(value);
  } catch {
    return `${currency} ${value.toFixed(maximumFractionDigits)}`;
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
