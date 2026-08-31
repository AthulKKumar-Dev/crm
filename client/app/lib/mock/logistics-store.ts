/**
 * In-memory stand-in for the logistics API.
 *
 * This is the ONLY module that knows the logistics workspace is fake.
 * `logistics.service.ts` wraps it with the exact signatures the real endpoints
 * will have, so everything above the service — key factory, optimistic patches,
 * invalidation, toasts — is production code from day one and the swap is a
 * one-file change. Same arrangement as `conversation-store.ts`.
 *
 * `ssr: false` (react-router.config.ts) is load-bearing: this module is
 * instantiated exactly once, in the browser, and survives every SPA navigation.
 * A hard refresh resets it to fixtures, which is correct for a preview.
 *
 * Deliberately NOT persisted to localStorage: persisted fixtures go stale
 * against the type contract mid-build and turn a shape change into a "why is my
 * browser broken" debugging session.
 */

import { AxiosError } from "axios";

import {
  MOCK_COURIERS,
  MOCK_CURRENCY,
  MOCK_PICKUP_LOCATIONS,
  between,
  buildShipments,
  buildShippableOrders,
  buildTrend,
  daysFromNow,
  destinationOf,
  hoursAgo,
  hoursFromNow,
  rng,
  round2,
  type SeedShipment,
} from "~/lib/mock/logistics-fixtures";
import {
  CARRIER_INSIGHT,
  MOCK_CARRIER_RULES,
  MOCK_NON_SERVICEABLE,
  MOCK_RETURNS,
  MOCK_RETURN_REASONS,
  MOCK_SLOWEST_ROUTES,
  MOCK_SPEND_BREAKDOWN,
  MOCK_ZONES,
  MOCK_ZONE_SHARE,
  RETURNS_INSIGHT,
  buildCarrierAccounts,
  buildCarrierScores,
  buildDeliveryDaily,
  buildRateCard,
} from "~/lib/mock/logistics-sections";
import { chargeableWeight, packageTotals } from "~/lib/logistics-format";
import { SHIPMENT_JOURNEY, SHIPMENT_STATUS_LABELS, shipmentGroup } from "~/lib/logistics-status";
import type {
  BulkOrderActionRequest,
  CarriersOverview,
  DeliveryAnalytics,
  CourierPartner,
  CourierQuote,
  CourierQuoteRequest,
  CreateShipmentRequest,
  CreateShipmentResult,
  GenerateAwbResult,
  LogisticsOverview,
  LogisticsSummary,
  PaginatedResponse,
  PickupLocation,
  Shipment,
  ShipmentDetail,
  ShipmentEvent,
  ShipmentPackage,
  ShipmentStatus,
  ShippableOrder,
  ReturnsOverview,
  ShippableOrderListParams,
  ShipmentListParams,
  ZonesOverview,
} from "~/types/api";

/* ─── Tuning knobs ──────────────────────────────────────────────────────── */

/**
 * Non-zero on purpose. At 0ms every query resolves before React paints, so the
 * skeletons and `isPending` states are unreachable and nobody notices they are
 * wrong until a real backend lands.
 */
const LATENCY = { read: 220, write: 420 };

/** Set to 1 to make every write fail — exercises rollback and error toasts. */
const MOCK_FAILURE_RATE = 0;

/**
 * One shipment whose AWB request always fails.
 *
 * Without this the failed/retry branch of `document-actions.tsx` needs a code
 * edit to reach, which means it stops being tested and quietly rots.
 */
const AWB_FAILURE_IDS = new Set(["shp-10466"]);

/* ─── Database ──────────────────────────────────────────────────────────── */

interface Db {
  shipments: Map<string, ShipmentDetail>;
  orders: Map<string, ShippableOrder>;
  couriers: CourierPartner[];
  locations: PickupLocation[];
  trend: { date: string; shipments: number; delivered: number }[];
}

const db: Db = {
  shipments: new Map(),
  orders: new Map(),
  couriers: [],
  locations: [],
  trend: [],
};

let seeded = false;
let sequence = 0;

function nextId(prefix: string): string {
  sequence += 1;
  return `${prefix}-${9000 + sequence}`;
}

/* ─── Transport ─────────────────────────────────────────────────────────── */

/**
 * `structuredClone` is load-bearing: without it a caller mutating a returned
 * object would reach into the store, and an optimistic update that gets rolled
 * back would have already corrupted the source of truth.
 */
