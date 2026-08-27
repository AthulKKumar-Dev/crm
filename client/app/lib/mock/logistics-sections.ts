/**
 * Seed data for the Returns, Carriers, Zones and Analytics screens.
 *
 * Split out from `logistics-fixtures.ts` because that file seeds the shipment
 * pipeline — the records these four screens report *on* — while this one is
 * reference data and roll-ups. Keeping them apart stops one 2,000-line fixture
 * file from being the thing everybody has to scroll past.
 *
 * Same two rules as its sibling: timestamps are relative to a `T0` captured at
 * module init, and there is no `Math.random()` — a screen that reshuffles its
 * own numbers between renders is worse than one that is obviously fake.
 *
 * Customer and order vocabulary matches `logistics-fixtures.ts` on purpose. A
 * Returns table full of names that appear nowhere in Shipments reads as a bug.
 */

import { DAY, MOCK_COURIERS, MOCK_CURRENCY, T0, between, rng } from "~/lib/mock/logistics-fixtures";
import type {
  CarrierAccount,
  CarrierRule,
  DeliveryAnalytics,
  DeliveryZone,
  NonServiceablePincode,
  RateCardRow,
  ReturnReasonShare,
  ReturnRecord,
  ZoneShare,
} from "~/types/api";

const daysAgo = (n: number) => new Date(T0 - n * DAY).toISOString();

/* ─── Returns & RTO ─────────────────────────────────────────────────────── */

/**
 * Nine records spanning every stage, so each tab has something in it and the
 * status column is not five rows of the same pill.
 */
export const MOCK_RETURNS: ReturnRecord[] = [
  {
    id: "ret-10402",
    orderId: "order-10402",
    orderName: "#10402",
    customerName: "Priya Nair",
    reason: "Size too small",
    kind: "CUSTOMER_RETURN",
    stage: "IN_TRANSIT",
    refundAmount: 2190,
    currency: MOCK_CURRENCY,
    actionLabel: "Track parcel",
    requestedAt: daysAgo(2),
  },
  {
    id: "ret-10418",
    orderId: "order-10418",
    orderName: "#10418",
    customerName: "Rohan Das",
    reason: "Delivery refused",
    kind: "RTO",
    stage: "OUT_FOR_DELIVERY",
    refundAmount: 1480,
    currency: MOCK_CURRENCY,
    actionLabel: "Approve RTO",
    requestedAt: daysAgo(3),
  },
  {
    id: "ret-10433",
    orderId: "order-10433",
    orderName: "#10433",
    customerName: "Meera Iyer",
    reason: "Damaged in transit",
    kind: "CUSTOMER_RETURN",
    stage: "RECEIVED",
    refundAmount: 3240,
    currency: MOCK_CURRENCY,
    actionLabel: "Issue refund",
    requestedAt: daysAgo(5),
  },
  {
    id: "ret-10447",
    orderId: "order-10447",
    orderName: "#10447",
    customerName: "Farhan Qureshi",
    reason: "Address unreachable",
    kind: "RTO",
    stage: "EXCEPTION",
    refundAmount: 960,
    currency: MOCK_CURRENCY,
    actionLabel: "Reattempt",
    requestedAt: daysAgo(6),
  },
  {
    id: "ret-10461",
    orderId: "order-10461",
    orderName: "#10461",
    customerName: "Devika Rao",
    reason: "Wrong item sent",
    kind: "CUSTOMER_RETURN",
    stage: "REFUNDED",
    refundAmount: 1720,
    currency: MOCK_CURRENCY,
    actionLabel: "View order",
    requestedAt: daysAgo(9),
  },
  {
    id: "ret-10474",
    orderId: "order-10474",
    orderName: "#10474",
    customerName: "Anu Thomas",
    reason: "Changed mind",
    kind: "CUSTOMER_RETURN",
    stage: "REQUESTED",
    refundAmount: 2860,
    currency: MOCK_CURRENCY,
    actionLabel: "Approve",
    requestedAt: daysAgo(1),
  },
  {
    id: "ret-10488",
    orderId: "order-10488",
    orderName: "#10488",
    customerName: "Rahul Kumar",
    reason: "COD not paid",
    kind: "RTO",
    stage: "IN_TRANSIT",
    refundAmount: 1340,
    currency: MOCK_CURRENCY,
    actionLabel: "Track parcel",
    requestedAt: daysAgo(4),
  },
  {
    id: "ret-10495",
    orderId: "order-10495",
    orderName: "#10495",
    customerName: "Maya Sharma",
    reason: "Quality not as described",
    kind: "CUSTOMER_RETURN",
    stage: "REQUESTED",
    refundAmount: 4290,
    currency: MOCK_CURRENCY,
    actionLabel: "Approve",
    requestedAt: daysAgo(1),
  },
  {
    id: "ret-10508",
    orderId: "order-10508",
    orderName: "#10508",
    customerName: "Vikram Reddy",
    reason: "Delivered late",
    kind: "CUSTOMER_RETURN",
    stage: "RECEIVED",
    refundAmount: 1590,
    currency: MOCK_CURRENCY,
    actionLabel: "Issue refund",
    requestedAt: daysAgo(7),
  },
];

