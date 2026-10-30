// `@Type()` on QueryOrdersDto reads decorator metadata; Nest loads this in
// main.ts, a bare jest run does not.
import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { QueryDashboardDto } from './query-dashboard.dto';
import { QueryOrdersDto } from '../../order/dto/query-orders.dto';

/**
 * `dateFrom`/`dateTo` used to be any string. A value like `2026-02-30` passed
 * validation, became an Invalid Date in the window maths and surfaced as a
 * 500 rather than a 400.
 */
describe.each([
  ['QueryDashboardDto', QueryDashboardDto],
  ['QueryOrdersDto', QueryOrdersDto],
])('%s date range', (_name, Dto) => {
  const errorsFor = (query: Record<string, string>) =>
    validate(plainToInstance(Dto, query));

  it.each(['2026-10-01', '2026-10-01T18:30:00.000Z'])('accepts %s', async (value) => {
    await expect(errorsFor({ dateFrom: value, dateTo: value })).resolves.toEqual([]);
  });

  it.each(['2026-02-30', 'garbage', '01-10-2026', '2026-13-01'])(
    'rejects %s',
    async (value) => {
      const errors = await errorsFor({ dateFrom: value });
      expect(errors.map((e) => e.property)).toEqual(['dateFrom']);
    },
  );

  it('still allows both dates to be omitted', async () => {
    await expect(errorsFor({})).resolves.toEqual([]);
  });
});
