import {
  mapFulfilmentLines,
  shippedFromPayload,
  shouldAcceptRemoteFulfilmentStatus,
  statusForShippedUnits,
  type LocalLineShape,
} from './fulfillment-line-map.util';

/**
 * The link between a Shopify shipment and the local lines it ships.
 *
 * Worth testing directly because both failure directions are silent: too few
 * ids and per-line tracking stays blank while "Add tracking" 400s (the bug this
 * fixes), too many and a line is credited with units that never shipped, which
 * flows straight into the order header and the fulfilment UI.
 */
describe('mapFulfilmentLines', () => {
  const line = (over: Partial<LocalLineShape> & { id: string }): LocalLineShape => ({
    externalId: null,
    quantity: 1,
    fulfillmentStatus: null,
    fulfilledQuantity: 0,
    ...over,
  });

  const localLines = [
    line({ id: 'local-a', externalId: '111', quantity: 2 }),
    line({ id: 'local-b', externalId: '222', quantity: 5 }),
    line({ id: 'local-c', externalId: '333', quantity: 1 }),
  ];

  it('maps Shopify line ids to local ids and records what shipped', () => {
    const { lineItemIdsByExternalId, linePatches } = mapFulfilmentLines(
      [
        {
          externalId: 'ff-1',
          status: 'success',
          lines: [
            { shopifyLineId: '111', quantity: 2 },
            { shopifyLineId: '222', quantity: 5 },
          ],
        },
      ],
      localLines,
    );

    expect(lineItemIdsByExternalId.get('ff-1')).toEqual(['local-a', 'local-b']);
    expect(linePatches).toEqual([
      { id: 'local-a', fulfilledQuantity: 2, fulfillmentStatus: 'fulfilled' },
      { id: 'local-b', fulfilledQuantity: 5, fulfillmentStatus: 'fulfilled' },
    ]);
  });

  it('marks a part-shipped line partial rather than fulfilled', () => {
    const { linePatches } = mapFulfilmentLines(
      [{ externalId: 'ff-1', status: 'success', lines: [{ shopifyLineId: '222', quantity: 2 }] }],
      localLines,
    );
    expect(linePatches).toEqual([
      { id: 'local-b', fulfilledQuantity: 2, fulfillmentStatus: 'partial' },
    ]);
  });

  it('sums quantities when two shipments cover the same line', () => {
    const { lineItemIdsByExternalId, linePatches } = mapFulfilmentLines(
      [
        { externalId: 'ff-1', status: 'success', lines: [{ shopifyLineId: '222', quantity: 2 }] },
        { externalId: 'ff-2', status: 'success', lines: [{ shopifyLineId: '222', quantity: 3 }] },
      ],
      localLines,
    );
    expect(lineItemIdsByExternalId.get('ff-1')).toEqual(['local-b']);
    expect(lineItemIdsByExternalId.get('ff-2')).toEqual(['local-b']);
    expect(linePatches).toEqual([
      { id: 'local-b', fulfilledQuantity: 5, fulfillmentStatus: 'fulfilled' },
    ]);
  });

  it('widens an existing mapping instead of replacing it', () => {
    // The lazy backfill recorded one line at a time, so the stored array was a
    // permanent subset of the shipment's real contents.
    const { lineItemIdsByExternalId } = mapFulfilmentLines(
      [
        {
          externalId: 'ff-1',
          status: 'success',
          lines: [{ shopifyLineId: '222', quantity: 5 }],
        },
      ],
      localLines,
      new Map([['ff-1', ['local-a']]]),
    );
    expect(new Set(lineItemIdsByExternalId.get('ff-1'))).toEqual(
      new Set(['local-a', 'local-b']),
    );
  });

  it('records membership but no units for a cancelled or failed shipment', () => {
    const { lineItemIdsByExternalId, linePatches } = mapFulfilmentLines(
      [
        { externalId: 'ff-1', status: 'cancelled', lines: [{ shopifyLineId: '111', quantity: 2 }] },
        { externalId: 'ff-2', status: 'failure', lines: [{ shopifyLineId: '222', quantity: 5 }] },
      ],
      localLines,
    );
    expect(lineItemIdsByExternalId.get('ff-1')).toEqual(['local-a']);
    expect(linePatches).toEqual([]);
  });

  it('never downgrades a line the CRM already marked delivered', () => {
    const { linePatches } = mapFulfilmentLines(
      [{ externalId: 'ff-1', status: 'success', lines: [{ shopifyLineId: '111', quantity: 2 }] }],
      [line({ id: 'local-a', externalId: '111', quantity: 2, fulfillmentStatus: 'delivered', fulfilledQuantity: 2 })],
    );
    expect(linePatches).toEqual([]);
  });

  it('skips Shopify lines we hold no row for, without dropping the rest', () => {
    const { lineItemIdsByExternalId, linePatches } = mapFulfilmentLines(
      [
        {
          externalId: 'ff-1',
          status: 'success',
          lines: [
            { shopifyLineId: '999', quantity: 1 },
            { shopifyLineId: '333', quantity: 1 },
          ],
        },
      ],
      localLines,
    );
    expect(lineItemIdsByExternalId.get('ff-1')).toEqual(['local-c']);
    expect(linePatches).toEqual([
      { id: 'local-c', fulfilledQuantity: 1, fulfillmentStatus: 'fulfilled' },
    ]);
  });

  it('leaves lines no shipment mentions untouched', () => {
    // Absence from a payload is not proof that nothing shipped.
    const { linePatches } = mapFulfilmentLines(
      [{ externalId: 'ff-1', status: 'success', lines: [{ shopifyLineId: '111', quantity: 2 }] }],
      [
        line({ id: 'local-a', externalId: '111', quantity: 2 }),
        line({ id: 'local-b', externalId: '222', quantity: 5, fulfilledQuantity: 5, fulfillmentStatus: 'fulfilled' }),
      ],
    );
    expect(linePatches.map((p) => p.id)).toEqual(['local-a']);
  });

  it('caps a line at its ordered quantity', () => {
    const { linePatches } = mapFulfilmentLines(
      [{ externalId: 'ff-1', status: 'success', lines: [{ shopifyLineId: '111', quantity: 99 }] }],
      localLines,
    );
    expect(linePatches[0]).toEqual({
      id: 'local-a',
      fulfilledQuantity: 2,
      fulfillmentStatus: 'fulfilled',
    });
  });
});

