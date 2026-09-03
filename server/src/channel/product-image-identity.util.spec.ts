import {
  imageSrcKey,
  isManualImage,
  planImageReconcile,
} from './product-image-identity.util';

/**
 * The key that decides whether two Shopify payloads describe the SAME photo.
 *
 * Worth testing in isolation because both failure directions are silent and
 * damaging: too strict and every image duplicates in the gallery again (the
 * original bug); too loose and two genuinely different photos collapse into
 * one, destroying an image row and any variant pointing at it.
 */
describe('imageSrcKey', () => {
  // The same snowboard photo as the two APIs report it. Note the differing
  // cache-buster: GraphQL and REST stamp `?v=` independently.
  const REST_SRC =
    'https://cdn.shopify.com/s/files/1/0757/9955/files/snowboard.jpg?v=1739795041';
  const GRAPHQL_URL =
    'https://cdn.shopify.com/s/files/1/0757/9955/files/snowboard.jpg?v=1739800000';

  describe('the same asset through different doors', () => {
    it('matches REST src against GraphQL image.url', () => {
      expect(imageSrcKey(REST_SRC)).toBe(imageSrcKey(GRAPHQL_URL));
    });

    it('ignores transform parameters', () => {
      expect(imageSrcKey(REST_SRC + '&width=400&crop=center')).toBe(
        imageSrcKey(REST_SRC),
      );
    });

    it('ignores the serving domain', () => {
      expect(
        imageSrcKey('https://shop.example.com/s/files/1/0757/9955/files/snowboard.jpg'),
      ).toBe(imageSrcKey(REST_SRC));
    });

    it('ignores case', () => {
      expect(imageSrcKey(REST_SRC.toUpperCase())).toBe(imageSrcKey(REST_SRC));
    });
  });

  describe('genuinely different assets stay apart', () => {
    it('separates different filenames', () => {
      expect(imageSrcKey(REST_SRC)).not.toBe(
        imageSrcKey(
          'https://cdn.shopify.com/s/files/1/0757/9955/files/goggles.jpg?v=1739795041',
        ),
      );
    });

    it('separates the same filename under different folders', () => {
      expect(
        imageSrcKey('https://cdn.shopify.com/s/files/1/0757/9955/products/board.jpg'),
      ).not.toBe(
        imageSrcKey('https://cdn.shopify.com/s/files/1/0757/9955/files/board.jpg'),
      );
    });
  });

  describe('degenerate input', () => {
    it('returns an empty key for missing values', () => {
      expect(imageSrcKey(null)).toBe('');
      expect(imageSrcKey(undefined)).toBe('');
      expect(imageSrcKey('')).toBe('');
    });

    // CRM-hosted uploads are stored as bare paths, not absolute URLs, so the
    // URL constructor throws and the fallback has to carry them.
    it('handles a relative path without throwing', () => {
      expect(imageSrcKey('/uploads/products/org_1/photo.png?v=2')).toBe(
        '/uploads/products/org_1/photo.png',
      );
    });
  });
});

describe('isManualImage', () => {
  it('recognises CRM-uploaded rows', () => {
    expect(isManualImage('manual_9f1c2d3e')).toBe(true);
  });

  it('treats Shopify ids of either namespace as not manual', () => {
    expect(isManualImage('29192186818616')).toBe(false); // REST ProductImage
    expect(isManualImage('20995642')).toBe(false); // MediaImage
  });

  it('is safe on empty input', () => {
    expect(isManualImage(null)).toBe(false);
    expect(isManualImage(undefined)).toBe(false);
    expect(isManualImage('')).toBe(false);
  });
});

/**
 * The reconcile that fixed the duplicate-image bug.
 *
 * Every case below is a real path through `upsertProduct`, which is reachable
 * from two callers that disagree about image ids. The destructive branches
 * (delete, repoint) are the reason this is tested at all: a wrong answer here
 * silently loses a merchant's photos or their variant associations.
 */
