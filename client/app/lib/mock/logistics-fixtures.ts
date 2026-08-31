/**
 * Seed data for the mocked logistics workspace.
 *
 * Two rules carried over from `conversation-fixtures.ts`, for the same reasons:
 *
 * 1. Every timestamp is RELATIVE, built from a single `T0` captured at module
 *    init. Fixed dates rot — within a week every SLA reads as breached, every
 *    delivery promise is in the past, and the whole board looks broken rather
 *    than merely fake.
 *
 * 2. No `Math.random()`. Records are generated from a small seeded PRNG so the
 *    same shipment has the same weight, courier and cost on every page load.
 *    Randomness here would make the shipment list reshuffle its own numbers
 *    between the list view and the detail view.
 *
 * Vocabulary is deliberately shared with `conversation-fixtures.ts` — the same
 * customers, the same order numbers, the same products. `#10482`, `#10501` and
 * `#10466` exist in both, so "Open chat" from a shipment lands on a real thread.
 *
 * This file is pure data. Derivation (list projections, counts, timelines) lives
 * in `logistics-store.ts` so it applies identically to seeded records and to
 * ones created at runtime.
 */

import type {
  CourierPartner,
  PaymentMode,
  PickupLocation,
  ShipmentLineItem,
  ShipmentPackage,
  ShipmentServiceType,
  ShipmentStatus,
  ShippableOrder,
  ShippableOrderStatus,
  ShippingAddress,
} from "~/types/api";

import { chargeableWeight } from "~/lib/logistics-format";

/** Captured once, so every fixture in one page load shares a coherent clock. */
const T0 = Date.now();

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const minutesAgo = (n: number) => new Date(T0 - n * MINUTE).toISOString();
const hoursAgo = (n: number) => new Date(T0 - n * HOUR).toISOString();
const daysAgo = (n: number) => new Date(T0 - n * DAY).toISOString();
const hoursFromNow = (n: number) => new Date(T0 + n * HOUR).toISOString();
const daysFromNow = (n: number) => new Date(T0 + n * DAY).toISOString();

/**
 * Deterministic PRNG (mulberry32). Seeded per-record from its index, so record
 * 17 always draws the same numbers no matter what order records are built in.
 */
