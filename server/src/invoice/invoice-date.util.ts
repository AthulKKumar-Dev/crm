import { zonedParts } from '../common/utils/zoned-date.util';

/**
 * The taxable supply date of an order: when it was PLACED, not when someone
 * pressed "Generate invoice". `externalCreatedAt` is what the sales channel
 * says; CRM-native orders have only `createdAt`. Same expression every order
 * report, export and packing slip already uses.
 *
 * Clamped to `now`: a channel clock running ahead must not date a statutory
 * document in the future.
 */
export function resolveSupplyDate(
  order: { externalCreatedAt: Date | null; createdAt: Date },
  now: Date,
): Date {
  const placed = order.externalCreatedAt ?? order.createdAt;
  return placed.getTime() > now.getTime() ? now : placed;
}

/**
 * Whether an invoice may still be dated to `supplyDate`: its month is the
 * current one or the one before, in the org's GST timezone.
 *
 * The previous month is the furthest back a return can still be open — GSTR-1
 * for a month is due on the 11th of the next. The CRM only knows about
 * filings recorded in it, so anything older is treated as filed whether or
 * not a row says so; dating into it would rewrite a return the merchant has
 * already sent and mint a serial into a closed run.
 */
export function isWithinInvoicingWindow(
  supplyDate: Date,
  now: Date,
  timeZone: string,
): boolean {
  const supply = zonedParts(supplyDate, timeZone);
  const current = zonedParts(now, timeZone);
  const monthsBack =
    current.year * 12 + current.month - (supply.year * 12 + supply.month);
  return monthsBack <= 1;
}
