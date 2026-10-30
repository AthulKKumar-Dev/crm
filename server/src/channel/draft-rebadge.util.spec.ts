import { CRM_DRAFT_ATTRIBUTE, localDraftIdOf } from './draft-rebadge.util';

describe('localDraftIdOf', () => {
  it('reads the CRM draft id from REST note_attributes', () => {
    expect(
      localDraftIdOf({
        note_attributes: [
          { name: 'gift_wrap', value: 'yes' },
          { name: CRM_DRAFT_ATTRIBUTE, value: 'draft_abc' },
        ],
      }),
    ).toBe('draft_abc');
  });

  it('reads the GraphQL key/value shape too', () => {
    expect(
      localDraftIdOf({ note_attributes: [{ key: CRM_DRAFT_ATTRIBUTE, value: 'draft_abc' }] }),
    ).toBe('draft_abc');
  });

  it('is null for a draft made in Shopify admin', () => {
    expect(localDraftIdOf({ note_attributes: [{ name: 'gift_wrap', value: 'yes' }] })).toBeNull();
    expect(localDraftIdOf({ note_attributes: [] })).toBeNull();
    expect(localDraftIdOf({})).toBeNull();
  });

  it('ignores a blank marker', () => {
    expect(localDraftIdOf({ note_attributes: [{ name: CRM_DRAFT_ATTRIBUTE, value: '  ' }] })).toBeNull();
    expect(localDraftIdOf({ note_attributes: [{ name: CRM_DRAFT_ATTRIBUTE, value: null }] })).toBeNull();
  });
});
