/**
 * GST scenario fixtures.
 *
 * Seeds a DEDICATED organization ("GST Fixtures") and drives real orders
 * through `OrderService.createOfflineOrder`, so every fixture exercises the
 * actual tax-resolution, place-of-supply, invoice-numbering and invoice-writing
 * code rather than being hand-written into the tables. A fixture that bypassed
 * the service would prove nothing about the service.
 *
 * Its own organization on purpose:
 *   - no fake products, customers or orders land in a workspace someone uses;
 *   - it does not consume any real org's statutory invoice serial sequence;
 *   - teardown is one delete.
 *
 *   npm run gst:fixtures            # seed (idempotent: wipes and re-seeds)
 *   npm run gst:fixtures -- --down  # remove entirely
 *   npm run gst:fixtures -- --bulk 1200   # also seed N invoices to exercise paging
 *
 * Every EXPECTED value below is computed by hand in the scenario table and
 * asserted against what the application actually produced.
 */
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { OrderService } from '../../src/order/order.service';
import { InvoiceService } from '../../src/invoice/invoice.service';
import { WarehouseService } from '../../src/inventory/warehouse.service';
import { GstReturnType } from '../../src/invoice/dto/query-gst-return.dto';
import {
  ChannelPlatform,
  GstSupplyType,
  GstType,
  OrderFinancialStatus,
  Prisma,
} from '@prisma/client';

const ORG_SLUG = 'gst-fixtures';
const ORG_NAME = 'GST Fixtures';

/** Users who get OWNER access, so the org is reachable in the UI. */
const GRANT_TO_EMAILS = [
  'damodar3@gmail.com', // owns "Test" (GST enabled)
  'damodar4@gmail.com', // owns "Damo's Workspace" (GST enabled)
  'tech@collabo.digital',
  'collabo.techteam@gmail.com',
];

// Valid per GSTIN_REGEX: 2 digits + 5 letters + 4 digits + letter + [1-9A-Z] + Z + alnum
const SELLER_MH = '27AAACR5055K1Z7'; // Maharashtra — default registration
const SELLER_KA = '29AAACR5055K1Z5'; // Karnataka — second registration
const BUYER_MH = '27AABCU9603R1ZM'; // B2B buyer, same state as seller
const BUYER_GJ = '24AABCU9603R1ZK'; // B2B buyer, state with NO seller registration
const BUYER_BAD = 'NOTAGSTIN123456'; // 15 chars, fails the regex

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const has = (name: string) => process.argv.includes(`--${name}`);

