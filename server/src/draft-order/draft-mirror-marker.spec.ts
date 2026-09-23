import { DraftOrderService } from './draft-order.service';
import { CRM_DRAFT_ATTRIBUTE } from '../channel/draft-rebadge.util';

/**
 * Every draft pushed to Shopify carries its local id, so the draft_orders
 * webhook can match it back to the MANUAL-channel row instead of inserting a
 * duplicate. See draft-rebadge.util.ts.
 */
describe('DraftOrderService.buildShopifyInput', () => {
  it('stamps the local draft id as a custom attribute', async () => {
    const prisma = {
      draftOrder: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: 'draft_crm',
          note: null,
          tags: [],
          customerEmail: null,
          customer: null,
          lineItems: [
            { title: 'Widget', variantTitle: null, quantity: 1, price: '10', variant: null },
          ],
        }),
      },
    };
    const calculator = { toNumber: (v: unknown) => Number(v) };
    // prisma, calculator, taxResolver, orderService, graphql, shopifyOAuth,
    // shopifySync, mirrorEnqueuer, settings
    const service = new DraftOrderService(
      prisma as any, calculator as any, {} as any, {} as any, {} as any,
      {} as any, {} as any, {} as any, {} as any,
    );

    const input = await (service as any).buildShopifyInput('draft_crm');

    expect(input.customAttributes).toEqual([{ key: CRM_DRAFT_ATTRIBUTE, value: 'draft_crm' }]);
  });
});

describe('DraftOrderService.buildShopifyInput — addresses', () => {
  function build(addresses: { shippingAddress: unknown; billingAddress: unknown }) {
    const prisma = {
      draftOrder: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: 'draft_crm', note: null, tags: [], customerEmail: null, customer: null,
          lineItems: [{ title: 'Widget', variantTitle: null, quantity: 1, price: '10', variant: null }],
          ...addresses,
        }),
      },
    };
    const service = new DraftOrderService(
      prisma as any, { toNumber: (v: unknown) => Number(v) } as any, {} as any, {} as any,
      {} as any, {} as any, {} as any, {} as any, {} as any,
    );
    return (service as any).buildShopifyInput('draft_crm');
  }

  it('sends the draft address so the order it becomes in Shopify has one', async () => {
    const input = await build({
      shippingAddress: { address1: '7 Marine Drive', city: 'Kochi', stateCode: '32', country_code: 'IN' },
      billingAddress: null,
    });
    const expected = { address1: '7 Marine Drive', city: 'Kochi', provinceCode: 'KL', countryCode: 'IN' };
    expect(input.shippingAddress).toEqual(expected);
    expect(input.billingAddress).toEqual(expected);
  });

  it('sends none for a draft without an address', async () => {
    const input = await build({ shippingAddress: null, billingAddress: null });
    expect(input).not.toHaveProperty('shippingAddress');
    expect(input).not.toHaveProperty('billingAddress');
  });
});
