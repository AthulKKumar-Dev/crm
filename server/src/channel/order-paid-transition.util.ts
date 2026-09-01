import { OrderFinancialStatus } from '@prisma/client';

/**
 * Did this Shopify payload move the order INTO the paid state?
 *
 * Extracted from `ShopifySyncService.upsertOrder` so the rule can be tested
 * without standing up Prisma, and so both call sites (the create branch and the
 * update branch) provably share one definition.
 *
 * @param previous The status already stored, or `null` when the order is new to
 * us. `null` means there is nothing to diff against, so an order that arrives
 * already paid — the normal case for an online checkout that captured payment
 * before the webhook reached us — counts as the transition.
 * @param incoming The status in the payload being applied.
 *
 * Transition, not state: "is paid" would re-fire on every later `orders/updated`
 * for an order that was already paid, and Shopify redelivers freely. Only the
 * edge counts.
 *
 * Refunds and voids deliberately do not qualify — they are not payments, and
 * PARTIALLY_PAID is not enough to invoice against either.
 */
export function becamePaid(
  previous: OrderFinancialStatus | null,
  incoming: OrderFinancialStatus,
): boolean {
  return (
    incoming === OrderFinancialStatus.PAID &&
    previous !== OrderFinancialStatus.PAID
  );
}
