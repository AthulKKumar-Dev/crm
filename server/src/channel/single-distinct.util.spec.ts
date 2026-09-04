import { singleDistinct } from './single-distinct.util';

describe('singleDistinct', () => {
  it('returns the value when exactly one distinct one is present', () => {
    expect(singleDistinct(['123'])).toBe('123');
    expect(singleDistinct(['123', '123', '123'])).toBe('123');
  });

  it('returns null when the list is empty or holds nothing usable', () => {
    expect(singleDistinct([])).toBeNull();
    expect(singleDistinct([null, undefined, '', '   '])).toBeNull();
  });

  it('returns null when the answer is ambiguous — a split shipment has no single origin', () => {
    expect(singleDistinct(['123', '456'])).toBeNull();
  });

  it('ignores blanks and whitespace around an otherwise single value', () => {
    expect(singleDistinct([null, ' 123 ', '', '123'])).toBe('123');
  });
});