/**
 * Why parcels come back. COD refusal leads on purpose — it is the single
 * biggest driver of RTO in Indian ecommerce, and it is the one a merchant can
 * actually act on with a prepaid-only rule.
 */
export const MOCK_RETURN_REASONS: ReturnReasonShare[] = [
  { label: "COD refused on delivery", percent: 34, tone: "danger" },
  { label: "Size or fit", percent: 26, tone: "brand" },
  { label: "Address unreachable", percent: 18, tone: "warning" },
  { label: "Damaged in transit", percent: 13, tone: "danger" },
  { label: "Changed mind", percent: 9, tone: "neutral" },
];

export const RETURNS_INSIGHT =
  "COD orders come back 3.4× more often than prepaid. A prepaid-only rule for pincodes above 12% RTO would remove most of the top bar.";

/* ─── Carriers & rates ──────────────────────────────────────────────────── */

const ACCOUNT_LABELS: Record<string, string> = {
  "cur-delhivery": "acct 9927",
  "cur-bluedart": "acct 1120",
  "cur-xpressbees": "acct 4820",
  "cur-ecom": "acct 6612",
  "cur-dtdc": "not linked",
  "cur-shadowfax": "not linked",
};

/**
 * Carrier accounts, derived from the same six couriers the shipment pipeline
 * uses so the two screens cannot disagree about who carries what.
 */
export function buildCarrierAccounts(): CarrierAccount[] {
  return MOCK_COURIERS.map((courier) => ({
    id: courier.id,
    name: courier.name,
    initials: courier.initials,
    accountLabel: ACCOUNT_LABELS[courier.id] ?? "not linked",
    state: !courier.isActive
      ? ("NOT_LINKED" as const)
      : courier.deliveryRate < 92
        ? ("RATE_LIMITED" as const)
        : ("CONNECTED" as const),
    onTimeRate: courier.deliveryRate,
    avgCost: courier.avgCost,
    volume30d: Math.round(courier.shipmentCount / 3),
    services: courier.serviceTypes
      .map((type) => type.charAt(0) + type.slice(1).toLowerCase().replace("_", " "))
      .concat(courier.supportsCod ? ["COD"] : [])
      .join(" · "),
  }));
}

