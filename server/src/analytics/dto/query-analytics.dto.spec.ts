import { rangeToDays } from './query-analytics.dto';

describe('rangeToDays', () => {
  it.each([
    ['7d', 7],
    ['30d', 30],
    ['6m', 182],
    ['12m', 365],
  ] as const)('maps %s to %i trailing days', (range, days) => {
    expect(rangeToDays(range)).toBe(days);
  });

  it('defaults to twelve months when no range is sent', () => {
    expect(rangeToDays(undefined)).toBe(365);
  });
});