describe('planImageReconcile', () => {
  const PATH = 'https://cdn.shopify.com/s/files/1/0757/9955/files/snowboard.jpg';
  const OTHER = 'https://cdn.shopify.com/s/files/1/0757/9955/files/goggles.jpg';

  /** The same photo as GraphQL reports it (MediaImage id). */
  const viaGraphql = (id = '20995642', src = PATH) => ({
    id,
    src: `${src}?v=1739800000`,
    alt: 'A snowboard',
    position: 1,
  });
  /** The same photo as the REST webhook reports it (ProductImage id). */
  const viaRest = (id = '29192186818616', src = PATH) => ({
    id,
    src: `${src}?v=1739795041`,
    alt: 'A snowboard',
    position: 1,
  });

  describe('the reported bug: one photo stored twice', () => {
    // What the DB looks like today: the sync inserted a MediaImage-keyed row,
    // then a products/update webhook inserted a REST-keyed copy alongside it.
    const duplicated = [
      { id: 'row_media', externalId: '20995642', src: `${PATH}?v=1` },
      { id: 'row_rest', externalId: '29192186818616', src: `${PATH}?v=2` },
    ];

    it('collapses the pair to one row on the next sync', () => {
      const plan = planImageReconcile(duplicated, [viaGraphql()]);

      expect(plan.doomed).toEqual([{ id: 'row_rest', repointTo: 'row_media' }]);
      expect(plan.writes).toHaveLength(1);
      expect(plan.writes[0].updateId).toBe('row_media');
    });

    it('keeps the OLDEST row, the one variants already point at', () => {
      const plan = planImageReconcile(duplicated, [viaGraphql()]);
      expect(plan.doomed.map((d) => d.id)).not.toContain('row_media');
    });

    it('moves variants off the doomed row before it disappears', () => {
      const plan = planImageReconcile(duplicated, [viaRest()]);
      expect(plan.doomed[0].repointTo).toBe('row_media');
    });

    it('collapses it from the webhook side too', () => {
      const plan = planImageReconcile(duplicated, [viaRest()]);
      expect(plan.doomed).toHaveLength(1);
      expect(plan.writes[0].updateId).toBe('row_media');
    });
  });

  describe('no longer duplicates going forward', () => {
    const stored = [{ id: 'row_1', externalId: '20995642', src: `${PATH}?v=1` }];

    it('updates in place when the id namespace flips', () => {
      const plan = planImageReconcile(stored, [viaRest()]);

      expect(plan.doomed).toEqual([]);
      expect(plan.writes).toEqual([
        expect.objectContaining({
          updateId: 'row_1',
          externalId: '29192186818616', // converges on the latest writer
        }),
      ]);
    });

    it('inserts genuinely new photos', () => {
      const plan = planImageReconcile(stored, [
        viaGraphql(),
        viaGraphql('333', OTHER),
      ]);

      expect(plan.doomed).toEqual([]);
      expect(plan.writes.map((w) => w.updateId)).toEqual(['row_1', null]);
    });
  });

  describe('pruning images removed in Shopify', () => {
    const stored = [
      { id: 'row_1', externalId: '1', src: PATH },
      { id: 'row_2', externalId: '2', src: OTHER },
    ];

    it('deletes rows Shopify no longer lists', () => {
      const plan = planImageReconcile(stored, [viaGraphql('1', PATH)]);
      expect(plan.doomed).toEqual([{ id: 'row_2', repointTo: null }]);
    });

    it('clears variants pointing at a photo that is simply gone', () => {
      const plan = planImageReconcile(stored, [viaGraphql('1', PATH)]);
      expect(plan.doomed[0].repointTo).toBeNull();
    });

    // The guard that stops a thin payload wiping the gallery.
    it('prunes nothing when the payload omits images entirely', () => {
      expect(planImageReconcile(stored, undefined).doomed).toEqual([]);
      expect(planImageReconcile(stored, null).doomed).toEqual([]);
    });

    it('prunes nothing when the payload carries an empty array', () => {
      expect(planImageReconcile(stored, []).doomed).toEqual([]);
    });

    it('still collapses duplicates when the payload omits images', () => {
      const withDupe = [
        ...stored,
        { id: 'row_dupe', externalId: '99', src: `${PATH}?v=9` },
      ];
      const plan = planImageReconcile(withDupe, undefined);
      expect(plan.doomed).toEqual([{ id: 'row_dupe', repointTo: 'row_1' }]);
    });
  });

  describe('CRM-uploaded images', () => {
    const stored = [
      { id: 'row_manual', externalId: 'manual_abc', src: '/uploads/products/o1/a.png' },
      { id: 'row_shopify', externalId: '1', src: PATH },
    ];

    it('never prunes them, even though Shopify never lists them', () => {
      const plan = planImageReconcile(stored, [viaGraphql('1', PATH)]);
      expect(plan.doomed).toEqual([]);
    });
  });

  describe('payload hygiene', () => {
    it('ignores a repeated photo inside one payload', () => {
      const plan = planImageReconcile([], [viaGraphql('1'), viaRest('2')]);
      expect(plan.writes).toHaveLength(1);
    });

    it('skips entries with no usable src', () => {
      const plan = planImageReconcile([], [{ id: '1' }, { id: '2', src: '' }]);
      expect(plan.writes).toEqual([]);
    });

    it('passes alt through untouched so undefined leaves the column alone', () => {
      const plan = planImageReconcile([], [{ id: '1', src: PATH }]);
      expect(plan.writes[0].alt).toBeUndefined();
    });

    it('falls back to payload order when position is absent', () => {
      const plan = planImageReconcile([], [
        { id: '1', src: PATH },
        { id: '2', src: OTHER },
      ]);
      expect(plan.writes.map((w) => w.position)).toEqual([1, 2]);
    });

    it('does nothing at all for a product with no images either side', () => {
      expect(planImageReconcile([], [])).toEqual({ doomed: [], writes: [] });
    });
  });
});
