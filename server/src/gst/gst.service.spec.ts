import { BadRequestException, ConflictException } from '@nestjs/common';
import { GstService } from './gst.service';

/**
 * GSTIN registration lifecycle.
 *
 * Removal is a soft delete, because invoices and filed returns hold a foreign
 * key to the row. The unique index on (organization_id, gstin) covers inactive
 * rows too, so re-adding a number the merchant had removed used to be
 * impossible: the insert hit the constraint and came back as "already
 * registered" while the list showed nothing. These tests pin the revive path
 * and the default-flag invariant that the same code paths kept breaking.
 */

const ORG = 'org_1';

// A real-shaped GSTIN: state code 27, then the PAN block, then Z + checksum.
const GSTIN = '27AABCU9603R1ZM';

function baseDto(over: Record<string, unknown> = {}) {
  return {
    gstin: GSTIN,
    legalName: 'Acme Textiles Pvt Ltd',
    stateCode: '27',
    stateName: 'Maharashtra',
    ...over,
  } as any;
}

function build(rows: Array<Record<string, unknown>> = []) {
  const store = [...rows];
  const tx = {
    organizationGstin: {
      create: jest.fn(({ data }: any) => {
        const row = { id: 'new_id', isActive: true, ...data };
        store.push(row);
        return Promise.resolve(row);
      }),
      update: jest.fn(({ where, data }: any) => {
        const row = store.find((r: any) => r.id === where.id);
        Object.assign(row ?? {}, data);
        return Promise.resolve({ ...(row ?? {}), ...data });
      }),
      updateMany: jest.fn(() => Promise.resolve({ count: 0 })),
      findFirst: jest.fn(({ where }: any) => {
        const found = store.find(
          (r: any) =>
            r.isActive === true &&
            r.id !== (where.id?.not ?? null) &&
            r.organizationId === where.organizationId,
        );
        return Promise.resolve(found ?? null);
      }),
    },
    // Deactivating a registration also detaches the warehouses declared as its
    // additional places of business, in the same transaction.
    warehouse: {
      updateMany: jest.fn(() => Promise.resolve({ count: 0 })),
    },
  };
  const prisma = {
    organizationGstin: {
      findFirst: jest.fn(({ where }: any) => {
        const found = store.find(
          (r: any) =>
            r.organizationId === where.organizationId &&
            (where.gstin === undefined || r.gstin === where.gstin) &&
            (where.id === undefined || r.id === where.id),
        );
        // A COPY, as Prisma returns. Handing back the stored object would let
        // a later update mutate the row the caller already read, hiding the
        // very "was this the default before removal" check under test.
        return Promise.resolve(found ? { ...found } : null);
      }),
      count: jest.fn(({ where }: any) =>
        Promise.resolve(
          store.filter(
            (r: any) =>
              r.organizationId === where.organizationId &&
              (where.isActive === undefined || r.isActive === where.isActive),
          ).length,
        ),
      ),
    },
    $transaction: jest.fn(async (fn: any) => fn(tx)),
  };
  const service = new GstService(prisma as any);
  return { service, prisma, tx, store };
}

describe('GstService.create', () => {
  it('revives a previously removed registration instead of rejecting it', async () => {
    // The reported bug: add, delete, then add the same number again.
    const { service, tx } = build([
      {
        id: 'gst_1',
        organizationId: ORG,
        gstin: GSTIN,
        isActive: false,
        isDefault: false,
        legalName: 'Old Name',
        stateCode: '27',
      },
    ]);

    const result = await service.create(ORG, baseDto({ legalName: 'New Name' }));

    expect(tx.organizationGstin.create).not.toHaveBeenCalled();
    // Same row id, so invoices issued under this registration still point at it.
    expect(tx.organizationGstin.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'gst_1' } }),
    );
    expect(result).toMatchObject({ isActive: true, legalName: 'New Name' });
  });

  it('makes the revived registration the default when no active one remains', async () => {
    const { service, tx } = build([
      { id: 'gst_1', organizationId: ORG, gstin: GSTIN, isActive: false, isDefault: false },
    ]);

    await service.create(ORG, baseDto());

    // The old count included inactive rows, so the only registration an org
    // had was never promoted to default and invoicing had none to pick.
    expect(tx.organizationGstin.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ isDefault: true }) }),
    );
  });

  it('still rejects a number that is registered and active', async () => {
    const { service } = build([
      { id: 'gst_1', organizationId: ORG, gstin: GSTIN, isActive: true, isDefault: true },
    ]);

    await expect(service.create(ORG, baseDto())).rejects.toBeInstanceOf(ConflictException);
  });

  it('treats a lowercase number as the same registration', async () => {
    const { service, tx } = build([
      { id: 'gst_1', organizationId: ORG, gstin: GSTIN, isActive: false, isDefault: false },
    ]);

    await service.create(ORG, baseDto({ gstin: GSTIN.toLowerCase() }));

    expect(tx.organizationGstin.create).not.toHaveBeenCalled();
    expect(tx.organizationGstin.update).toHaveBeenCalled();
  });

  it('does not clear the existing default when the add fails validation', async () => {
    // The unset used to run before the insert and outside a transaction, so a
    // rejected add left the org with no default at all.
    const { service, tx } = build([
      { id: 'gst_1', organizationId: ORG, gstin: '29AABCU9603R1ZM', isActive: true, isDefault: true },
    ]);

    await expect(
      service.create(ORG, baseDto({ stateCode: '29' })),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(tx.organizationGstin.updateMany).not.toHaveBeenCalled();
  });

  it('inserts a new row when the number has never been registered', async () => {
    const { service, tx } = build();
    await service.create(ORG, baseDto());
    expect(tx.organizationGstin.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ gstin: GSTIN, isDefault: true }),
      }),
    );
  });
});

describe('GstService.deactivate', () => {
  it('clears the default flag and promotes the oldest surviving registration', async () => {
    const { service, tx } = build([
      { id: 'gst_1', organizationId: ORG, gstin: GSTIN, isActive: true, isDefault: true },
      { id: 'gst_2', organizationId: ORG, gstin: '29AABCU9603R1ZM', isActive: true, isDefault: false },
    ]);

    await service.deactivate('gst_1', ORG);

    expect(tx.organizationGstin.update).toHaveBeenCalledWith({
      where: { id: 'gst_1' },
      data: { isActive: false, isDefault: false },
    });
    // Without this the org keeps a default flag on a dead row while
    // findDefault, which also requires isActive, returns nothing.
    expect(tx.organizationGstin.update).toHaveBeenCalledWith({
      where: { id: 'gst_2' },
      data: { isDefault: true },
    });
  });

  it('promotes nothing when the removed registration was not the default', async () => {
    const { service, tx } = build([
      { id: 'gst_1', organizationId: ORG, gstin: GSTIN, isActive: true, isDefault: false },
      { id: 'gst_2', organizationId: ORG, gstin: '29AABCU9603R1ZM', isActive: true, isDefault: true },
    ]);

    await service.deactivate('gst_1', ORG);

    expect(tx.organizationGstin.update).toHaveBeenCalledTimes(1);
  });
});