function respond<T>(value: T, ms: number): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(structuredClone(value)), ms));
}

/**
 * A real `AxiosError`, because `handleMutationError` branches on
 * `isAxiosError` and would otherwise show its generic fallback for every
 * failure the mock produces.
 */
function mockError(message: string, status = 422): AxiosError {
  const error = new AxiosError(message, String(status));
  error.response = {
    data: { success: false, message },
    status,
    statusText: "Unprocessable Entity",
    headers: {},
    config: { headers: {} as never },
  };
  return error;
}

function maybeFail(message: string): void {
  if (MOCK_FAILURE_RATE > 0 && Math.random() < MOCK_FAILURE_RATE) {
    throw mockError(message, 500);
  }
}

function write<T>(value: T, failureMessage: string): Promise<T> {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      try {
        maybeFail(failureMessage);
        resolve(structuredClone(value));
      } catch (error) {
        reject(error);
      }
    }, LATENCY.write);
  });
}

/* ─── Derivation ────────────────────────────────────────────────────────── */

/**
 * Build the tracking timeline for a shipment from its current status.
 *
 * Derived rather than stored so that a shipment created at runtime gets the
 * same timeline shape as a seeded one, and so a status change cannot leave the
 * timeline behind. Exception nodes (NDR, delay, RTO) are appended after the
 * forward journey, because that is when they happened.
 */