/** Negotiated forward rates, per 500 g slab, zone B. */
export function buildRateCard(): RateCardRow[] {
  const rows: { service: string; courierId: string; codFee: string; rto: string; transit: string }[] =
    [
      { service: "Surface 500g", courierId: "cur-delhivery", codFee: "₹28 or 1.5%", rto: "60% of forward", transit: "3–4 days" },
      { service: "Surface 500g", courierId: "cur-xpressbees", codFee: "₹30 or 1.6%", rto: "70% of forward", transit: "3–5 days" },
      { service: "Air 500g", courierId: "cur-bluedart", codFee: "₹35 or 2%", rto: "100% of forward", transit: "1–2 days" },
      { service: "Express 500g", courierId: "cur-delhivery", codFee: "₹32 or 1.8%", rto: "80% of forward", transit: "2–3 days" },
      { service: "Surface 500g", courierId: "cur-ecom", codFee: "₹26 or 1.4%", rto: "60% of forward", transit: "4–6 days" },
      { service: "Surface 500g", courierId: "cur-dtdc", codFee: "₹25 or 1.5%", rto: "60% of forward", transit: "4–6 days" },
    ];

  return rows.map((row, index) => {
    const courier = MOCK_COURIERS.find((c) => c.id === row.courierId)!;
    const isAir = row.service.startsWith("Air");
    const isExpress = row.service.startsWith("Express");
    const multiplier = isAir ? 1.05 : isExpress ? 0.86 : 0.5;

    return {
      id: `rate-${index}`,
      service: row.service,
      carrierName: courier.name,
      base: Math.round(courier.avgCost * multiplier),
      additional: Math.round(courier.avgCost * multiplier * 0.82),
      codFee: row.codFee,
      rtoCharge: row.rto,
      transit: row.transit,
    };
  });
}

/** Applied top to bottom when a label is bought. The last one is the catch-all. */
export const MOCK_CARRIER_RULES: CarrierRule[] = [
  {
    id: "rule-1",
    position: 1,
    when: "COD order over ₹2,000",
    then: "Ship Blue Dart Air, require OTP on delivery",
    state: "ACTIVE",
  },
  {
    id: "rule-2",
    position: 2,
    when: "Bengaluru metro under 2 kg",
    then: "Ship Delhivery Surface",
    state: "ACTIVE",
  },
  {
    id: "rule-3",
    position: 3,
    when: "Zone D or north-east",
    then: "Ship Delhivery Surface, add 2 days to the promised date",
    state: "ACTIVE",
  },
  {
    id: "rule-4",
    position: 4,
    when: "Anything else",
    then: "Cheapest rate with on-time above 90%",
    state: "FALLBACK",
  },
];

/* ─── Zones & delivery areas ────────────────────────────────────────────── */

export const MOCK_ZONES: DeliveryZone[] = [
  {
    id: "zone-a",
    name: "Zone A — Local",
    tone: "brand",
    coverage: "Kochi urban · 42 pincodes",
    transit: "1–2 days",
    rates: [
      { id: "za-1", name: "Free shipping", condition: "Orders over ₹999", price: 0 },
      { id: "za-2", name: "Standard", condition: "Under ₹999", price: 49 },
    ],
  },
  {
    id: "zone-b",
    name: "Zone B — Metro",
    tone: "success",
    coverage: "Bengaluru, Chennai, Hyderabad, Mumbai, Delhi NCR",
    transit: "2–3 days",
    rates: [
      { id: "zb-1", name: "Free shipping", condition: "Orders over ₹1,499", price: 0 },
      { id: "zb-2", name: "Standard", condition: "Under ₹1,499", price: 79 },
      { id: "zb-3", name: "Express", condition: "Any order", price: 149 },
    ],
  },
  {
    id: "zone-c",
    name: "Zone C — Rest of India",
    tone: "neutral",
    coverage: "18 states · 8,400 pincodes",
    transit: "3–5 days",
    rates: [{ id: "zc-1", name: "Standard", condition: "All orders", price: 99 }],
  },
  {
    id: "zone-d",
    name: "Zone D — Remote",
    tone: "muted",
    coverage: "North-east, J&K, islands",
    transit: "5–8 days",
    rates: [{ id: "zd-1", name: "Standard", condition: "Prepaid only", price: 189 }],
  },
];

