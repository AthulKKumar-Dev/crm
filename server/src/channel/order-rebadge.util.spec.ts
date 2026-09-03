import {
  carriesCrmMarker,
  isLocallyPushedPayload,
  localOrderIdOf,
} from './order-rebadge.util';

/**
 * The gate that decides whether an incoming Shopify order is one the CRM
 * pushed and must be rebadged onto the existing row instead of inserted.
 *
 * Both failure directions are costly: a false negative stores every counter
 * sale twice (double revenue, double customer totals — the pre-July bug); a
 * false positive would re-point a genuine Shopify order at an unrelated local
 * row. The caller's MANUAL-channel filter guards the second; this util owns
 * the first.
 */
describe('order-rebadge util', () => {
  const localId = 'cmtij041d0009w54k6tey3ib5';

  describe('localOrderIdOf', () => {
    it('returns the identifier as a trimmed string', () => {
      expect(localOrderIdOf({ source_identifier: ` ${localId} ` })).toBe(localId);
      expect(localOrderIdOf({ source_identifier: 12345 })).toBe('12345');
    });

    it('returns null when absent or blank', () => {
      expect(localOrderIdOf({})).toBeNull();
      expect(localOrderIdOf({ source_identifier: null })).toBeNull();
      expect(localOrderIdOf({ source_identifier: '   ' })).toBeNull();
    });
  });

  describe('carriesCrmMarker', () => {
    it('matches the exact source_name the push sets', () => {
      expect(carriesCrmMarker({ source_name: 'collabo-crm' })).toBe(true);
    });

    it('matches the tag when source_name was rewritten (REST comma string)', () => {
      expect(
        carriesCrmMarker({ source_name: '123456789', tags: 'offline, collabo-crm, pos' }),
      ).toBe(true);
    });

    it('matches the tag when tags arrive as an array', () => {
      expect(carriesCrmMarker({ source_name: 'my-app', tags: ['pos', 'collabo-crm'] })).toBe(
        true,
      );
    });

    it('does not match a foreign source or unrelated tags', () => {
      expect(carriesCrmMarker({ source_name: 'web', tags: 'vip, wholesale' })).toBe(false);
      expect(carriesCrmMarker({})).toBe(false);
    });
  });

  describe('isLocallyPushedPayload', () => {
    it('accepts the exact shape pushOrder produces (verified on collabo-test #1008)', () => {
      expect(
        isLocallyPushedPayload({
          source_identifier: localId,
          source_name: 'collabo-crm',
          tags: 'collabo-crm, offline, pos',
        }),
      ).toBe(true);
    });

    it('accepts an identifier with no source_name (older pushes)', () => {
      expect(isLocallyPushedPayload({ source_identifier: localId, source_name: null })).toBe(true);
      expect(isLocallyPushedPayload({ source_identifier: localId, source_name: '' })).toBe(true);
    });

    it('accepts an app-id source_name when the CRM tag is present', () => {
      expect(
        isLocallyPushedPayload({
          source_identifier: localId,
          source_name: '987654321',
          tags: 'collabo-crm, offline, pos',
        }),
      ).toBe(true);
    });

    it('rejects a foreign source_name without the tag', () => {
      expect(
        isLocallyPushedPayload({ source_identifier: localId, source_name: 'shopify_draft_order' }),
      ).toBe(false);
      expect(
        isLocallyPushedPayload({ source_identifier: 'ext-42', source_name: 'amazon', tags: 'vip' }),
      ).toBe(false);
    });

    it('rejects a payload with no identifier regardless of marker', () => {
      expect(isLocallyPushedPayload({ source_name: 'collabo-crm', tags: 'collabo-crm' })).toBe(
        false,
      );
    });
  });
});