function buildEvents(seed: SeedShipment, index: number): ShipmentEvent[] {
  const reached = SHIPMENT_JOURNEY.indexOf(seed.status);
  // DELAYED / NDR / RTO_* are not on the forward line; they branch off it after
  // the parcel is already moving, so the journey renders up to IN_TRANSIT.
  const journeyEnd = reached >= 0 ? reached : SHIPMENT_JOURNEY.indexOf("IN_TRANSIT");
  const created = new Date(seed.createdAt).getTime();
  const r = rng(index * 907 + 17);

  const events: ShipmentEvent[] = [];

  events.push({
    id: `evt-${seed.id}-order`,
    status: "DRAFT",
    label: "Order received",
    occurredAt: new Date(created - 2 * 3600_000).toISOString(),
    source: "SYSTEM",
  });

  for (let i = 0; i <= journeyEnd; i += 1) {
    const status = SHIPMENT_JOURNEY[i];
    if (status === "DRAFT") {
      events.push({
        id: `evt-${seed.id}-${i}`,
        status,
        label: "Shipment created",
        occurredAt: seed.createdAt,
        source: "USER",
      });
      continue;
    }

    // Spread the stages across the parcel's age rather than bunching them.
    const offset = (i / Math.max(1, journeyEnd)) * (Date.now() - created) * 0.9;
    const isCourierScan = i >= SHIPMENT_JOURNEY.indexOf("PICKED_UP");

    events.push({
      id: `evt-${seed.id}-${i}`,
      status,
      label: STAGE_LABEL[status] ?? SHIPMENT_STATUS_LABELS[status],
      occurredAt: new Date(created + offset).toISOString(),
      source: isCourierScan ? "COURIER" : "SYSTEM",
      location: isCourierScan ? pickHub(seed, i) : seed.pickupLocation.address.city,
      remark: isCourierScan ? SCAN_REMARK[status] : undefined,
    });
  }

  if (seed.status === "DELAYED") {
    events.push({
      id: `evt-${seed.id}-delay`,
      status: "DELAYED",
      label: "Delivery delayed",
      occurredAt: hoursAgo(Math.floor(between(2, 20, r))),
      source: "COURIER",
      location: pickHub(seed, 6),
      remark: "Shipment held at hub — onward connection missed.",
      isException: true,
    });
  }

  if (seed.status === "NDR") {
    events.push({
      id: `evt-${seed.id}-ndr`,
      status: "NDR",
      label: "Delivery attempt failed",
      occurredAt: hoursAgo(Math.floor(between(1, 18, r))),
      source: "COURIER",
      location: seed.customer.city,
      remark: "Consignee not available at address.",
      isException: true,
    });
  }

  if (seed.status === "RTO_INITIATED" || seed.status === "RTO_IN_TRANSIT") {
    events.push({
      id: `evt-${seed.id}-rto`,
      status: "RTO_INITIATED",
      label: "Return to origin initiated",
      occurredAt: hoursAgo(Math.floor(between(6, 48, r))),
      source: "COURIER",
      location: seed.customer.city,
      remark: "Delivery attempts exhausted — parcel routed back to origin.",
      isException: true,
    });
  }

  if (seed.status === "RTO_IN_TRANSIT") {
    events.push({
      id: `evt-${seed.id}-rto-transit`,
      status: "RTO_IN_TRANSIT",
      label: "Return in transit",
      occurredAt: hoursAgo(Math.floor(between(1, 8, r))),
      source: "COURIER",
      location: pickHub(seed, 3),
      isException: true,
    });
  }

  return events.sort(
    (a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime(),
  );
}

const STAGE_LABEL: Partial<Record<ShipmentStatus, string>> = {
  COURIER_ASSIGNED: "Courier assigned",
  AWB_ASSIGNED: "AWB generated",
  READY_TO_SHIP: "Packed and label printed",
  PICKUP_SCHEDULED: "Pickup scheduled",
  PICKED_UP: "Picked up by courier",
  IN_TRANSIT: "In transit",
  OUT_FOR_DELIVERY: "Out for delivery",
  DELIVERED: "Delivered",
};

const SCAN_REMARK: Partial<Record<ShipmentStatus, string>> = {
  PICKED_UP: "Shipment picked up from origin.",
  IN_TRANSIT: "Departed from origin hub.",
  OUT_FOR_DELIVERY: "Out for delivery with the last-mile rider.",
  DELIVERED: "Delivered and signed for.",
};

const HUBS = ["Bengaluru Hub", "Chennai Hub", "Mumbai Hub", "Hyderabad Hub", "Kochi Hub", "Delhi Hub"];

function pickHub(seed: SeedShipment, i: number): string {
  return HUBS[(seed.reference.length + i) % HUBS.length];
}

/** Full detail record from a seed. Everything the detail page needs. */
function toDetail(seed: SeedShipment, index: number): ShipmentDetail {
  const totals = packageTotals(seed.packages);
  const events = buildEvents(seed, index);

  const codFee = seed.paymentMode === "COD" ? 35 : 0;
  const fuel = Math.round(seed.shippingCost * 0.12);
  const freight = seed.shippingCost - codFee - fuel;

  return {
    id: seed.id,
    reference: seed.reference,
    orderId: seed.orderId,
    orderName: seed.orderName,
    fulfillmentId: null,
    customerId: seed.customer.id,
    customerName: seed.customer.name,
    customerPhone: seed.customer.phone,
    courierId: seed.courier?.id ?? null,
    courierName: seed.courier?.name ?? null,
    serviceType: seed.serviceType,
    awb: seed.awb,
    trackingUrl: seed.awb ? `https://track.example.in/${seed.awb}` : null,
    status: seed.status,
    paymentMode: seed.paymentMode,
    codAmount: seed.codAmount,
    orderValue: seed.orderValue,
    currency: MOCK_CURRENCY,
    packageCount: totals.boxes,
    chargeableWeight: totals.chargeable,
    shippingCost: seed.shippingCost,
    pickupLocationId: seed.pickupLocation.id,
    pickupLocationName: seed.pickupLocation.name,
    destinationCity: seed.customer.city,
    destinationState: seed.customer.state,
    destinationPincode: seed.customer.pincode,
    channel: { id: "ch-shopify", name: "Collabo Store", platform: "SHOPIFY" },
    createdAt: seed.createdAt,
    expectedDeliveryAt: seed.expectedDeliveryAt,
    deliveredAt: seed.deliveredAt,
    isDelayed: seed.isDelayed,
    ndrCaseId: null,
    rtoCaseId: null,
    returnRequestId: null,
    origin: seed.pickupLocation.address,
    destination: destinationOf(seed.customer),
    packages: seed.packages,
    lineItems: seed.lineItems,
    events,
    manifestId: null,
    manifestReference: null,
    pickupRequestId: null,
    costBreakdown: [
      { label: "Freight", amount: freight },
      { label: "Fuel surcharge", amount: fuel },
      ...(codFee ? [{ label: "COD handling", amount: codFee }] : []),
    ],
    labelUrl: seed.awb ? `data:text/plain;base64,${btoa(seed.reference)}` : null,
    customerTags: seed.customer.tags,
    notes: seed.notes,
  };
}

/** Strip a detail record down to the list projection. */
function toListItem(detail: ShipmentDetail): Shipment {
  const {
    origin: _origin,
    destination: _destination,
    packages: _packages,
    lineItems: _lineItems,
    events: _events,
    costBreakdown: _costBreakdown,
    customerTags: _customerTags,
    ...rest
  } = detail;
  return rest;
}

/* ─── Seeding ───────────────────────────────────────────────────────────── */

function seed(): void {
  if (seeded) return;
  seeded = true;

  db.couriers = structuredClone(MOCK_COURIERS);
  db.locations = structuredClone(MOCK_PICKUP_LOCATIONS);
  db.trend = buildTrend(90);

  buildShipments()
    .map(toDetail)
    .forEach((detail) => db.shipments.set(detail.id, detail));

  buildShippableOrders().forEach((order) => db.orders.set(order.id, order));
}

/* ─── Filtering ─────────────────────────────────────────────────────────── */

function paginate<T>(rows: T[], page = 1, limit = 12): PaginatedResponse<T> {
  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * limit;

  return {
    data: rows.slice(start, start + limit),
    meta: { total, page: safePage, limit, totalPages },
  };
}

function matches(haystack: (string | null | undefined)[], needle: string): boolean {
  const q = needle.trim().toLowerCase();
  if (!q) return true;
  return haystack.some((value) => value?.toLowerCase().includes(q));
}

function filterShipments(params: ShipmentListParams = {}): Shipment[] {
  let rows = [...db.shipments.values()].map(toListItem);

  if (params.group && params.group !== "ALL") {
    rows = rows.filter((s) => shipmentGroup(s.status) === params.group);
  }
  if (params.status?.length) {
    rows = rows.filter((s) => params.status!.includes(s.status));
  }
  if (params.courierId?.length) {
    rows = rows.filter((s) => s.courierId && params.courierId!.includes(s.courierId));
  }
  if (params.paymentMode) {
    rows = rows.filter((s) => s.paymentMode === params.paymentMode);
  }
  if (params.pickupLocationId?.length) {
    rows = rows.filter((s) => params.pickupLocationId!.includes(s.pickupLocationId));
  }
  if (params.destinationState?.length) {
    rows = rows.filter((s) => params.destinationState!.includes(s.destinationState));
  }
  if (params.delayedOnly) rows = rows.filter((s) => s.isDelayed);
  if (params.ndrOnly) rows = rows.filter((s) => Boolean(s.ndrCaseId));
  if (params.rtoOnly) rows = rows.filter((s) => Boolean(s.rtoCaseId));

  if (params.dateFrom) {
    const from = new Date(params.dateFrom).getTime();
    rows = rows.filter((s) => new Date(s.createdAt).getTime() >= from);
  }
  if (params.dateTo) {
    const to = new Date(params.dateTo).getTime();
    rows = rows.filter((s) => new Date(s.createdAt).getTime() <= to);
  }

  if (params.search) {
    rows = rows.filter((s) =>
      matches(
        [s.reference, s.orderName, s.customerName, s.awb, s.courierName, s.destinationCity, s.destinationPincode],
        params.search!,
      ),
    );
  }

  return rows.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

function filterOrders(params: ShippableOrderListParams = {}): ShippableOrder[] {
  let rows = [...db.orders.values()];

  if (params.status && params.status !== "ALL") {
    rows = rows.filter((o) => o.status === params.status);
  }
  if (params.pickupLocationId?.length) {
    rows = rows.filter((o) => o.pickupLocationId && params.pickupLocationId!.includes(o.pickupLocationId));
  }
  if (params.paymentMode) {
    rows = rows.filter((o) => o.paymentMode === params.paymentMode);
  }
  if (params.sla) {
    const now = Date.now();
    rows = rows.filter((o) => {
      const remaining = new Date(o.shipBy).getTime() - now;
      if (params.sla === "breached") return remaining <= 0;
      if (params.sla === "at-risk") return remaining > 0 && remaining <= 4 * 3600_000;
      return remaining > 4 * 3600_000;
    });
  }
  if (params.search) {
    rows = rows.filter((o) =>
      matches([o.orderName, o.customerName, o.destinationCity, o.destinationPincode], params.search!),
    );
  }

  // Most urgent first — the queue exists to be worked top-down.
  return rows.sort((a, b) => new Date(a.shipBy).getTime() - new Date(b.shipBy).getTime());
}

/* ─── Summary and overview ──────────────────────────────────────────────── */

function computeSummary(): LogisticsSummary {
  const shipments = [...db.shipments.values()];
  const count = (predicate: (s: ShipmentDetail) => boolean) => shipments.filter(predicate).length;

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  return {
    ordersToShip: [...db.orders.values()].filter((o) => o.status !== "ON_HOLD").length,
    readyToShip: count((s) => s.status === "READY_TO_SHIP"),
    pickupPending: count((s) => s.status === "READY_TO_SHIP" && !s.pickupRequestId),
    inTransit: count((s) => s.status === "IN_TRANSIT" || s.status === "PICKED_UP"),
    outForDelivery: count((s) => s.status === "OUT_FOR_DELIVERY"),
    deliveredToday: count(
      (s) => Boolean(s.deliveredAt) && new Date(s.deliveredAt!).getTime() >= startOfToday.getTime(),
    ),
    delayed: count((s) => s.isDelayed),
  };
}


function courierPerformance() {
  const shipments = [...db.shipments.values()];

  return db.couriers
    .filter((c) => c.isActive)
    .map((courier) => {
      const mine = shipments.filter((s) => s.courierId === courier.id);
      return {
        courierId: courier.id,
        courierName: courier.name,
        initials: courier.initials,
        shipments: mine.length || courier.shipmentCount,
        deliveryRate: courier.deliveryRate,
        ndrRate: courier.ndrRate,
        rtoRate: courier.rtoRate,
        avgTat: courier.avgTat,
        avgCost: courier.avgCost,
      };
    })
    .sort((a, b) => b.shipments - a.shipments);
}

/* ─── Quotes ────────────────────────────────────────────────────────────── */

/**
 * Price every active courier for a hypothetical shipment.
 *
 * Deterministic in the request, not random: re-opening step 5 of the wizard
 * with the same package must not reprice the same courier differently, or the
 * comparison the merchant just made becomes a lie.
 */
function quoteFor(request: CourierQuoteRequest): CourierQuote[] {
  const totals = packageTotals(
    request.packages.map((p, i) => ({ ...p, id: `tmp-${i}` })) as ShipmentPackage[],
  );
  const destination = db.orders.get(request.orderIds[0])?.destinationState
    ?? db.shipments.get(request.orderIds[0])?.destinationState
    ?? "KA";

  const quotes: CourierQuote[] = db.couriers
    .filter((courier) => courier.isActive)
    .map((courier, index) => {
      const r = rng(courier.name.length * 37 + index * 11 + Math.round(totals.chargeable * 100));

      const freight = Math.round(courier.avgCost + Math.max(0, totals.chargeable - 0.5) * 34);
      const fuel = Math.round(freight * 0.12);
      const codFee = request.paymentMode === "COD" ? Math.max(35, Math.round((request.codAmount ?? 0) * 0.012)) : 0;
      const cost = freight + fuel + codFee;

      // DTDC has no COD product, so a COD shipment simply cannot go with them.
      const codBlocked = request.paymentMode === "COD" && !courier.supportsCod;
      // A deterministic slice of destinations sits outside each courier's beat.
      const outOfBeat = (destination.charCodeAt(0) + courier.name.length) % 11 === 0;

      const pickupHours = courier.serviceTypes.includes("SAME_DAY") ? 3 : r() > 0.5 ? 20 : 28;

      return {
        courierId: courier.id,
        courierName: courier.name,
        initials: courier.initials,
        serviceType: courier.serviceTypes[0],
        cost,
        breakdown: [
          { label: "Freight", amount: freight },
          { label: "Fuel surcharge", amount: fuel },
          ...(codFee ? [{ label: "COD handling", amount: codFee }] : []),
        ],
        estimatedPickupAt: hoursFromNow(pickupHours),
        estimatedDeliveryAt: daysFromNow(Math.ceil(courier.avgTat)),
        supportsCod: courier.supportsCod,
        rating: courier.rating,
        deliveryRate: courier.deliveryRate,
        rtoRate: courier.rtoRate,
        isServiceable: !codBlocked && !outOfBeat,
        unavailableReason: codBlocked
          ? "Does not support COD on this lane"
          : outOfBeat
            ? `No delivery beat for ${destination} at this weight`
            : undefined,
      };
    });

  const serviceable = quotes.filter((q) => q.isServiceable);
  if (serviceable.length) {
    // Recommend on value, not on price alone: a courier that is cheaper by ₹15
    // and worse by 6 points on delivery rate costs more once RTOs are counted.
    const best = [...serviceable].sort(
      (a, b) => b.deliveryRate / b.cost - a.deliveryRate / a.cost,
    )[0];
    const cheapest = [...serviceable].sort((a, b) => a.cost - b.cost)[0];

    best.recommendationReason =
      best.courierId === cheapest.courierId
        ? "Cheapest option and the strongest delivery rate on this lane"
        : `Best balance of cost and delivery rate — ${best.deliveryRate.toFixed(1)}% delivered on time`;
  }

  // Unserviceable couriers sink to the bottom but stay visible — hiding them
  // makes the merchant wonder why a courier they use is missing.
  return quotes.sort((a, b) => Number(b.isServiceable) - Number(a.isServiceable) || a.cost - b.cost);
}

/* ─── Public API ────────────────────────────────────────────────────────── */

export const mockLogisticsApi = {
  summary: (): Promise<LogisticsSummary> => {
    seed();
    return respond(computeSummary(), LATENCY.read);
  },

  overview: (): Promise<LogisticsOverview> => {
    seed();
    const summary = computeSummary();
    return respond({ summary, courierPerformance: courierPerformance() }, LATENCY.read);
  },

  listShipments: (params?: ShipmentListParams): Promise<PaginatedResponse<Shipment>> => {
    seed();
    return respond(paginate(filterShipments(params), params?.page, params?.limit ?? 12), LATENCY.read);
  },

  /** Counts for the shipment tab strip. Unfiltered by group, filtered by everything else. */
  shipmentGroupCounts: (params?: ShipmentListParams): Promise<Record<string, number>> => {
    seed();
    const rows = filterShipments({ ...params, group: "ALL" });
    const counts: Record<string, number> = { ALL: rows.length };
    for (const row of rows) {
      const group = shipmentGroup(row.status);
      counts[group] = (counts[group] ?? 0) + 1;
    }
    return respond(counts, LATENCY.read);
  },

  shipmentDetail: (id: string): Promise<ShipmentDetail> => {
    seed();
    const shipment = db.shipments.get(id);
    if (!shipment) return Promise.reject(mockError("Shipment not found", 404));
    return respond(shipment, LATENCY.read);
  },

  listShippableOrders: (params?: ShippableOrderListParams): Promise<PaginatedResponse<ShippableOrder>> => {
    seed();
    return respond(paginate(filterOrders(params), params?.page, params?.limit ?? 12), LATENCY.read);
  },

  shippableOrderCounts: (params?: ShippableOrderListParams): Promise<Record<string, number>> => {
    seed();
    const rows = filterOrders({ ...params, status: "ALL" });
    const counts: Record<string, number> = { ALL: rows.length };
    for (const row of rows) counts[row.status] = (counts[row.status] ?? 0) + 1;
    return respond(counts, LATENCY.read);
  },

  ordersByIds: (ids: string[]): Promise<ShippableOrder[]> => {
    seed();
    return respond(
      ids.map((id) => db.orders.get(id)).filter((o): o is ShippableOrder => Boolean(o)),
      LATENCY.read,
    );
  },

  listPickupLocations: (): Promise<PickupLocation[]> => {
    seed();
    return respond(db.locations, LATENCY.read);
  },

  bulkOrderAction: (request: BulkOrderActionRequest): Promise<{ updated: number }> => {
    seed();
    let updated = 0;

    for (const id of request.orderIds) {
      const order = db.orders.get(id);
      if (!order) continue;

      if (request.action === "HOLD") {
        order.status = "ON_HOLD";
        order.holdReason = request.reason ?? "Put on hold by an operator";
      } else if (request.action === "RELEASE_HOLD") {
        order.status = "READY_TO_PROCESS";
        order.holdReason = null;
      } else if (request.action === "ASSIGN_LOCATION" && request.pickupLocationId) {
        const location = db.locations.find((l) => l.id === request.pickupLocationId);
        if (location) {
          order.pickupLocationId = location.id;
          order.pickupLocationName = location.name;
          // Assigning a location is what un-blocks an unserviceable order.
          if (order.status === "EXCEPTION") order.status = "READY_TO_PROCESS";
        }
      }

      updated += 1;
    }

    return write({ updated }, "Could not update the selected orders.");
  },

  listCouriers: (): Promise<CourierPartner[]> => {
    seed();
    return respond([...db.couriers].sort((a, b) => a.priority - b.priority), LATENCY.read);
  },

  quotes: (request: CourierQuoteRequest): Promise<CourierQuote[]> => {
    seed();
    return respond(quoteFor(request), LATENCY.read + 380);
  },

  /* ── Writes ── */

  createShipment: (request: CreateShipmentRequest): Promise<CreateShipmentResult> => {
    seed();
    const courier = db.couriers.find((c) => c.id === request.courierId);
    const location = db.locations.find((l) => l.id === request.pickupLocationId);

    if (!courier) return Promise.reject(mockError("Select a courier before creating the shipment."));
    if (!location) return Promise.reject(mockError("Select a pickup location before creating the shipment."));
    if (request.paymentMode === "COD" && !courier.supportsCod) {
      return Promise.reject(mockError(`${courier.name} does not carry COD shipments on this lane.`));
    }

    const created: Shipment[] = [];
    const results: CreateShipmentResult["results"] = [];

    for (const orderId of request.orderIds) {
      const order = db.orders.get(orderId);
      if (!order) {
        results.push({ orderId, orderName: orderId, shipmentId: null, error: "Order not found" });
        continue;
      }

      const packages: ShipmentPackage[] = request.packages.map((pkg, i) => ({ ...pkg, id: nextId(`pkg${i}`) }));
      const totals = packageTotals(packages);
      const id = `shp-${order.orderName.replace("#", "")}`;
      const freight = Math.round(courier.avgCost + Math.max(0, totals.chargeable - 0.5) * 34);
      const fuel = Math.round(freight * 0.12);
      const codFee = request.paymentMode === "COD" ? 35 : 0;

      const detail: ShipmentDetail = {
        id,
        reference: `SHP-${order.orderName.replace("#", "")}`,
        orderId: order.id,
        orderName: order.orderName,
        fulfillmentId: null,
        customerId: order.customerId,
        customerName: order.customerName,
        customerPhone: order.customerPhone,
        courierId: courier.id,
        courierName: courier.name,
        serviceType: request.serviceType,
        awb: null,
        trackingUrl: null,
        status: "COURIER_ASSIGNED",
        paymentMode: request.paymentMode,
        codAmount: request.paymentMode === "COD" ? (request.codAmount ?? order.orderValue) : 0,
        orderValue: order.orderValue,
        currency: order.currency,
        packageCount: totals.boxes,
        chargeableWeight: totals.chargeable,
        shippingCost: freight + fuel + codFee,
        pickupLocationId: location.id,
        pickupLocationName: location.name,
        destinationCity: order.destinationCity,
        destinationState: order.destinationState,
        destinationPincode: order.destinationPincode,
        channel: order.channel,
        createdAt: new Date().toISOString(),
        expectedDeliveryAt: daysFromNow(Math.ceil(courier.avgTat)),
        deliveredAt: null,
        isDelayed: false,
        ndrCaseId: null,
        rtoCaseId: null,
        returnRequestId: null,
        origin: location.address,
        destination: {
          name: order.customerName,
          phone: order.customerPhone,
          line1: "—",
          city: order.destinationCity,
          state: order.destinationState,
          pincode: order.destinationPincode,
          country: "India",
        },
        packages,
        lineItems: order.items,
        events: [
          {
            id: nextId("evt"),
            status: "DRAFT",
            label: "Shipment created",
            occurredAt: new Date().toISOString(),
            source: "USER",
          },
          {
            id: nextId("evt"),
            status: "COURIER_ASSIGNED",
            label: `Courier assigned — ${courier.name}`,
            occurredAt: new Date().toISOString(),
            source: "SYSTEM",
          },
        ],
        manifestId: null,
        manifestReference: null,
        pickupRequestId: null,
        costBreakdown: [
          { label: "Freight", amount: freight },
          { label: "Fuel surcharge", amount: fuel },
          ...(codFee ? [{ label: "COD handling", amount: codFee }] : []),
        ],
        labelUrl: null,
        customerTags: [],
        notes: null,
      };

      if (request.generateAwb) {
        applyAwb(detail);
      }

      db.shipments.set(detail.id, detail);
      // The order leaves the queue — it has a shipment now.
      db.orders.delete(order.id);

      created.push(toListItem(detail));
      results.push({ orderId: order.id, orderName: order.orderName, shipmentId: detail.id, error: null });
    }

    return write({ shipments: created, results }, "Could not create the shipment.");
  },

  generateAwb: (shipmentId: string): Promise<GenerateAwbResult> => {
    seed();
    const shipment = db.shipments.get(shipmentId);
    if (!shipment) return Promise.reject(mockError("Shipment not found", 404));
    if (!shipment.courierId) return Promise.reject(mockError("Assign a courier before generating an AWB."));

    if (AWB_FAILURE_IDS.has(shipmentId)) {
      return new Promise((_resolve, reject) =>
        setTimeout(
          () =>
            reject(
              mockError(
                `${shipment.courierName} rejected the request: pickup pincode ${shipment.origin.pincode} is not registered against this account.`,
                502,
              ),
            ),
          LATENCY.write,
        ),
      );
    }

    applyAwb(shipment);

    return write(
      {
        shipmentId,
        awb: shipment.awb!,
        trackingUrl: shipment.trackingUrl!,
        labelUrl: shipment.labelUrl!,
      },
      "Could not generate the AWB.",
    );
  },

  /* ── Section roll-ups ── */

  returnsOverview: (): Promise<ReturnsOverview> => {
    seed();

    const open = MOCK_RETURNS.filter((record) => record.stage !== "REFUNDED");
    const shipments = [...db.shipments.values()];
    const rtoRate = shipments.length
      ? round2(
          (MOCK_RETURNS.filter((record) => record.kind === "RTO").length / shipments.length) * 100,
        )
      : 0;

    return respond(
      {
        openReturns: open.length,
        rtoInTransit: MOCK_RETURNS.filter(
          (record) => record.kind === "RTO" && record.stage !== "REFUNDED",
        ).length,
        rtoRate,
        // Only what is actually still owed — a refunded return is not pending.
        refundsPending: open.reduce((sum, record) => sum + record.refundAmount, 0),
        currency: MOCK_CURRENCY,
        returns: MOCK_RETURNS,
        reasons: MOCK_RETURN_REASONS,
        reasonSampleSize: 214,
        insight: RETURNS_INSIGHT,
      },
      LATENCY.read,
    );
  },

  carriersOverview: (): Promise<CarriersOverview> => {
    seed();
    return respond(
      {
        carriers: buildCarrierAccounts(),
        rateCard: buildRateCard(),
        rules: MOCK_CARRIER_RULES,
        currency: MOCK_CURRENCY,
      },
      LATENCY.read,
    );
  },

  zonesOverview: (): Promise<ZonesOverview> => {
    seed();
    return respond(
      {
        zones: MOCK_ZONES,
        share: MOCK_ZONE_SHARE,
        nonServiceable: MOCK_NON_SERVICEABLE,
        currency: MOCK_CURRENCY,
      },
      LATENCY.read,
    );
  },

  deliveryAnalytics: (): Promise<DeliveryAnalytics> => {
    seed();

    const daily = buildDeliveryDaily(30);
    const onTime = daily.reduce((sum, day) => sum + day.onTime, 0);
    const late = daily.reduce((sum, day) => sum + day.late, 0);
    const parcels = onTime + late;

    const scores = buildCarrierScores();
    const spend = MOCK_SPEND_BREAKDOWN.reduce((sum, row) => sum + row.amount, 0);

    return respond(
      {
        onTimeRate: parcels ? round2((onTime / parcels) * 100) : 0,
        avgTransitDays: scores.length
          ? round2(
              db.couriers
                .filter((courier) => courier.isActive)
                .reduce((sum, courier) => sum + courier.avgTat, 0) /
                db.couriers.filter((courier) => courier.isActive).length,
            )
          : 0,
        spend,
        costPerParcel: parcels ? round2(spend / parcels) : 0,
        currency: MOCK_CURRENCY,
        daily,
        carrierScores: scores,
        slowestRoutes: MOCK_SLOWEST_ROUTES,
        spendBreakdown: MOCK_SPEND_BREAKDOWN,
        carrierInsight: CARRIER_INSIGHT,
      },
      LATENCY.read,
    );
  },
};

/* ─── Write helpers ─────────────────────────────────────────────────────── */

function applyAwb(shipment: ShipmentDetail): void {
  if (shipment.awb) return;

  const courier = db.couriers.find((c) => c.id === shipment.courierId);
  const awb = `${courier?.initials ?? "XX"}${String(Date.now()).slice(-9)}`;

  shipment.awb = awb;
  shipment.trackingUrl = `https://track.example.in/${awb}`;
  shipment.labelUrl = `data:text/plain;base64,${btoa(shipment.reference)}`;
  shipment.status = "AWB_ASSIGNED";
  shipment.events.push({
    id: nextId("evt"),
    status: "AWB_ASSIGNED",
    label: "AWB generated",
    occurredAt: new Date().toISOString(),
    source: "SYSTEM",
    remark: awb,
  });
}


/** Exposed for the label print route, which renders whatever it is handed. */