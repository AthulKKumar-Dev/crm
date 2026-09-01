import {
  parseTaxSettings,
  TaxSettingsSchema,
  UpdateTaxSettingsSchema,
} from './tax-settings.schema';

/**
 * These two values change STATUTORY OUTPUT. The threshold decides whether an
 * invoice is reported in GSTR-1 Table 5 (invoice-wise) or Table 7 (summarised),
 * and the UQC appears on every Table 12 row.
 *
 * The failure this file exists to prevent is the `.partial()` trap: a patch
 * schema that retains `.default()` silently resets a key the merchant did not
 * send, so changing the UQC would quietly reset a configured threshold back to
 * ₹1,00,000 — and nothing would report an error.
 */
describe('TaxSettings', () => {
  it('defaults to the current statutory threshold and NOS', () => {
    expect(parseTaxSettings(null)).toEqual({
      b2cLargeThreshold: 100000,
      defaultUnitOfMeasure: 'NOS',
      // OFF by default: this is the only setting here that changes tax charged
      // on a real transaction, so no merchant inherits it.
      taxShipping: false,
    });
  });

  it('does not inject a default for an omitted key on the patch schema', () => {
    // The direct regression guard. If this ever returns
    // `{ b2cLargeThreshold: 100000 }`, the patch schema has grown a default and
    // every PATCH silently resets the threshold.
    expect(UpdateTaxSettingsSchema.parse({})).toEqual({});
  });

  it('preserves a configured threshold when patching only the UQC', () => {
    const current = parseTaxSettings({ b2cLargeThreshold: 250000 });
    const patch = UpdateTaxSettingsSchema.parse({ defaultUnitOfMeasure: 'KGS' });
    const merged = TaxSettingsSchema.parse({ ...current, ...patch });

    expect(merged.b2cLargeThreshold).toBe(250000);
    expect(merged.defaultUnitOfMeasure).toBe('KGS');
  });

  it('honours an org still filing against the older 2.5 lakh limit', () => {
    expect(parseTaxSettings({ b2cLargeThreshold: 250000 }).b2cLargeThreshold).toBe(250000);
  });

  it('rejects a UQC the GST portal would not accept', () => {
    // Free text like "pieces" or "each" fails the portal upload, so it must not
    // be storable in the first place.
    expect(UpdateTaxSettingsSchema.safeParse({ defaultUnitOfMeasure: 'pieces' }).success).toBe(false);
    expect(UpdateTaxSettingsSchema.safeParse({ defaultUnitOfMeasure: 'PCS' }).success).toBe(true);
  });

  it('rejects a non-positive threshold', () => {
    expect(UpdateTaxSettingsSchema.safeParse({ b2cLargeThreshold: 0 }).success).toBe(false);
    expect(UpdateTaxSettingsSchema.safeParse({ b2cLargeThreshold: -1 }).success).toBe(false);
  });

  it('degrades a corrupt stored blob to defaults instead of throwing', () => {
    // This runs on the GST return path; throwing here would take down the whole
    // return rather than one setting.
    expect(() => parseTaxSettings({ b2cLargeThreshold: 'not a number' })).not.toThrow();
    expect(parseTaxSettings({ b2cLargeThreshold: 'not a number' }).b2cLargeThreshold).toBe(100000);
  });
});
