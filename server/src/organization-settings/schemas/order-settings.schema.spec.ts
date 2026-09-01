import {
  parseOrderSettings,
  UpdateOrderSettingsSchema,
} from './order-settings.schema';

describe('orderSettings defaults', () => {
  it('defaults autoInvoiceOnPayment to false for an org that never set it', () => {
    expect(parseOrderSettings(undefined)).toEqual({
      autoSyncToShopify: false,
      autoInvoiceOnPayment: false,
    });
  });

  it('preserves an existing autoSyncToShopify=true when patching only the new key', () => {
    const current = parseOrderSettings({ autoSyncToShopify: true });
    const patch = UpdateOrderSettingsSchema.parse({ autoInvoiceOnPayment: true });
    expect(parseOrderSettings({ ...current, ...patch })).toEqual({
      autoSyncToShopify: true,
      autoInvoiceOnPayment: true,
    });
  });

  it('does not inject a default for an omitted key on the patch schema', () => {
    expect(UpdateOrderSettingsSchema.parse({})).toEqual({});
  });
});
