import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

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
