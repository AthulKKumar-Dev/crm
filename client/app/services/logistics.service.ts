import { mockLogisticsApi } from "~/lib/mock/logistics-store";
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
  ReturnsOverview,
  Shipment,
  ShipmentDetail,
  ShipmentListParams,
  ShippableOrder,
  ShippableOrderListParams,
  ZonesOverview,
} from "~/types/api";

/**
 * Logistics API client.
 *
 * Currently backed by an in-memory mock (`lib/mock/logistics-store.ts`) because
 * no logistics module exists on the server yet: there is no Shipment table, no
 * courier integration and no AWB anywhere in `server/src`.
 *
 * Every method below carries the real request it will make as a comment, and
 * every signature already matches it. **Swapping to the live API means replacing
 * the bodies in THIS FILE ONLY** — hooks, optimistic patches, cache
 * invalidation and the components above never learn the difference.
 *
 * Same contract, and the same file layout, as `conversation.service.ts`.
 */
export const logisticsService = {
  /* ── Dashboard ── */

  /** GET /logistics/summary */
  summary: (): Promise<LogisticsSummary> =>
    // apiClient.get("/logistics/summary").then((r) => r.data),
    mockLogisticsApi.summary(),

  /** GET /logistics/overview */
  overview: (): Promise<LogisticsOverview> =>
    // apiClient.get("/logistics/overview").then((r) => r.data),
    mockLogisticsApi.overview(),

  /* ── Orders to ship ── */

  /** GET /logistics/orders-to-ship */
  listShippableOrders: (
    params?: ShippableOrderListParams,
  ): Promise<PaginatedResponse<ShippableOrder>> =>
    // apiClient.get("/logistics/orders-to-ship", { params }).then((r) => r.data),
    mockLogisticsApi.listShippableOrders(params),

  /** GET /logistics/orders-to-ship/counts */
  shippableOrderCounts: (params?: ShippableOrderListParams): Promise<Record<string, number>> =>
    // apiClient.get("/logistics/orders-to-ship/counts", { params }).then((r) => r.data),
    mockLogisticsApi.shippableOrderCounts(params),

  /** GET /logistics/orders-to-ship?ids=… — used by the create form. */
  ordersByIds: (ids: string[]): Promise<ShippableOrder[]> =>
    // apiClient.get("/logistics/orders-to-ship", { params: { ids } }).then((r) => r.data),
    mockLogisticsApi.ordersByIds(ids),

  /** POST /logistics/orders-to-ship/bulk — also drives the single-row hold/release. */
  bulkOrderAction: (data: BulkOrderActionRequest): Promise<{ updated: number }> =>
    // apiClient.post("/logistics/orders-to-ship/bulk", data).then((r) => r.data),
    mockLogisticsApi.bulkOrderAction(data),

  /* ── Shipments ── */

  /** GET /logistics/shipments */
  listShipments: (params?: ShipmentListParams): Promise<PaginatedResponse<Shipment>> =>
    // apiClient.get("/logistics/shipments", { params }).then((r) => r.data),
    mockLogisticsApi.listShipments(params),

  /** GET /logistics/shipments/counts */
  shipmentGroupCounts: (params?: ShipmentListParams): Promise<Record<string, number>> =>
    // apiClient.get("/logistics/shipments/counts", { params }).then((r) => r.data),
    mockLogisticsApi.shipmentGroupCounts(params),

  /** GET /logistics/shipments/:id */
  shipmentDetail: (id: string): Promise<ShipmentDetail> =>
    // apiClient.get(`/logistics/shipments/${id}`).then((r) => r.data),
    mockLogisticsApi.shipmentDetail(id),

  /** POST /logistics/shipments/quotes */
  quotes: (data: CourierQuoteRequest): Promise<CourierQuote[]> =>
    // apiClient.post("/logistics/shipments/quotes", data).then((r) => r.data),
    mockLogisticsApi.quotes(data),

  /** POST /logistics/shipments */
  createShipment: (data: CreateShipmentRequest): Promise<CreateShipmentResult> =>
    // apiClient.post("/logistics/shipments", data).then((r) => r.data),
    mockLogisticsApi.createShipment(data),

  /** POST /logistics/shipments/:id/awb */
  generateAwb: (shipmentId: string): Promise<GenerateAwbResult> =>
    // apiClient.post(`/logistics/shipments/${shipmentId}/awb`).then((r) => r.data),
    mockLogisticsApi.generateAwb(shipmentId),

  /* ── Setup rosters ── */

  /** GET /logistics/couriers */
  listCouriers: (): Promise<CourierPartner[]> =>
    // apiClient.get("/logistics/couriers").then((r) => r.data),
    mockLogisticsApi.listCouriers(),

  /**
   * GET /logistics/pickup-locations
   *
   * These are warehouses in their logistics role. The underlying records are the
   * ones `/warehouses` already serves — this endpoint joins the serviceability
   * and capacity fields onto them. Warehouse CRUD stays on Inventory.
   */
  listPickupLocations: (): Promise<PickupLocation[]> =>
    // apiClient.get("/logistics/pickup-locations").then((r) => r.data),
    mockLogisticsApi.listPickupLocations(),

  /* ── Section roll-ups ── */

  /** GET /logistics/returns/overview */
  returnsOverview: (): Promise<ReturnsOverview> =>
    // apiClient.get("/logistics/returns/overview").then((r) => r.data),
    mockLogisticsApi.returnsOverview(),

  /** GET /logistics/carriers/overview */
  carriersOverview: (): Promise<CarriersOverview> =>
    // apiClient.get("/logistics/carriers/overview").then((r) => r.data),
    mockLogisticsApi.carriersOverview(),

  /** GET /logistics/zones */
  zonesOverview: (): Promise<ZonesOverview> =>
    // apiClient.get("/logistics/zones").then((r) => r.data),
    mockLogisticsApi.zonesOverview(),

  /** GET /logistics/analytics/delivery */
  deliveryAnalytics: (): Promise<DeliveryAnalytics> =>
    // apiClient.get("/logistics/analytics/delivery").then((r) => r.data),
    mockLogisticsApi.deliveryAnalytics(),
};
