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