describe('statusForShippedUnits', () => {
  it('mirrors the server rule, delivered included', () => {
    expect(statusForShippedUnits(0, 3, null)).toBeNull();
    expect(statusForShippedUnits(1, 3, null)).toBe('partial');
    expect(statusForShippedUnits(3, 3, null)).toBe('fulfilled');
    expect(statusForShippedUnits(3, 3, 'delivered')).toBe('delivered');
    expect(statusForShippedUnits(0, 3, 'delivered')).toBe('delivered');
  });
});

describe('shouldAcceptRemoteFulfilmentStatus', () => {
  it('accepts anything when the local row is not delivered', () => {
    expect(shouldAcceptRemoteFulfilmentStatus('pending', 'success')).toBe(true);
    expect(shouldAcceptRemoteFulfilmentStatus(null, 'cancelled')).toBe(true);
    expect(shouldAcceptRemoteFulfilmentStatus('fulfilled', 'success')).toBe(true);
  });

  it('refuses to downgrade a locally delivered shipment', () => {
    // Shopify has no delivered state, so its `success` carries strictly less
    // information than ours and must not overwrite it.
    expect(shouldAcceptRemoteFulfilmentStatus('delivered', 'success')).toBe(false);
    expect(shouldAcceptRemoteFulfilmentStatus('delivered', 'pending')).toBe(false);
    expect(shouldAcceptRemoteFulfilmentStatus('delivered', 'open')).toBe(false);
  });

  it('still lets a cancellation through — that is new information', () => {
    expect(shouldAcceptRemoteFulfilmentStatus('delivered', 'cancelled')).toBe(true);
    expect(shouldAcceptRemoteFulfilmentStatus('delivered', 'delivered')).toBe(true);
  });
});

/**
 * How many units a payload says have shipped. Nothing wrote `fulfilledQuantity`
 * on the Shopify path before this, so a fully-shipped Shopify order arrived
 * looking entirely unfulfilled.
 */
describe('shippedFromPayload', () => {
  it('derives shipped units from what is left to ship', () => {
    expect(shippedFromPayload({ quantity: 5, fulfillable_quantity: 0 })).toBe(5);
    expect(shippedFromPayload({ quantity: 5, fulfillable_quantity: 3 })).toBe(2);
    expect(shippedFromPayload({ quantity: 5, fulfillable_quantity: 5 })).toBe(0);
  });

  it('accepts the value as a string, as REST sends it', () => {
    expect(shippedFromPayload({ quantity: 4, fulfillable_quantity: '1' })).toBe(3);
  });

  it('clamps a nonsensical remainder into range', () => {
    expect(shippedFromPayload({ quantity: 2, fulfillable_quantity: -5 })).toBe(2);
    expect(shippedFromPayload({ quantity: 2, fulfillable_quantity: 99 })).toBe(0);
  });

  it('falls back to the flat REST status when no count is given', () => {
    expect(shippedFromPayload({ quantity: 3, fulfillment_status: 'fulfilled' })).toBe(3);
  });

  it('returns null when the payload says nothing, so stored values are left alone', () => {
    // Silence is not evidence that nothing shipped.
    expect(shippedFromPayload({ quantity: 3 })).toBeNull();
    expect(shippedFromPayload({ quantity: 3, fulfillable_quantity: null })).toBeNull();
    expect(shippedFromPayload({ quantity: 3, fulfillment_status: null })).toBeNull();
    expect(shippedFromPayload({ quantity: 3, fulfillment_status: 'partial' })).toBeNull();
  });
});