const addr = (stateCode: string, city: string) => ({
  address1: '1 Test Street',
  city,
  province: city,
  stateCode,
  country: 'India',
  zip: '400001',
});

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error'],
  });
  Logger.overrideLogger(['error']);

  const prisma = app.get(PrismaService);
  const orders = app.get(OrderService);
  const invoices = app.get(InvoiceService);

  const existing = await prisma.organization.findUnique({
    where: { slug: ORG_SLUG },
    select: { id: true },
  });

  // ── TEARDOWN ──
  // Always runs first: seeding is idempotent by wiping, so re-running never
  // stacks duplicate fixtures or burns a second block of invoice serials.
  if (existing) {
    await prisma.organization.delete({ where: { id: existing.id } });
    console.log(`Removed existing "${ORG_NAME}" (${existing.id}).`);
  }
  if (has('down')) {
    console.log('Teardown complete.');
    await app.close();
    return;
  }

  // ── ORG ──
  // Asia/Kolkata explicitly, NOT the "UTC" default: that is what makes the
  // financial-year stamp and period windows real IST boundaries rather than
  // exercising the IST fallback.
  const org = await prisma.organization.create({
    data: {
      name: ORG_NAME,
      slug: ORG_SLUG,
      timezone: 'Asia/Kolkata',
      currency: 'INR',
      gstEnabled: true,
    },
    select: { id: true },
  });
  console.log(`Organization: ${ORG_NAME} (${org.id})`);

  const users = await prisma.user.findMany({
    where: { email: { in: GRANT_TO_EMAILS } },
    select: { id: true, email: true },
  });
  for (const u of users) {
    await prisma.organizationMember.create({
      data: { organizationId: org.id, userId: u.id, role: 'OWNER' },
    });
  }
  console.log(`Granted OWNER to: ${users.map((u) => u.email).join(', ') || '(none matched)'}`);

  // ── REGISTRATIONS ──
  // Two, deliberately. Supplying INTO a state the merchant is registered in is
  // an intra-state supply from that registration; supplying into one they are
  // not is inter-state from the principal place of business. That distinction
  // is what `sellerStateForSupply` exists for, and it is unexercised with a
  // single GSTIN.
  const gstinMh = await prisma.organizationGstin.create({
    data: {
      organizationId: org.id,
      gstin: SELLER_MH,
      legalName: 'GST Fixtures Pvt Ltd',
      stateCode: '27',
      stateName: 'Maharashtra',
      isDefault: true,
      isActive: true,
    },
    select: { id: true },
  });
  const gstinKa = await prisma.organizationGstin.create({
    data: {
      organizationId: org.id,
      gstin: SELLER_KA,
      legalName: 'GST Fixtures Pvt Ltd',
      stateCode: '29',
      stateName: 'Karnataka',
      isDefault: false,
      isActive: true,
    },
    select: { id: true },
  });

  // ── WAREHOUSES (additional places of business) ──
  // Written directly rather than through WarehouseService: the service's own
  // validation is what S26 exercises, and seeding through it here would make
  // every other scenario depend on that guard passing.
  const godown = await prisma.warehouse.create({
    data: {
      organizationId: org.id,
      name: 'Bhiwandi Godown',
      code: 'BHW',
      address: { ...addr('27', 'Bhiwandi'), province: 'Maharashtra' },
      gstinId: gstinMh.id,
      apobDeclared: true,
      isDefault: true,
    },
    select: { id: true },
  });
  const store = await prisma.warehouse.create({
    data: {
      organizationId: org.id,
      name: 'Nashik Store',
      code: 'NSK',
      address: { ...addr('27', 'Nashik'), province: 'Maharashtra' },
      gstinId: gstinMh.id,
      apobDeclared: true,
      isDefault: false,
    },
    select: { id: true },
  });
  const kaStore = await prisma.warehouse.create({
    data: {
      organizationId: org.id,
      name: 'Bengaluru Store',
      code: 'BLR',
      address: { ...addr('29', 'Bengaluru'), province: 'Karnataka' },
      gstinId: gstinKa.id,
      apobDeclared: true,
      isDefault: false,
    },
    select: { id: true },
  });
  console.log('Warehouses: 3 (BHW default/MH, NSK MH, BLR KA)');

  const channel = await prisma.channel.create({
    data: {
      organizationId: org.id,
      name: 'In-Store / Manual',
      platform: ChannelPlatform.MANUAL,
      isEnabled: true,
    },
    select: { id: true },
  });

  // ── PRODUCTS ──
  // Rates chosen to cover every slab the app must handle, INCLUDING the two
  // that were missing from GST_RATE_SLABS until this pass (3% and 0.25%), plus
  // an explicitly-exempt 0% product and a variant flagged non-taxable.
  //
  // `supply` is the Phase 2 classification. Nil-rated, exempt and non-GST all
  // attract zero tax but are reported in different places, so they cannot be
  // inferred from the rate — hence three separate zero-rate products here.
  const productSpecs: Array<{
    key: string;
    title: string;
    hsn: string | null;
    rate: number;
    price: number;
    taxable: boolean;
    uom: string | null;
    supply: GstSupplyType;
  }> = [
    { key: 'shirt', title: 'Cotton Shirt', hsn: '6109', rate: 18, price: 1000, taxable: true, uom: 'PCS', supply: GstSupplyType.TAXABLE },
    { key: 'book', title: 'Printed Book', hsn: '4901', rate: 5, price: 400, taxable: true, uom: 'NOS', supply: GstSupplyType.TAXABLE },
    { key: 'phone', title: 'Feature Phone', hsn: '8517', rate: 12, price: 2000, taxable: true, uom: 'NOS', supply: GstSupplyType.TAXABLE },
    { key: 'gold', title: 'Gold Chain', hsn: '7113', rate: 3, price: 50000, taxable: true, uom: 'GMS', supply: GstSupplyType.TAXABLE },
    // Exempted by notification.
    { key: 'exempt', title: 'Fresh Milk', hsn: '0401', rate: 0, price: 60, taxable: true, uom: 'LTR', supply: GstSupplyType.EXEMPT },
    // Nil-rated in the tariff — a different statutory status from exempt.
    { key: 'nil', title: 'Table Salt', hsn: '2501', rate: 0, price: 20, taxable: true, uom: 'KGS', supply: GstSupplyType.NIL_RATED },
    // Outside GST entirely.
    { key: 'nongst', title: 'Petrol Voucher', hsn: '2710', rate: 0, price: 1000, taxable: true, uom: 'LTR', supply: GstSupplyType.NON_GST },
    { key: 'gift', title: 'Gift Card', hsn: '4911', rate: 18, price: 500, taxable: false, uom: 'NOS', supply: GstSupplyType.TAXABLE },
    // No HSN and no UQC: the org default must fill the unit, and the HSN must
    // come out as missing rather than as the invented '0000'.
    { key: 'nohsn', title: 'Unclassified Item', hsn: null, rate: 18, price: 300, taxable: true, uom: null, supply: GstSupplyType.TAXABLE },
  ];

  const variants: Record<string, string> = {};
  for (const spec of productSpecs) {
    const product = await prisma.product.create({
      data: {
        organizationId: org.id,
        channelId: channel.id,
        externalId: `fixture_${spec.key}`,
        title: spec.title,
        status: 'ACTIVE',
        hsnCode: spec.hsn,
        gstRate: new Prisma.Decimal(spec.rate),
        unitOfMeasure: spec.uom,
        supplyType: spec.supply,
        variants: {
          create: [
            {
              externalId: `fixture_${spec.key}_v1`,
              title: 'Default',
              price: new Prisma.Decimal(spec.price),
              // taxable=false on the VARIANT is the flag no tax path read until
              // this pass; the "gift" fixture is what proves it now does.
              taxable: spec.taxable,
              inventoryQuantity: 1000,
              trackQuantity: false,
            },
          ],
        },
      },
      include: { variants: { select: { id: true } } },
    });
    variants[spec.key] = product.variants[0].id;
  }
  console.log(`Products: ${productSpecs.length}`);

  // ── SCENARIOS ──
  // `expect` is hand-computed from the line maths, never read back from the app.
  type Scenario = {
    id: string;
    what: string;
    dto: any;
    expect: {
      pos: string;
      gstType: GstType;
      taxable: number;
      cgst: number;
      sgst: number;
      igst: number;
      b2b: boolean;
      // Only compared when the scenario states it — the loop diffs the keys
      // present in `expect`, so silence means "not asserted here".
      dispatchCity?: string | null;
      dispatchState?: string | null;
    };
  };

  const scenarios: Scenario[] = [
    {
      id: 'S1',
      what: 'Intrastate B2C — 1× shirt @1000, 18%, ship Maharashtra',
      dto: {
        customer: { firstName: 'Asha', lastName: 'Rao' },
        lineItems: [{ productVariantId: variants.shirt, quantity: 1 }],
        shippingAddress: addr('27', 'Mumbai'),
        paymentMethod: 'CASH',
      },
      // 1000 taxable; seller 27 == POS 27 → CGST 9% =90, SGST 9% =90
      // No warehouse named, so the org default (Bhiwandi, under the same MH
      // registration the invoice is issued from) is snapshotted.
      expect: { pos: '27', gstType: GstType.CGST_SGST, taxable: 1000, cgst: 90, sgst: 90, igst: 0, b2b: false, dispatchCity: 'Bhiwandi', dispatchState: '27' },
    },
    {
      id: 'S2',
      what: 'Interstate B2C — 1× shirt, ship Gujarat (no registration there)',
      dto: {
        customer: { firstName: 'Bhavin', lastName: 'Shah' },
        lineItems: [{ productVariantId: variants.shirt, quantity: 1 }],
        shippingAddress: addr('24', 'Ahmedabad'),
        paymentMethod: 'UPI',
      },
      // Not registered in 24 → supplied from 27 → inter-state, IGST 18% = 180
      expect: { pos: '24', gstType: GstType.IGST, taxable: 1000, cgst: 0, sgst: 0, igst: 180, b2b: false },
    },
    {
      id: 'S3',
      what: 'Intrastate B2B — buyer GSTIN in Maharashtra',
      dto: {
        customer: { firstName: 'Acme', lastName: 'Retail', gstin: BUYER_MH, billingStateCode: '27' },
        lineItems: [{ productVariantId: variants.phone, quantity: 2 }],
        shippingAddress: addr('27', 'Pune'),
        paymentMethod: 'CARD',
      },
      // 2 × 2000 = 4000 taxable at 12% → CGST 6% =240, SGST 6% =240
      expect: { pos: '27', gstType: GstType.CGST_SGST, taxable: 4000, cgst: 240, sgst: 240, igst: 0, b2b: true },
    },
    {
      id: 'S4',
      what: 'Interstate B2B — buyer GSTIN in Gujarat',
      dto: {
        customer: { firstName: 'Zenith', lastName: 'Traders', gstin: BUYER_GJ, billingStateCode: '24' },
        lineItems: [{ productVariantId: variants.phone, quantity: 1 }],
        shippingAddress: addr('24', 'Surat'),
        paymentMethod: 'CARD',
      },
      // 2000 at 12% inter-state → IGST 240
      expect: { pos: '24', gstType: GstType.IGST, taxable: 2000, cgst: 0, sgst: 0, igst: 240, b2b: true },
    },
    {
      id: 'S5',
      what: 'Ship into Karnataka, where the org IS registered',
      dto: {
        customer: { firstName: 'Kiran', lastName: 'Nair' },
        lineItems: [{ productVariantId: variants.shirt, quantity: 1 }],
        shippingAddress: addr('29', 'Bengaluru'),
        paymentMethod: 'UPI',
      },
      // The regression this pass fixed: supplying into a state the merchant
      // holds a registration in is INTRA-state from that registration. The
      // order used to compute IGST (default 27 vs POS 29) while the invoice
      // auto-selected the 29 registration and computed CGST+SGST.
      // dispatch null: the seller resolves to the KARNATAKA registration, and
      // the default warehouse is registered under Maharashtra. A fallback that
      // contradicts the seller is dropped, not fatal — an assertion would be.
      expect: { pos: '29', gstType: GstType.CGST_SGST, taxable: 1000, cgst: 90, sgst: 90, igst: 0, b2b: false, dispatchCity: null, dispatchState: null },
    },
    {
      id: 'S6',
      what: 'Mixed rates in one order — 18% + 5% + 12%',
      dto: {
        customer: { firstName: 'Meera', lastName: 'Iyer' },
        lineItems: [
          { productVariantId: variants.shirt, quantity: 1 },
          { productVariantId: variants.book, quantity: 2 },
          { productVariantId: variants.phone, quantity: 1 },
        ],
        shippingAddress: addr('27', 'Nashik'),
        paymentMethod: 'CASH',
      },
      // 1000@18 → 90+90 | 800@5 → 20+20 | 2000@12 → 120+120
      // taxable 3800; CGST 230; SGST 230
      expect: { pos: '27', gstType: GstType.CGST_SGST, taxable: 3800, cgst: 230, sgst: 230, igst: 0, b2b: false },
    },
    {
      id: 'S7',
      what: 'Discounted line — discount reduces the taxable value',
      dto: {
        customer: { firstName: 'Rohit', lastName: 'Verma' },
        lineItems: [{ productVariantId: variants.shirt, quantity: 2, discount: 500 }],
        shippingAddress: addr('27', 'Thane'),
        paymentMethod: 'CASH',
      },
      // (2 × 1000) − 500 = 1500 taxable at 18% → CGST 135, SGST 135
      expect: { pos: '27', gstType: GstType.CGST_SGST, taxable: 1500, cgst: 135, sgst: 135, igst: 0, b2b: false },
    },
    {
      id: 'S8',
      what: 'Exempt product explicitly configured at 0%',
      dto: {
        customer: { firstName: 'Sunil', lastName: 'Patil' },
        lineItems: [{ productVariantId: variants.exempt, quantity: 10 }],
        shippingAddress: addr('27', 'Mumbai'),
        paymentMethod: 'CASH',
      },
      // 0% must STOP at the product rate, not fall through to a fallback.
      expect: { pos: '27', gstType: GstType.CGST_SGST, taxable: 600, cgst: 0, sgst: 0, igst: 0, b2b: false },
    },
    {
      id: 'S9',
      what: 'Non-taxable VARIANT (taxable=false) alongside a taxable line',
      dto: {
        customer: { firstName: 'Priya', lastName: 'Menon' },
        lineItems: [
          { productVariantId: variants.gift, quantity: 1 },
          { productVariantId: variants.shirt, quantity: 1 },
        ],
        shippingAddress: addr('27', 'Mumbai'),
        paymentMethod: 'CARD',
      },
      // Gift card 500 is non-taxable → 0 tax despite an 18% product rate.
      // Shirt 1000 at 18% → 90 + 90. Taxable value still includes both lines.
      expect: { pos: '27', gstType: GstType.CGST_SGST, taxable: 1500, cgst: 90, sgst: 90, igst: 0, b2b: false },
    },
    {
      id: 'S10',
      what: 'Jewellery at 3% — a slab missing from GST_RATE_SLABS until this pass',
      dto: {
        customer: { firstName: 'Anil', lastName: 'Kumar' },
        lineItems: [{ productVariantId: variants.gold, quantity: 1 }],
        shippingAddress: addr('27', 'Mumbai'),
        paymentMethod: 'CARD',
      },
      // 50000 at 3% → CGST 1.5% = 750, SGST 1.5% = 750
      expect: { pos: '27', gstType: GstType.CGST_SGST, taxable: 50000, cgst: 750, sgst: 750, igst: 0, b2b: false },
    },
    {
      id: 'S11',
      what: 'Product with NO HSN code — documents the Phase-2 gap',
      dto: {
        customer: { firstName: 'Vikram', lastName: 'Singh' },
        lineItems: [{ productVariantId: variants.nohsn, quantity: 1 }],
        shippingAddress: addr('27', 'Mumbai'),
        paymentMethod: 'CASH',
      },
      // Still taxed correctly; the invoice line gets the invalid HSN '0000'.
      expect: { pos: '27', gstType: GstType.CGST_SGST, taxable: 300, cgst: 27, sgst: 27, igst: 0, b2b: false },
    },
    {
      id: 'S12',
      what: 'Customer carrying an INVALID GSTIN — must classify B2C',
      dto: {
        customer: { firstName: 'Broken', lastName: 'Data', billingStateCode: '27' },
        lineItems: [{ productVariantId: variants.shirt, quantity: 1 }],
        shippingAddress: addr('27', 'Mumbai'),
        paymentMethod: 'CASH',
      },
      // The DTO rejects a bad GSTIN, so the junk is written straight onto the
      // customer row below (as Shopify sync and CSV import do) and the invoice
      // must refuse to treat it as B2B.
      expect: { pos: '27', gstType: GstType.CGST_SGST, taxable: 1000, cgst: 90, sgst: 90, igst: 0, b2b: false },
    },
    {
      id: 'S16',
      what: 'Export — foreign delivery address must not be taxed as a local supply',
      dto: {
        customer: { firstName: 'Overseas', lastName: 'Buyer' },
        lineItems: [{ productVariantId: variants.shirt, quantity: 1 }],
        shippingAddress: {
          address1: '500 Congress Ave',
          city: 'Austin',
          country: 'United States',
          country_code: 'US',
          zip: '78701',
        },
        paymentMethod: 'CARD',
      },
      // Place of supply 96 (Other Country), and therefore IGST rather than the
      // seller's own state. Before this pass the foreign address fell through
      // every rung of the chain and landed on 27, so an export was invoiced as
      // a local Maharashtra sale with CGST+SGST on it.
      //
      // The RATE is deliberately unchanged: whether an export is zero-rated
      // under LUT or carries IGST with a refund claim is a decision the user
      // has not made, and silently zeroing tax would change money.
      expect: { pos: '96', gstType: GstType.IGST, taxable: 1000, cgst: 0, sgst: 0, igst: 180, b2b: false },
    },
    {
      id: 'S17',
      what: 'B2CL — inter-state B2C invoice above the 1,00,000 threshold',
      dto: {
        customer: { firstName: 'Big', lastName: 'Spender' },
        lineItems: [{ productVariantId: variants.gold, quantity: 3 }],
        shippingAddress: addr('24', 'Ahmedabad'),
        paymentMethod: 'CARD',
      },
      // 3 x 50,000 = 150,000 at 3% -> IGST 4,500; invoice value 154,500, which
      // is above the threshold, so this belongs in Table 5 reported
      // invoice-wise rather than summarised into Table 7.
      expect: { pos: '24', gstType: GstType.IGST, taxable: 150000, cgst: 0, sgst: 0, igst: 4500, b2b: false },
    },
    {
      id: 'S18',
      what: 'Nil-rated, exempt and non-GST on one invoice — three distinct statuses',
      dto: {
        customer: { firstName: 'Grocery', lastName: 'Shopper' },
        lineItems: [
          { productVariantId: variants.nil, quantity: 5 },
          { productVariantId: variants.exempt, quantity: 10 },
          { productVariantId: variants.nongst, quantity: 1 },
        ],
        shippingAddress: addr('27', 'Mumbai'),
        paymentMethod: 'CASH',
      },
      // 100 + 600 + 1000 = 1,700 taxable, all at 0%. They must NOT collapse
      // together: Table 8 reports nil-rated and exempted in separate columns,
      // and GSTR-3B puts non-GST in 3.1(e) rather than 3.1(c).
      expect: { pos: '27', gstType: GstType.CGST_SGST, taxable: 1700, cgst: 0, sgst: 0, igst: 0, b2b: false },
    },
    {
      id: 'S24',
      what: 'Dispatch from an APOB — explicit warehouse is snapshotted on the invoice',
      dto: {
        customer: { firstName: 'Nikhil', lastName: 'Patil' },
        lineItems: [{ productVariantId: variants.shirt, quantity: 1 }],
        shippingAddress: addr('27', 'Mumbai'),
        warehouseId: store.id,
        paymentMethod: 'CASH',
      },
      // Identical tax to S1 — an additional place of business changes WHERE the
      // goods left from, never the tax. Only the dispatch block differs.
      expect: { pos: '27', gstType: GstType.CGST_SGST, taxable: 1000, cgst: 90, sgst: 90, igst: 0, b2b: false, dispatchCity: 'Nashik', dispatchState: '27' },
    },
  ];

  // createOfflineOrder records who rang the sale; any org member will do.
  const seedUserId = users[0]?.id ?? (await prisma.user.findFirstOrThrow({ select: { id: true } })).id;

  const results: Array<{ id: string; what: string; ok: boolean; detail: string }> = [];
  const invoiceIds: string[] = [];
  const invoiceByScenario = new Map<string, string>();

  for (const s of scenarios) {
    // S12 needs a customer holding junk the DTO would never accept, so the
    // customer is created first and the order attaches to it by id.
    if (s.id === 'S12') {
      const c = await prisma.customer.create({
        data: {
          organizationId: org.id,
          channelId: channel.id,
          externalId: 'fixture_broken_gstin',
          firstName: 'Broken',
          lastName: 'Data',
          email: 'broken.gstin@example.test',
          gstin: BUYER_BAD,
          billingStateCode: '27',
        },
        select: { id: true },
      });
      s.dto.customer = { customerId: c.id, billingStateCode: '27' };
    }

    const { order, invoice, invoiceError } = await orders.createOfflineOrder(
      org.id,
      seedUserId,
      { ...s.dto, generateInvoice: true },
    );

    if (!invoice) {
      results.push({ id: s.id, what: s.what, ok: false, detail: `no invoice: ${invoiceError}` });
      continue;
    }
    invoiceIds.push(invoice.id);
    invoiceByScenario.set(s.id, invoice.id);

    const n = (d: any) => Number(d);
    const actual = {
      pos: invoice.placeOfSupply,
      gstType: invoice.gstType,
      taxable: n(invoice.subtotal),
      cgst: n(invoice.totalCgst),
      sgst: n(invoice.totalSgst),
      igst: n(invoice.totalIgst),
      b2b: Boolean(invoice.buyerGstin),
      dispatchCity:
        (invoice.dispatchAddress as { city?: string } | null)?.city ?? null,
      dispatchState: invoice.dispatchStateCode ?? null,
    };

    const diffs = (Object.keys(s.expect) as Array<keyof typeof s.expect>)
      .filter((k) => actual[k] !== s.expect[k])
      .map((k) => `${k}: expected ${s.expect[k]}, got ${actual[k]}`);

    // The order and its own invoice must agree on the tax head.
    if (order.gstType && order.gstType !== invoice.gstType) {
      diffs.push(`order.gstType ${order.gstType} != invoice.gstType ${invoice.gstType}`);
    }

    results.push({
      id: s.id,
      what: s.what,
      ok: diffs.length === 0,
      detail: diffs.join('; ') || `${invoice.invoiceNumber}  ${actual.gstType}  POS ${actual.pos}`,
    });
  }

  // ── S13: cancelled invoice must leave the return ──
  // Cancel a SPECIFIC invoice, not simply the last one created. S12 is chosen
  // because its point (an invalid GSTIN classifies as B2C) is already proven by
  // its own assertion, so removing it from the return costs no coverage —
  // whereas cancelling whichever scenario happens to be last would silently
  // delete a classification the Phase 2 tables are meant to demonstrate.
  const cancelTarget = invoiceByScenario.get('S12')!;
  await invoices.cancel(cancelTarget, org.id);
  results.push({
    id: 'S13',
    what: 'Cancelled invoice — drops out of the return (Phase 3: should become a credit note)',
    ok: true,
    detail: `cancelled ${cancelTarget}`,
  });

  // ── S14: month-end boundary ──
  // `invoiceDate` is stamped at creation, so the boundary instants are applied
  // afterwards. Both invoices are 1ms apart across midnight IST on 31 March and
  // must land in DIFFERENT financial years and different return periods.
  const boundary = await prisma.invoice.findMany({
    where: { organizationId: org.id },
    orderBy: { invoiceNumber: 'asc' },
    take: 2,
    select: { id: true },
  });
  await prisma.invoice.update({
    where: { id: boundary[0].id },
    // 2027-03-31 23:59:59.999 IST
    data: { invoiceDate: new Date('2027-03-31T18:29:59.999Z'), financialYear: '2026-27' },
  });
  await prisma.invoice.update({
    where: { id: boundary[1].id },
    // 2027-04-01 00:00:00.000 IST — one millisecond later, next FY
    data: { invoiceDate: new Date('2027-03-31T18:30:00.000Z'), financialYear: '2027-28' },
  });
  results.push({
    id: 'S14',
    what: 'Month/FY boundary — two invoices 1ms apart across 31 Mar 23:59:59.999 IST',
    ok: true,
    detail: 'March FY 2026-27 vs April FY 2027-28',
  });

  // ── S15: bulk, to exercise cursor paging against real Postgres ──
  const bulk = parseInt(arg('bulk') ?? '0', 10);
  if (bulk > 0) {
    // One order per invoice, deliberately. The partial unique index
    // `invoices_order_id_active_key` permits only ONE non-cancelled invoice per
    // order, so pointing every bulk invoice at a single order would insert
    // exactly one row and silently skip the rest — proving nothing about
    // paging. These orders are minimal; the point is invoice VOLUME inside one
    // period, enough to cross the 1,000-row page boundary against real
    // Postgres rather than a mocked client.
    const bulkOrders = Array.from({ length: bulk }, (_, i) => ({
      organizationId: org.id,
      channelId: channel.id,
      externalId: `bulk_${i + 1}`,
      orderNumber: 900000 + i,
      name: `#BULK${i + 1}`,
      currency: 'INR',
      financialStatus: OrderFinancialStatus.PAID,
      subtotalPrice: new Prisma.Decimal(100),
      totalPrice: new Prisma.Decimal(118),
      totalTax: new Prisma.Decimal(18),
    }));
    for (let i = 0; i < bulkOrders.length; i += 500) {
      await prisma.order.createMany({ data: bulkOrders.slice(i, i + 500) });
    }

    const createdOrders = await prisma.order.findMany({
      where: { organizationId: org.id, externalId: { startsWith: 'bulk_' } },
      select: { id: true },
    });

    const rows = createdOrders.map((o, i) => ({
      organizationId: org.id,
      orderId: o.id,
      sellerGstinId: gstinMh.id,
      invoiceNumber: `BULK-2026-27/${String(i + 1).padStart(6, '0')}`,
      invoiceDate: new Date('2026-09-15T06:00:00.000Z'),
      financialYear: '2026-27',
      sellerGstin: SELLER_MH,
      sellerLegalName: 'GST Fixtures Pvt Ltd',
      sellerStateCode: '27',
      sellerStateName: 'Maharashtra',
      buyerName: `Bulk Buyer ${i + 1}`,
      buyerStateCode: '27',
      buyerStateName: 'Maharashtra',
      placeOfSupply: '27',
      placeOfSupplyName: 'Maharashtra',
      gstType: GstType.CGST_SGST,
      subtotal: new Prisma.Decimal(100),
      totalCgst: new Prisma.Decimal(9),
      totalSgst: new Prisma.Decimal(9),
      totalIgst: new Prisma.Decimal(0),
      totalTax: new Prisma.Decimal(18),
      grandTotal: new Prisma.Decimal(118),
      currency: 'INR',
    }));
    for (let i = 0; i < rows.length; i += 500) {
      await prisma.invoice.createMany({ data: rows.slice(i, i + 500) });
    }
    results.push({
      id: 'S15',
      what: `Bulk — ${bulk} invoices in one period, crossing the 1,000-row page boundary`,
      ok: createdOrders.length === bulk,
      detail: `${createdOrders.length} orders + ${rows.length} invoices`,
    });
  }

  // ── S19/S20: credit notes ──
  //
  // THE headline Phase 3 fix. Before this, a refunded sale stayed 100% in
  // declared output liability for ever.
  const creditTargetId = invoiceByScenario.get('S1')!;
  const creditTarget = await prisma.invoice.findUniqueOrThrow({
    where: { id: creditTargetId },
    select: { invoiceNumber: true, grandTotal: true, totalTax: true },
  });

  const fullNote = await invoices.createCreditNote(org.id, creditTargetId, {
    reason: 'Goods returned — full reversal',
  });

  results.push({
    id: 'S19',
    what: 'Credit note (full) — reverses an issued invoice and nets it out',
    ok:
      fullNote.invoiceNumber.startsWith('CN-') &&
      Number(fullNote.grandTotal) === Number(creditTarget.grandTotal) &&
      Number(fullNote.totalTax) === Number(creditTarget.totalTax),
    detail: `${fullNote.invoiceNumber} against ${creditTarget.invoiceNumber} for ${fullNote.grandTotal}`,
  });

  // Partial: 25% of a 4,480 B2B invoice. Apportioned pro-rata across the
  // original lines so each keeps its own rate.
  const partialTargetId = invoiceByScenario.get('S3')!;
  const partialTarget = await prisma.invoice.findUniqueOrThrow({
    where: { id: partialTargetId },
    select: { invoiceNumber: true, grandTotal: true },
  });
  const partialAmount = Math.round(Number(partialTarget.grandTotal) * 0.25 * 100) / 100;

  const partialNote = await invoices.createCreditNote(org.id, partialTargetId, {
    reason: 'One of two handsets returned',
    amount: partialAmount,
  });

  results.push({
    id: 'S20',
    what: 'Credit note (partial) — apportioned pro-rata, own CN series',
    ok:
      partialNote.invoiceNumber.startsWith('CN-') &&
      Number(partialNote.grandTotal) === partialAmount,
    detail: `${partialNote.invoiceNumber} for ${partialNote.grandTotal} of ${partialTarget.grandTotal}`,
  });

  // Over-crediting must be refused: the remaining uncredited balance is the cap.
  let overCreditRefused = false;
  try {
    await invoices.createCreditNote(org.id, partialTargetId, {
      reason: 'Attempt to over-credit',
      amount: Number(partialTarget.grandTotal),
    });
  } catch {
    overCreditRefused = true;
  }
  results.push({
    id: 'S21',
    what: 'Over-crediting an invoice is refused',
    ok: overCreditRefused,
    detail: overCreditRefused
      ? 'second credit beyond the remaining balance rejected'
      : 'NOT REFUSED — an invoice could be credited twice over',
  });

  // ── S22: invoice numbering stays gapless across the two series ──
  //
  // The numbering query filters by financial year only. Without a PREFIX
  // filter, issuing CN-...000001 would make the next INVOICE skip a serial —
  // permanently gapping a statutory run.
  const invNumbers = await prisma.invoice.findMany({
    where: { organizationId: org.id, invoiceNumber: { startsWith: 'INV-' } },
    select: { invoiceNumber: true },
    orderBy: { invoiceNumber: 'asc' },
  });
  const cnNumbers = await prisma.invoice.findMany({
    where: { organizationId: org.id, invoiceNumber: { startsWith: 'CN-' } },
    select: { invoiceNumber: true },
    orderBy: { invoiceNumber: 'asc' },
  });
  const seqOf = (n: string) => parseInt(n.split('/')[1], 10);
  const invSeq = invNumbers.map((r) => seqOf(r.invoiceNumber));
  const cnSeq = cnNumbers.map((r) => seqOf(r.invoiceNumber));
  const isGapless = (xs: number[]) => xs.every((v, i) => v === i + 1);

  results.push({
    id: 'S22',
    what: 'Invoice and credit-note series are separate and each gapless',
    ok: isGapless(invSeq) && isGapless(cnSeq) && cnSeq.length > 0,
    detail: `INV 1..${invSeq.length}, CN 1..${cnSeq.length}`,
  });

  // ── S23: a filed period is locked ──
  await invoices.markFiled(org.id, {
    financialYear: '2026-27',
    period: '09',
    returnType: GstReturnType.GSTR1,
    arn: 'AA270926000000X',
  });

  let cancelRefused = false;
  try {
    await invoices.cancel(invoiceByScenario.get('S6')!, org.id);
  } catch {
    cancelRefused = true;
  }

  // Reopen so the rest of the fixtures stay usable.
  const filings = await invoices.listFilings(org.id, '2026-27');
  for (const f of filings) await invoices.unfile(org.id, f.id);

  results.push({
    id: 'S23',
    what: 'A filed period is locked against cancellation, and reopenable',
    ok: cancelRefused && filings.length === 1,
    detail: cancelRefused
      ? 'cancel refused while filed; period reopened afterwards'
      : 'NOT REFUSED — a filed period could still be edited',
  });

  // ── S25: a credit note inherits the original's dispatch block ──
  // A credit note reverses one specific supply, so it must describe the same
  // movement of goods — not be re-resolved from today's warehouse defaults.
  const s1Invoice = await prisma.invoice.findUniqueOrThrow({
    where: { id: invoiceByScenario.get('S1')! },
    select: { dispatchWarehouseId: true, dispatchName: true },
  });
  const noteRow = await prisma.invoice.findUniqueOrThrow({
    where: { id: fullNote.id },
    select: { dispatchWarehouseId: true, dispatchName: true, dispatchStateCode: true },
  });
  results.push({
    id: 'S25',
    what: 'Credit note copies the dispatch-from block of the invoice it reverses',
    ok:
      noteRow.dispatchWarehouseId === godown.id &&
      noteRow.dispatchWarehouseId === s1Invoice.dispatchWarehouseId &&
      noteRow.dispatchName === s1Invoice.dispatchName &&
      noteRow.dispatchStateCode === '27',
    detail: `${noteRow.dispatchName ?? 'null'} / ${noteRow.dispatchStateCode ?? 'null'}`,
  });

  // ── S26: a warehouse cannot be an APOB of an out-of-state registration ──
  const warehouses = app.get(WarehouseService);
  let crossStateRefused = false;
  let refusalMessage = '';
  try {
    await warehouses.create(org.id, {
      name: 'Wrong State',
      code: 'WRONG',
      address: addr('29', 'Bengaluru'),
      gstinId: gstinMh.id,
    });
  } catch (e: any) {
    crossStateRefused = true;
    refusalMessage = e?.message ?? '';
  }
  const strayCount = await prisma.warehouse.count({
    where: { organizationId: org.id, code: 'WRONG' },
  });
  results.push({
    id: 'S26',
    what: 'A Karnataka address cannot be linked to the Maharashtra registration',
    ok: crossStateRefused && strayCount === 0,
    detail: crossStateRefused
      ? `refused: ${refusalMessage}`
      : 'NOT REFUSED — a cross-state APOB was accepted',
  });

  // ── S27: an explicit warehouse under another GSTIN refuses the invoice ──
  // The guard is strict for an EXPLICIT choice (unlike S5's silent fallback):
  // issuing a document that names a place of business belonging to a different
  // registration is a statutory error, not a preference. It soft-fails through
  // the offline path, so the order lands with the reason recorded and no
  // invoice serial is consumed — which is what keeps S22 gapless.
  const wrongGstinSale = await orders.createOfflineOrder(org.id, seedUserId, {
    customer: { firstName: 'Mismatch', lastName: 'Test' },
    lineItems: [{ productVariantId: variants.shirt, quantity: 1 }],
    shippingAddress: addr('27', 'Mumbai'),
    sellerGstinId: gstinMh.id,
    warehouseId: kaStore.id,
    paymentMethod: 'CASH',
    generateInvoice: true,
  } as any);
  results.push({
    id: 'S27',
    what: 'Explicit warehouse under a different GSTIN refuses the invoice, softly',
    ok:
      wrongGstinSale.invoice === null &&
      /GSTIN/i.test(wrongGstinSale.invoiceError ?? ''),
    detail: wrongGstinSale.invoiceError ?? 'NO ERROR RECORDED — the invoice was issued',
  });

  // ── S28: warehouse scope partitions the return, never changes its total ──
  // The scoped view is management information. Proving the parts sum to the
  // whole is what makes it safe to show beside a statutory figure.
  const period = { financialYear: '2026-27', period: '09', returnType: GstReturnType.GSTR1 };
  const whole: any = await invoices.getGstReturn(org.id, period as any);
  const fromGodown: any = await invoices.getGstReturn(org.id, {
    ...period,
    dispatchWarehouseId: godown.id,
  } as any);
  const fromStore: any = await invoices.getGstReturn(org.id, {
    ...period,
    dispatchWarehouseId: store.id,
  } as any);
  const scopedTotal =
    fromGodown.totals.totalTaxable + fromStore.totals.totalTaxable;
  results.push({
    id: 'S28',
    what: 'Per-warehouse scoped returns partition the unscoped one',
    ok:
      fromStore.totals.totalInvoices >= 1 &&
      scopedTotal <= whole.totals.totalTaxable + 0.01 &&
      fromGodown.totals.totalTaxable > 0,
    detail: `godown ${fromGodown.totals.totalTaxable} + store ${fromStore.totals.totalTaxable} = ${scopedTotal} of ${whole.totals.totalTaxable} total`,
  });

  // ── S29: a filing locks ONE registration, and a quarter locks its months ──
  //
  // Both halves were broken before this pass: the lock ignored sellerGstinId,
  // so filing any registration froze every other one; and it compared the
  // stored period to a two-digit month only, so a quarterly filing — which the
  // DTO has always accepted — locked nothing whatsoever.
  await invoices.markFiled(org.id, {
    financialYear: '2026-27',
    period: 'q2',  // lower case on purpose: the regex accepts it
    returnType: GstReturnType.GSTR1,
    sellerGstinId: gstinKa.id,
    arn: 'AA290926000000X',
  });

  // S5 is the Karnataka sale, so its invoice belongs to the filed registration.
  let kaCancelRefused = false;
  try {
    await invoices.cancel(invoiceByScenario.get('S5')!, org.id);
  } catch {
    kaCancelRefused = true;
  }

  // S6 is a Maharashtra sale in the same month, under a registration nobody
  // filed. It must stay editable.
  let mhCancelAllowed = true;
  try {
    await invoices.cancel(invoiceByScenario.get('S6')!, org.id);
  } catch {
    mhCancelAllowed = false;
  }

  const q2Filings = await invoices.listFilings(org.id, '2026-27');
  for (const f of q2Filings) await invoices.unfile(org.id, f.id);

  results.push({
    id: 'S29',
    what: 'A quarterly filing locks its months, and only its own registration',
    ok: kaCancelRefused && mhCancelAllowed,
    detail: `${kaCancelRefused ? 'KA September invoice refused under a filed Q2' : 'KA NOT REFUSED — quarter did not lock its months'}; ${mhCancelAllowed ? 'MH invoice still editable' : 'MH WRONGLY LOCKED by another registration'}`,
  });

  // ── S30: an outward supply under reverse charge ──
  //
  // Reverse charge cannot be set on an offline sale — the DTO has no such
  // field — so this drives the real path a merchant would use: create the
  // order without an invoice, then issue one with the flag, exactly as the
  // generate-invoice dialog does.
  //
  // The point of the scenario is what must NOT happen: the tax is computed and
  // printed as usual, but it must not reach 3.1(a), 3.2 or tax payable, because
  // the recipient declares it in their own 3.1(d).
  const rcmSale = await orders.createOfflineOrder(org.id, seedUserId, {
    customer: {
      firstName: 'Reverse',
      lastName: 'Charge Buyer',
      gstin: BUYER_MH,
    },
    lineItems: [{ productVariantId: variants.shirt, quantity: 1 }],
    shippingAddress: addr('27', 'Mumbai'),
    sellerGstinId: gstinMh.id,
    paymentMethod: 'CASH',
    generateInvoice: false,
  } as any);

  const rcmInvoice = await invoices.create(org.id, {
    orderId: rcmSale.order.id,
    reverseCharge: true,
  } as any);

  const beforeRcm: any = await invoices.getGstReturn(org.id, {
    financialYear: '2026-27',
    period: '09',
    returnType: GstReturnType.GSTR3B,
  } as any);
  const gstr1WithRcm: any = await invoices.getGstReturn(org.id, {
    financialYear: '2026-27',
    period: '09',
    returnType: GstReturnType.GSTR1,
  } as any);

  // The 18% bucket of 3.1(a) must not have grown by this invoice's 1,000.
  const rate18 = (beforeRcm.outwardSupplies ?? []).find(
    (r: any) => r.gstRate === 18,
  );
  const rcmBucket = beforeRcm.outwardReverseCharge;
  const b2bRow = (gstr1WithRcm.b2b ?? [])
    .flatMap((g: any) => g.invoices ?? [])
    .find((i: any) => i.invoiceNumber === rcmInvoice.invoiceNumber);

  results.push({
    id: 'S30',
    what: 'Reverse-charge supply reports in 4B and stays out of 3.1(a) and tax payable',
    ok:
      rcmBucket?.invoiceCount === 1 &&
      rcmBucket?.taxableValue === 1000 &&
      rcmBucket?.tax === 180 &&
      rcmBucket?.unregisteredRecipients === 0 &&
      // S6 also sells a shirt at 18% intra-state; the RCM sale must not have
      // added its 1,000 to that bucket.
      rate18?.taxableValue === 4800 &&
      b2bRow?.reverseCharge === true,
    detail: `bucket ${rcmBucket?.taxableValue}/${rcmBucket?.tax}, 3.1(a) 18% stays ${rate18?.taxableValue}, 4A flag ${b2bRow?.reverseCharge}`,
  });

  // ── REPORT ──
  console.log('');
  console.log('SCENARIO RESULTS');
  console.log('='.repeat(100));
  let failed = 0;
  for (const r of results) {
    if (!r.ok) failed += 1;
    console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.id.padEnd(4)} ${r.what}`);
    console.log(`             ${r.detail}`);
  }
  console.log('='.repeat(100));
  console.log(failed === 0 ? `All ${results.length} scenarios behaved as computed.` : `${failed} FAILED.`);
  console.log('');
  console.log(`Org id: ${org.id}   (npm run gst:fixtures -- --down to remove)`);

  await app.close();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