export const MOCK_ZONE_SHARE: ZoneShare[] = [
  { zoneId: "zone-a", name: "Zone A — Local", tone: "brand", orders: 486, percent: 31 },
  { zoneId: "zone-b", name: "Zone B — Metro", tone: "success", orders: 612, percent: 39 },
  { zoneId: "zone-c", name: "Zone C — Rest of India", tone: "neutral", orders: 377, percent: 24 },
  { zoneId: "zone-d", name: "Zone D — Remote", tone: "muted", orders: 94, percent: 6 },
];

export const MOCK_NON_SERVICEABLE: NonServiceablePincode[] = [
  {
    pincode: "796014",
    place: "Aizawl, Mizoram",
    note: "No carrier beat since March",
    blockedLabel: "Blocked",
  },
  {
    pincode: "744103",
    place: "Port Blair, Andaman",
    note: "Air only, above weight cap",
    blockedLabel: "Blocked",
  },
  {
    pincode: "193201",
    place: "Sopore, J&K",
    note: "Prepaid only, COD refused by all carriers",
    blockedLabel: "COD blocked",
  },
  {
    pincode: "790104",
    place: "Tawang, Arunachal",
    note: "Seasonal — road closed until March",
    blockedLabel: "Blocked",
  },
];

export const ZONES_NOTE =
  'Customers in these pincodes see "Delivery not available" at checkout.';

/* ─── Delivery analytics ────────────────────────────────────────────────── */

/**
 * Thirty days of on-time versus late deliveries.
 *
 * Weekly rhythm and a mild upward drift, same shape as the shipment trend, so
 * the two charts in the module tell a consistent story.
 */
export function buildDeliveryDaily(days = 30): { date: string; onTime: number; late: number }[] {
  return Array.from({ length: days }, (_, i) => {
    const daysBack = days - 1 - i;
    const date = new Date(T0 - daysBack * DAY);
    const r = rng(i * 613 + 47);

    const weekday = date.getDay();
    const weekly = weekday === 0 ? 0.45 : weekday === 1 || weekday === 2 ? 1.25 : 1;
    const total = Math.round(52 * weekly * (1 + (i / days) * 0.3) + between(-5, 7, r));
    const late = Math.max(0, Math.round(total * between(0.02, 0.09, r)));

    return {
      date: date.toISOString().slice(0, 10),
      onTime: Math.max(0, total - late),
      late,
    };
  });
}

export function buildCarrierScores(): DeliveryAnalytics["carrierScores"] {
  return MOCK_COURIERS.filter((courier) => courier.isActive)
    .map((courier) => ({
      carrierId: courier.id,
      name: courier.name,
      onTimePct: courier.deliveryRate,
      cost: courier.avgCost,
    }))
    .sort((a, b) => b.onTimePct - a.onTimePct);
}

export const MOCK_SLOWEST_ROUTES: DeliveryAnalytics["slowestRoutes"] = [
  { route: "Kochi → Guwahati", days: 7.4, volume: 38 },
  { route: "Kochi → Srinagar", days: 6.9, volume: 21 },
  { route: "Bengaluru → Port Blair", days: 6.2, volume: 14 },
  { route: "Mumbai → Imphal", days: 5.8, volume: 26 },
];

export const MOCK_SPEND_BREAKDOWN: DeliveryAnalytics["spendBreakdown"] = [
  { label: "Forward freight", amount: 78420, percent: 75, tone: "brand" },
  { label: "COD handling", amount: 12180, percent: 12, tone: "info" },
  { label: "RTO charges", amount: 9640, percent: 9, tone: "warning" },
  { label: "Insurance", amount: 4580, percent: 4, tone: "neutral" },
];

export const CARRIER_INSIGHT =
  "Moving Zone D volume from DTDC to Delhivery would add roughly ₹640 a month and cut 1.1 days of transit.";