function rng(seed: number): () => number {
  let a = seed + 0x6d2b79f5;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = <T,>(items: readonly T[], r: () => number): T => items[Math.floor(r() * items.length)];
const between = (min: number, max: number, r: () => number) => min + r() * (max - min);
const round2 = (v: number) => Math.round(v * 100) / 100;

export const MOCK_CURRENCY = "INR";

/* ─── Couriers ──────────────────────────────────────────────────────────── */

export const MOCK_COURIERS: CourierPartner[] = [
  {
    id: "cur-delhivery",
    name: "Delhivery",
    initials: "DL",
    isActive: true,
    supportsCod: true,
    serviceTypes: ["SURFACE", "EXPRESS"],
    pincodesServed: 18700,
    avgTat: 3.1,
    deliveryRate: 94.6,
    ndrRate: 4.2,
    rtoRate: 3.8,
    avgCost: 86,
    rating: 4.5,
    shipmentCount: 1284,
    priority: 1,
  },
  {
    id: "cur-bluedart",
    name: "Blue Dart",
    initials: "BD",
    isActive: true,
    supportsCod: true,
    serviceTypes: ["EXPRESS", "AIR", "SAME_DAY"],
    pincodesServed: 12400,
    avgTat: 2.2,
    deliveryRate: 96.1,
    ndrRate: 3.1,
    rtoRate: 2.6,
    avgCost: 142,
    rating: 4.7,
    shipmentCount: 742,
    priority: 2,
  },
  {
    id: "cur-xpressbees",
    name: "XpressBees",
    initials: "XB",
    isActive: true,
    supportsCod: true,
    serviceTypes: ["SURFACE", "EXPRESS"],
    pincodesServed: 16100,
    avgTat: 3.6,
    deliveryRate: 92.3,
    ndrRate: 5.6,
    rtoRate: 5.1,
    avgCost: 74,
    rating: 4.1,
    shipmentCount: 968,
    priority: 3,
  },
  {
    id: "cur-ecom",
    name: "Ecom Express",
    initials: "EE",
    isActive: true,
    supportsCod: true,
    serviceTypes: ["SURFACE"],
    pincodesServed: 15300,
    avgTat: 3.9,
    deliveryRate: 91.2,
    ndrRate: 6.4,
    rtoRate: 5.9,
    avgCost: 71,
    rating: 3.9,
    shipmentCount: 611,
    priority: 4,
  },
  {
    id: "cur-dtdc",
    name: "DTDC",
    initials: "DT",
    isActive: true,
    supportsCod: false,
    serviceTypes: ["SURFACE", "EXPRESS"],
    pincodesServed: 13800,
    avgTat: 4.2,
    deliveryRate: 89.4,
    ndrRate: 7.1,
    rtoRate: 6.8,
    avgCost: 68,
    rating: 3.6,
    shipmentCount: 288,
    priority: 5,
  },
  {
    id: "cur-shadowfax",
    name: "Shadowfax",
    initials: "SF",
    isActive: false,
    supportsCod: true,
    serviceTypes: ["SAME_DAY", "EXPRESS"],
    pincodesServed: 4200,
    avgTat: 1.4,
    deliveryRate: 93.8,
    ndrRate: 4.9,
    rtoRate: 3.2,
    avgCost: 118,
    rating: 4.2,
    shipmentCount: 96,
    priority: 6,
  },
];

/* ─── Pickup locations ──────────────────────────────────────────────────── */

function originAddress(
  name: string,
  line1: string,
  city: string,
  state: string,
  pincode: string,
  phone: string,
): ShippingAddress {
  return {
    name,
    phone,
    line1,
    city,
    state,
    pincode,
    country: "India",
    isVerified: true,
  };
}

export const MOCK_PICKUP_LOCATIONS: PickupLocation[] = [
  {
    id: "loc-kochi",
    warehouseId: "wh-kochi",
    name: "Kochi Warehouse",
    code: "KOC-01",
    address: originAddress(
      "Collabo Fulfilment — Kochi",
      "Unit 4, Seaport-Airport Road, Kakkanad",
      "Kochi",
      "KL",
      "682037",
      "+91 98470 22110",
    ),
    isDefault: true,
    isActive: true,
    contactName: "Nisha Kurian",
    contactPhone: "+91 98470 22110",
    cutoffTime: "16:00",
    operatingHours: "Mon–Sat, 09:00–19:00",
    dailyCapacity: 320,
    usedCapacity: 214,
    serviceablePincodes: 17800,
    skuCount: 486,
    ordersAwaiting: 12,
    shipmentsProcessed30d: 1140,
  },
  {
    id: "loc-bengaluru",
    warehouseId: "wh-bengaluru",
    name: "Bengaluru Warehouse",
    code: "BLR-01",
    address: originAddress(
      "Collabo Fulfilment — Bengaluru",
      "Plot 22, Bommasandra Industrial Area",
      "Bengaluru",
      "KA",
      "560099",
      "+91 80471 33902",
    ),
    isDefault: false,
    isActive: true,
    contactName: "Arjun Prasad",
    contactPhone: "+91 80471 33902",
    cutoffTime: "17:00",
    operatingHours: "Mon–Sat, 08:30–20:00",
    dailyCapacity: 500,
    usedCapacity: 461,
    serviceablePincodes: 18200,
    skuCount: 612,
    ordersAwaiting: 9,
    shipmentsProcessed30d: 1806,
  },
  {
    id: "loc-mumbai",
    warehouseId: "wh-mumbai",
    name: "Mumbai Warehouse",
    code: "BOM-01",
    address: originAddress(
      "Collabo Fulfilment — Mumbai",
      "Godown 9, Bhiwandi Logistics Park",
      "Bhiwandi",
      "MH",
      "421302",
      "+91 22610 45518",
    ),
    isDefault: false,
    isActive: true,
    contactName: "Farhan Qureshi",
    contactPhone: "+91 22610 45518",
    cutoffTime: "15:30",
    operatingHours: "Mon–Sat, 09:00–18:30",
    dailyCapacity: 400,
    usedCapacity: 137,
    serviceablePincodes: 16900,
    skuCount: 398,
    ordersAwaiting: 5,
    shipmentsProcessed30d: 842,
  },
  {
    id: "loc-delhi",
    warehouseId: "wh-delhi",
    name: "Delhi NCR Warehouse",
    code: "DEL-01",
    address: originAddress(
      "Collabo Fulfilment — Delhi NCR",
      "Sector 63, Block C, Noida",
      "Noida",
      "UP",
      "201301",
      "+91 12040 77620",
    ),
    isDefault: false,
    isActive: false,
    contactName: "Devika Rao",
    contactPhone: "+91 12040 77620",
    cutoffTime: "16:30",
    operatingHours: "Currently closed for stock-take",
    dailyCapacity: 260,
    usedCapacity: 0,
    serviceablePincodes: 15400,
    skuCount: 121,
    ordersAwaiting: 2,
    shipmentsProcessed30d: 318,
  },
];

/* ─── Customers ─────────────────────────────────────────────────────────── */

interface MockCustomer {
  id: string;
  name: string;
  phone: string;
  email: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  pincode: string;
  tags: string[];
}

/**
 * The first seven names, their ids and their phone numbers are the same people
 * `conversation-fixtures.ts` seeds. Keeping them identical is what makes
 * "Open chat" from a shipment land somewhere real.
 */
export const MOCK_CUSTOMERS: MockCustomer[] = [
  { id: "cus-aarav", name: "Aarav Mehta", phone: "+91 98201 44310", email: "aarav.mehta@example.in", line1: "12 Hill Road, Bandra West", city: "Mumbai", state: "MH", pincode: "400050", tags: ["Repeat", "VIP"] },
  { id: "cus-priya", name: "Priya Nair", phone: "+91 94470 21188", email: "priya.nair@example.in", line1: "Sreelakam, Panampilly Nagar", line2: "Near South Bridge", city: "Kochi", state: "KL", pincode: "682036", tags: ["Repeat"] },
  { id: "cus-rohan", name: "Rohan Das", phone: "+91 90070 55214", email: "rohan.das@example.in", line1: "48/2 Indiranagar 100ft Road", city: "Bengaluru", state: "KA", pincode: "560038", tags: [] },
  { id: "cus-meera", name: "Meera Iyer", phone: "+91 98400 71903", email: "meera.iyer@example.in", line1: "9 Kasturi Rangan Road, Alwarpet", city: "Chennai", state: "TN", pincode: "600018", tags: ["VIP"] },
  { id: "cus-devika", name: "Devika Rao", phone: "+91 99860 30277", email: "devika.rao@example.in", line1: "Flat 704, Prestige Elgin, Jayanagar", city: "Bengaluru", state: "KA", pincode: "560041", tags: ["Repeat"] },
  { id: "cus-sana", name: "Sana Khan", phone: "+91 98110 62245", email: "sana.khan@example.in", line1: "C-14 Greater Kailash II", city: "New Delhi", state: "DL", pincode: "110048", tags: [] },
  { id: "cus-farhan", name: "Farhan Qureshi", phone: "+91 90040 71122", email: "farhan.q@example.in", line1: "22 Charminar Road, Old City", city: "Hyderabad", state: "TS", pincode: "500002", tags: ["COD only"] },
  { id: "cus-rahul", name: "Rahul Kumar", phone: "+91 98180 33471", email: "rahul.kumar@example.in", line1: "H-9 Sector 44", city: "Gurugram", state: "HR", pincode: "122003", tags: ["Repeat"] },
  { id: "cus-anu", name: "Anu Thomas", phone: "+91 94950 18820", email: "anu.thomas@example.in", line1: "Palathinkal House, Vazhuthacaud", city: "Thiruvananthapuram", state: "KL", pincode: "695014", tags: [] },
  { id: "cus-maya", name: "Maya Sharma", phone: "+91 98330 55019", email: "maya.sharma@example.in", line1: "301 Lake View, Powai", city: "Mumbai", state: "MH", pincode: "400076", tags: ["VIP", "Repeat"] },
  { id: "cus-vikram", name: "Vikram Reddy", phone: "+91 99490 26614", email: "vikram.reddy@example.in", line1: "8-2-120 Banjara Hills Road 2", city: "Hyderabad", state: "TS", pincode: "500034", tags: [] },
  { id: "cus-nikhil", name: "Nikhil Menon", phone: "+91 97440 90882", email: "nikhil.menon@example.in", line1: "17 Race Course Road", city: "Coimbatore", state: "TN", pincode: "641018", tags: ["Repeat"] },
];

function destinationOf(customer: MockCustomer): ShippingAddress {
  return {
    name: customer.name,
    phone: customer.phone,
    email: customer.email,
    line1: customer.line1,
    line2: customer.line2,
    city: customer.city,
    state: customer.state,
    pincode: customer.pincode,
    country: "India",
    isVerified: true,
  };
}

/* ─── Catalogue ─────────────────────────────────────────────────────────── */

interface MockProduct {
  id: string;
  variantId: string;
  title: string;
  variantTitle: string;
  sku: string;
  price: number;
  /** Kilograms, for a single unit. */
  weight: number;
}

export const MOCK_PRODUCTS: MockProduct[] = [
  { id: "prd-olive-shirt", variantId: "var-olive-shirt-m", title: "Olive Linen Shirt", variantTitle: "M / Olive", sku: "OLS-M-OLV", price: 2490, weight: 0.32 },
  { id: "prd-wide-trousers", variantId: "var-wide-trousers-32", title: "Cotton Wide-Leg Trousers", variantTitle: "32 / Sand", sku: "CWT-32-SND", price: 3190, weight: 0.48 },
  { id: "prd-ribbed-tank", variantId: "var-ribbed-tank-s", title: "Ribbed Tank", variantTitle: "S / Black", sku: "RBT-S-BLK", price: 1290, weight: 0.18 },
  { id: "prd-merino-crew", variantId: "var-merino-crew-l", title: "Merino Crew Sweater", variantTitle: "L / Charcoal", sku: "MCS-L-CHR", price: 5490, weight: 0.62 },
  { id: "prd-silk-scarf", variantId: "var-silk-scarf-one", title: "Silk Blend Scarf", variantTitle: "One size / Rust", sku: "SBS-OS-RST", price: 1890, weight: 0.09 },
  { id: "prd-canvas-tote", variantId: "var-canvas-tote-one", title: "Canvas Tote", variantTitle: "One size / Natural", sku: "CVT-OS-NAT", price: 1590, weight: 0.41 },
  { id: "prd-poplin-dress", variantId: "var-poplin-dress-m", title: "Poplin Midi Dress", variantTitle: "M / Ecru", sku: "PMD-M-ECR", price: 4290, weight: 0.38 },
  { id: "prd-leather-belt", variantId: "var-leather-belt-34", title: "Leather Belt", variantTitle: "34 / Tan", sku: "LTB-34-TAN", price: 2190, weight: 0.22 },
];

function buildLineItems(seed: number): ShipmentLineItem[] {
  const r = rng(seed * 31 + 7);
  const count = 1 + Math.floor(r() * 3);
  const chosen = new Set<number>();
  const items: ShipmentLineItem[] = [];

  for (let i = 0; i < count; i += 1) {
    let index = Math.floor(r() * MOCK_PRODUCTS.length);
    // Two lines of the same variant would render as a duplicate row rather than
    // a quantity, which reads as a data bug on the detail page.
    while (chosen.has(index)) index = (index + 1) % MOCK_PRODUCTS.length;
    chosen.add(index);

    const product = MOCK_PRODUCTS[index];
    items.push({
      id: `sli-${seed}-${i}`,
      productId: product.id,
      variantId: product.variantId,
      title: product.title,
      variantTitle: product.variantTitle,
      sku: product.sku,
      quantity: 1 + Math.floor(r() * 2),
      price: product.price,
      imageUrl: null,
    });
  }

  return items;
}

function itemsWeight(items: ShipmentLineItem[]): number {
  return items.reduce((sum, item) => {
    const product = MOCK_PRODUCTS.find((p) => p.variantId === item.variantId);
    return sum + (product?.weight ?? 0.3) * item.quantity;
  }, 0);
}

function itemsValue(items: ShipmentLineItem[]): number {
  return items.reduce((sum, item) => sum + item.price * item.quantity, 0);
}

/* ─── Shipments ─────────────────────────────────────────────────────────── */

/**
 * The status mix. Weighted towards the middle of the funnel because that is
 * what a real board looks like at midday, and because a screen that is 80%
 * DELIVERED gives the filters nothing to do.
 */
const STATUS_MIX: ShipmentStatus[] = [
  ...Array<ShipmentStatus>(2).fill("DRAFT"),
  ...Array<ShipmentStatus>(2).fill("COURIER_ASSIGNED"),
  ...Array<ShipmentStatus>(3).fill("AWB_ASSIGNED"),
  ...Array<ShipmentStatus>(6).fill("READY_TO_SHIP"),
  ...Array<ShipmentStatus>(4).fill("PICKUP_SCHEDULED"),
  ...Array<ShipmentStatus>(3).fill("PICKED_UP"),
  ...Array<ShipmentStatus>(10).fill("IN_TRANSIT"),
  ...Array<ShipmentStatus>(5).fill("OUT_FOR_DELIVERY"),
  ...Array<ShipmentStatus>(8).fill("DELIVERED"),
  ...Array<ShipmentStatus>(3).fill("DELAYED"),
  ...Array<ShipmentStatus>(4).fill("NDR"),
  "RTO_INITIATED",
  "RTO_IN_TRANSIT",
];

/** How far along the journey each status is, in "hours since created". */
const STATUS_AGE_HOURS: Record<ShipmentStatus, number> = {
  DRAFT: 1,
  COURIER_ASSIGNED: 2,
  AWB_ASSIGNED: 4,
  READY_TO_SHIP: 7,
  PICKUP_SCHEDULED: 11,
  PICKED_UP: 20,
  IN_TRANSIT: 40,
  OUT_FOR_DELIVERY: 62,
  DELIVERED: 76,
  DELAYED: 96,
  NDR: 70,
  RTO_INITIATED: 104,
  RTO_IN_TRANSIT: 128,
  RTO_DELIVERED: 160,
  CANCELLED: 30,
};

export interface SeedShipment {
  id: string;
  reference: string;
  orderId: string;
  orderName: string;
  customer: MockCustomer;
  courier: CourierPartner | null;
  serviceType: ShipmentServiceType | null;
  awb: string | null;
  status: ShipmentStatus;
  paymentMode: PaymentMode;
  codAmount: number;
  orderValue: number;
  lineItems: ShipmentLineItem[];
  packages: ShipmentPackage[];
  shippingCost: number;
  pickupLocation: PickupLocation;
  createdAt: string;
  expectedDeliveryAt: string | null;
  deliveredAt: string | null;
  isDelayed: boolean;
  notes: string | null;
}

/** AWBs look like the real thing: courier prefix plus a nine-digit run. */
function awbFor(courier: CourierPartner, index: number): string {
  return `${courier.initials}${String(482000000 + index * 137911).slice(0, 9)}`;
}

function buildPackages(seed: number, weight: number): ShipmentPackage[] {
  const r = rng(seed * 17 + 3);
  // Most shipments are one box. A minority split, which is what makes the
  // multi-package editor and the "3 pkgs" column worth having.
  const boxes = r() > 0.82 ? 2 : 1;
  const packages: ShipmentPackage[] = [];

  for (let i = 0; i < boxes; i += 1) {
    const isBag = r() > 0.55;
    packages.push({
      id: `pkg-${seed}-${i}`,
      type: isBag ? "Poly bag" : "Corrugated box",
      length: isBag ? 30 : Math.round(between(24, 40, r)),
      width: isBag ? 25 : Math.round(between(18, 30, r)),
      height: isBag ? 6 : Math.round(between(8, 18, r)),
      weight: round2(Math.max(0.2, weight / boxes + between(0.05, 0.25, r))),
      count: 1,
    });
  }

  return packages;
}

/** Shipments are numbered from #10390 upward, matching the Chat fixtures. */
const FIRST_ORDER_NUMBER = 10390;

export function buildShipments(): SeedShipment[] {
  return STATUS_MIX.map((status, index) => {
    const r = rng(index * 101 + 13);
    const customer = MOCK_CUSTOMERS[index % MOCK_CUSTOMERS.length];
    const orderNumber = FIRST_ORDER_NUMBER + index * 3;
    const lineItems = buildLineItems(index);
    const orderValue = itemsValue(lineItems);
    const packages = buildPackages(index, itemsWeight(lineItems));

    // Only the active couriers can be assigned; Shadowfax is switched off and
    // showing it on live shipments would contradict the Couriers screen.
    const activeCouriers = MOCK_COURIERS.filter((c) => c.isActive);
    const hasCourier = status !== "DRAFT";
    const courier = hasCourier ? pick(activeCouriers, r) : null;

    // DTDC does not do COD, so a DTDC shipment must not be a COD one.
    const wantsCod = r() > 0.58;
    const paymentMode: PaymentMode =
      wantsCod && (!courier || courier.supportsCod) ? "COD" : "PREPAID";

    const ageHours = STATUS_AGE_HOURS[status] + Math.floor(between(0, 10, r));
    const createdAt = hoursAgo(ageHours);

    const hasAwb =
      status !== "DRAFT" && status !== "COURIER_ASSIGNED";

    const tatDays = courier?.avgTat ?? 3;
    const expectedDeliveryAt =
      status === "DRAFT" ? null : new Date(T0 - ageHours * HOUR + tatDays * DAY).toISOString();

    const deliveredAt = status === "DELIVERED" ? hoursAgo(Math.floor(between(1, 30, r))) : null;

    const weight = packages.reduce((sum, p) => sum + chargeableWeight(p) * p.count, 0);
    const baseCost = courier ? courier.avgCost : 80;
    const shippingCost = Math.round(
      baseCost + Math.max(0, weight - 0.5) * 32 + (paymentMode === "COD" ? 35 : 0),
    );

    return {
      id: `shp-${orderNumber}`,
      reference: `SHP-${orderNumber}`,
      orderId: `order-${orderNumber}`,
      orderName: `#${orderNumber}`,
      customer,
      courier,
      serviceType: courier ? pick(courier.serviceTypes, r) : null,
      awb: hasAwb && courier ? awbFor(courier, index) : null,
      status,
      paymentMode,
      codAmount: paymentMode === "COD" ? orderValue : 0,
      orderValue,
      lineItems,
      packages,
      shippingCost,
      pickupLocation: MOCK_PICKUP_LOCATIONS[index % 3],
      createdAt,
      expectedDeliveryAt,
      deliveredAt,
      isDelayed: status === "DELAYED",
      notes:
        status === "DELAYED"
          ? "Courier reported a hub delay at the Bengaluru sorting centre."
          : null,
    };
  });
}

/* ─── Orders waiting to ship ────────────────────────────────────────────── */

const SHIPPABLE_MIX: ShippableOrderStatus[] = [
  ...Array<ShippableOrderStatus>(11).fill("UNFULFILLED"),
  ...Array<ShippableOrderStatus>(9).fill("READY_TO_PROCESS"),
  ...Array<ShippableOrderStatus>(4).fill("ON_HOLD"),
  ...Array<ShippableOrderStatus>(2).fill("EXCEPTION"),
  ...Array<ShippableOrderStatus>(2).fill("PARTIALLY_SHIPPED"),
];

const HOLD_REASONS: Record<ShippableOrderStatus, string | null> = {
  UNFULFILLED: null,
  READY_TO_PROCESS: null,
  ON_HOLD: "Customer asked to delay dispatch",
  EXCEPTION: "Destination pincode not serviceable by any active courier",
  PARTIALLY_SHIPPED: "1 of 2 items shipped — remainder awaiting stock",
};

/** These sit ahead of the shipment numbers, so the two sets never collide. */
const FIRST_QUEUE_NUMBER = 10552;

export function buildShippableOrders(): ShippableOrder[] {
  return SHIPPABLE_MIX.map((status, index) => {
    const r = rng(index * 211 + 29);
    const customer = MOCK_CUSTOMERS[(index + 4) % MOCK_CUSTOMERS.length];
    const orderNumber = FIRST_QUEUE_NUMBER + index * 2;
    const items = buildLineItems(index + 500);
    const orderValue = itemsValue(items);
    const paymentMode: PaymentMode = r() > 0.55 ? "COD" : "PREPAID";

    // Ages spread across four days so the SLA column shows healthy, at-risk and
    // breached rows at once — a queue where every row is green teaches nothing.
    const ageHours = Math.floor(between(0.5, 92, r));

    // Two-day dispatch promise from order placement.
    const shipBy = new Date(T0 - ageHours * HOUR + 2 * DAY).toISOString();

    const location =
      status === "EXCEPTION" ? null : MOCK_PICKUP_LOCATIONS[index % 3];

    return {
      id: `order-${orderNumber}`,
      orderName: `#${orderNumber}`,
      customerId: customer.id,
      customerName: customer.name,
      customerPhone: customer.phone,
      destinationCity: customer.city,
      destinationState: customer.state,
      destinationPincode: customer.pincode,
      itemCount: items.reduce((sum, i) => sum + i.quantity, 0),
      items,
      orderValue,
      currency: MOCK_CURRENCY,
      paymentMode,
      isPaid: paymentMode === "PREPAID",
      pickupLocationId: location?.id ?? null,
      pickupLocationName: location?.name ?? null,
      channel: { id: "ch-shopify", name: "Collabo Store", platform: "SHOPIFY" },
      createdAt: hoursAgo(ageHours),
      shipBy,
      status,
      holdReason: HOLD_REASONS[status],
    };
  });
}

/* ─── Trend ────────────────────────────────────────────── */

/**
 * Ninety days of daily counts, oldest first. Built with a weekly rhythm and a
 * mild upward drift, because a flat or purely random series makes the figures
 * derived from it look either broken or meaningless.
 */
export function buildTrend(days = 90): {
  date: string;
  shipments: number;
  delivered: number;
}[] {
  return Array.from({ length: days }, (_, i) => {
    const daysBack = days - 1 - i;
    const date = new Date(T0 - daysBack * DAY);
    const r = rng(i * 811 + 103);

    const weekday = date.getDay();
    // Sunday is quiet; Monday and Tuesday carry the weekend backlog.
    const weekly = weekday === 0 ? 0.45 : weekday === 1 || weekday === 2 ? 1.25 : 1;
    const drift = 1 + (i / days) * 0.35;

    const shipments = Math.round(52 * weekly * drift + between(-6, 8, r));
    const delivered = Math.round(shipments * between(0.86, 0.95, r));

    return {
      date: date.toISOString().slice(0, 10),
      shipments: Math.max(0, shipments),
      delivered: Math.max(0, delivered),
    };
  });
}

export { T0, HOUR, DAY, hoursAgo, daysAgo, hoursFromNow, daysFromNow, rng, between, round2, pick };
export type { MockCustomer, MockProduct };
export { destinationOf };
