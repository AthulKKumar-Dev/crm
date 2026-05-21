// Hand-written types for the Shopify Admin GraphQL queries used by the CRM.
// We avoid codegen here so adding/changing a query doesn't require regenerating
// a large schema file; expand this file as new queries land in later phases.

export interface PageInfo {
  hasNextPage: boolean;
  endCursor: string | null;
}

export interface MoneyV2 {
  amount: string;
  currencyCode: string;
}

export interface MoneyBag {
  shopMoney: MoneyV2;
  presentmentMoney?: MoneyV2;
}

export interface MailingAddress {
  address1: string | null;
  address2: string | null;
  city: string | null;
  province: string | null;
  provinceCode: string | null;
  country: string | null;
  countryCodeV2: string | null;
  zip: string | null;
  firstName: string | null;
  lastName: string | null;
  name: string | null;
  phone: string | null;
  company: string | null;
}

// ─── Orders list query ───────────────────────────────────────────────────────

export type OrderSortKey =
  | 'PROCESSED_AT'
  | 'UPDATED_AT'
  | 'CREATED_AT'
  | 'ORDER_NUMBER'
  | 'TOTAL_PRICE';

export interface OrdersListVariables {
  first: number;
  after?: string | null;
  query?: string | null;
  sortKey?: OrderSortKey;
  reverse?: boolean;
}

export interface OrderCustomerNode {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
}

export interface OrderLineItemNode {
  id: string;
  title: string;
  variantTitle: string | null;
  sku: string | null;
  quantity: number;
  originalUnitPriceSet: MoneyBag;
  totalDiscountSet: MoneyBag;
  requiresShipping: boolean;
  taxable: boolean;
  variant: { id: string; product: { id: string } | null } | null;
  customAttributes: Array<{ key: string; value: string | null }>;
}

export interface OrderFulfillmentNode {
  id: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  trackingInfo: Array<{ number: string | null; url: string | null; company: string | null }>;
}

export interface OrderRefundLineItemNode {
  id: string;
  quantity: number;
  restockType: string | null;
  lineItem: { id: string };
}

export interface OrderRefundNode {
  id: string;
  note: string | null;
  createdAt: string;
  totalRefundedSet: MoneyBag;
  refundLineItems: { nodes: OrderRefundLineItemNode[] };
}

export interface OrderNode {
  id: string;
  name: string;
  number: number;
  email: string | null;
  phone: string | null;
  note: string | null;
  tags: string[];
  displayFinancialStatus: string | null;
  displayFulfillmentStatus: string;
  cancelReason: string | null;
  cancelledAt: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
  currencyCode: string;
  currentSubtotalPriceSet: MoneyBag;
  totalPriceSet: MoneyBag;
  totalTaxSet: MoneyBag;
  totalDiscountsSet: MoneyBag;
  totalShippingPriceSet: MoneyBag;
  shippingAddress: MailingAddress | null;
  billingAddress: MailingAddress | null;
  customer: OrderCustomerNode | null;
  lineItems: { nodes: OrderLineItemNode[] };
  fulfillments: OrderFulfillmentNode[];
  refunds: OrderRefundNode[];
}

export interface OrdersListResponse {
  orders: {
    pageInfo: PageInfo;
    nodes: OrderNode[];
  };
}

// The query asks for everything `upsertOrder` in shopify-sync.service.ts needs.
// `fulfillments(first: ...)` is a plain list (capped); `refundLineItems` is a
// connection. Keep field selection minimal — every byte counts against the
// per-query cost budget.
export const ORDERS_LIST_QUERY = /* GraphQL */ `
  query OrdersList(
    $first: Int!
    $after: String
    $query: String
    $sortKey: OrderSortKeys
    $reverse: Boolean
  ) {
    orders(first: $first, after: $after, query: $query, sortKey: $sortKey, reverse: $reverse) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        id
        name
        number
        email
        phone
        note
        tags
        displayFinancialStatus
        displayFulfillmentStatus
        cancelReason
        cancelledAt
        closedAt
        createdAt
        updatedAt
        currencyCode
        currentSubtotalPriceSet { shopMoney { amount currencyCode } }
        totalPriceSet { shopMoney { amount currencyCode } }
        totalTaxSet { shopMoney { amount currencyCode } }
        totalDiscountsSet { shopMoney { amount currencyCode } }
        totalShippingPriceSet { shopMoney { amount currencyCode } }
        shippingAddress {
          address1 address2 city province provinceCode country countryCodeV2
          zip firstName lastName name phone company
        }
        billingAddress {
          address1 address2 city province provinceCode country countryCodeV2
          zip firstName lastName name phone company
        }
        customer {
          id email firstName lastName
        }
        lineItems(first: 100) {
          nodes {
            id
            title
            variantTitle
            sku
            quantity
            originalUnitPriceSet { shopMoney { amount currencyCode } }
            totalDiscountSet { shopMoney { amount currencyCode } }
            requiresShipping
            taxable
            variant {
              id
              product { id }
            }
            customAttributes { key value }
          }
        }
        fulfillments(first: 50) {
          id
          status
          createdAt
          updatedAt
          trackingInfo { number url company }
        }
        refunds(first: 50) {
          id
          note
          createdAt
          totalRefundedSet { shopMoney { amount currencyCode } }
          refundLineItems(first: 50) {
            nodes {
              id
              quantity
              restockType
              lineItem { id }
            }
          }
        }
      }
    }
  }
`;

// ─── Common shapes for Phase 1 mutations ────────────────────────────────────

/**
 * Standard Shopify userError shape. Most mutations return this; some
 * specialised ones (e.g. orderCancel) return a typed variant — handle both.
 */
export interface ShopifyUserError {
  field?: string[] | null;
  message: string;
  code?: string | null;
}

export interface MailingAddressInput {
  address1?: string | null;
  address2?: string | null;
  city?: string | null;
  province?: string | null;
  country?: string | null;
  countryCode?: string | null;
  zip?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  company?: string | null;
}

export interface AttributeInput {
  key: string;
  value: string;
}

// ─── orderUpdate ────────────────────────────────────────────────────────────

export interface OrderUpdateInput {
  id: string;
  email?: string | null;
  phone?: string | null;
  note?: string | null;
  poNumber?: string | null;
  tags?: string[];
  customAttributes?: AttributeInput[];
  shippingAddress?: MailingAddressInput;
}

export interface OrderUpdateVariables {
  input: OrderUpdateInput;
}

export interface OrderUpdateResponse {
  orderUpdate: {
    order: { id: string; updatedAt: string } | null;
    userErrors: ShopifyUserError[];
  };
}

export const ORDER_UPDATE_MUTATION = /* GraphQL */ `
  mutation OrderUpdate($input: OrderInput!) {
    orderUpdate(input: $input) {
      order { id updatedAt }
      userErrors { field message }
    }
  }
`;

// ─── orderCancel ────────────────────────────────────────────────────────────
// Async on Shopify's side — returns a Job, not the order. We update the local
// row optimistically and let the `orders/cancelled` webhook reconcile.

export type ShopifyOrderCancelReason =
  | 'CUSTOMER'
  | 'FRAUD'
  | 'INVENTORY'
  | 'DECLINED'
  | 'OTHER'
  | 'STAFF';

export interface OrderCancelVariables {
  orderId: string;
  reason: ShopifyOrderCancelReason;
  refund: boolean;
  restock: boolean;
  notifyCustomer?: boolean | null;
  staffNote?: string | null;
}

export interface OrderCancelResponse {
  orderCancel: {
    job: { id: string; done: boolean } | null;
    orderCancelUserErrors: ShopifyUserError[];
  };
}

export const ORDER_CANCEL_MUTATION = /* GraphQL */ `
  mutation OrderCancel(
    $orderId: ID!
    $reason: OrderCancelReason!
    $refund: Boolean!
    $restock: Boolean!
    $notifyCustomer: Boolean
    $staffNote: String
  ) {
    orderCancel(
      orderId: $orderId
      reason: $reason
      refund: $refund
      restock: $restock
      notifyCustomer: $notifyCustomer
      staffNote: $staffNote
    ) {
      job { id done }
      orderCancelUserErrors { field message code }
    }
  }
`;

// ─── orderClose / orderOpen ─────────────────────────────────────────────────

export interface OrderCloseOrOpenVariables {
  input: { id: string };
}

export interface OrderCloseResponse {
  orderClose: {
    order: { id: string; closed: boolean; closedAt: string | null } | null;
    userErrors: ShopifyUserError[];
  };
}

export interface OrderOpenResponse {
  orderOpen: {
    order: { id: string; closed: boolean; closedAt: string | null } | null;
    userErrors: ShopifyUserError[];
  };
}

export const ORDER_CLOSE_MUTATION = /* GraphQL */ `
  mutation OrderClose($input: OrderCloseInput!) {
    orderClose(input: $input) {
      order { id closed closedAt }
      userErrors { field message }
    }
  }
`;

export const ORDER_OPEN_MUTATION = /* GraphQL */ `
  mutation OrderOpen($input: OrderOpenInput!) {
    orderOpen(input: $input) {
      order { id closed closedAt }
      userErrors { field message }
    }
  }
`;

// ─── orderMarkAsPaid ────────────────────────────────────────────────────────

export interface OrderMarkAsPaidVariables {
  input: { id: string };
}

export interface OrderMarkAsPaidResponse {
  orderMarkAsPaid: {
    order: { id: string; displayFinancialStatus: string | null } | null;
    userErrors: ShopifyUserError[];
  };
}

export const ORDER_MARK_AS_PAID_MUTATION = /* GraphQL */ `
  mutation OrderMarkAsPaid($input: OrderMarkAsPaidInput!) {
    orderMarkAsPaid(input: $input) {
      order { id displayFinancialStatus }
      userErrors { field message }
    }
  }
`;

// ─── orderCapture ───────────────────────────────────────────────────────────
// Needs the parentTransactionId of the authorize transaction. We expose a
// small read query to fetch it before calling the capture mutation.

export interface OrderCapturableTransactionsVariables {
  id: string;
}

export interface OrderCapturableTransactionNode {
  id: string;
  kind: string;
  status: string;
  amountSet: MoneyBag;
}

export interface OrderCapturableTransactionsResponse {
  order: {
    id: string;
    transactions: OrderCapturableTransactionNode[];
  } | null;
}

export const ORDER_CAPTURABLE_TRANSACTIONS_QUERY = /* GraphQL */ `
  query OrderCapturableTransactions($id: ID!) {
    order(id: $id) {
      id
      transactions(first: 10, capturable: true) {
        id
        kind
        status
        amountSet { shopMoney { amount currencyCode } }
      }
    }
  }
`;

export interface OrderCaptureVariables {
  input: {
    id: string;
    parentTransactionId: string;
    amount: string;
    currency?: string | null;
    finalCapture?: boolean | null;
  };
}

export interface OrderCaptureResponse {
  orderCapture: {
    transaction: {
      id: string;
      kind: string;
      status: string;
      amountSet: MoneyBag;
    } | null;
    userErrors: ShopifyUserError[];
  };
}

export const ORDER_CAPTURE_MUTATION = /* GraphQL */ `
  mutation OrderCapture($input: OrderCaptureInput!) {
    orderCapture(input: $input) {
      transaction {
        id
        kind
        status
        amountSet { shopMoney { amount currencyCode } }
      }
      userErrors { field message }
    }
  }
`;

// ─── Phase 2: Fulfillment & tracking ────────────────────────────────────────

/**
 * Fetch the OPEN fulfillment orders for a Shopify order — the natural unit
 * that `fulfillmentCreate` works on. Each FO carries its assigned location and
 * the line items that are still fulfillable from there. Closed/cancelled FOs
 * are not returned so the UI doesn't show stale options.
 */
export interface FulfillmentOrderLineItemNode {
  id: string;
  remainingQuantity: number;
  totalQuantity: number;
  lineItem: {
    id: string;
    title: string;
    variantTitle: string | null;
    sku: string | null;
  };
}

export interface FulfillmentOrderNode {
  id: string;
  status: string;
  requestStatus: string;
  assignedLocation: {
    name: string | null;
    location: { id: string } | null;
  } | null;
  lineItems: { nodes: FulfillmentOrderLineItemNode[] };
}

export interface OrderFulfillmentOrdersResponse {
  order: {
    id: string;
    fulfillmentOrders: { nodes: FulfillmentOrderNode[] };
  } | null;
}

export const ORDER_FULFILLMENT_ORDERS_QUERY = /* GraphQL */ `
  query OrderFulfillmentOrders($id: ID!) {
    order(id: $id) {
      id
      fulfillmentOrders(first: 25, query: "status:OPEN OR status:IN_PROGRESS") {
        nodes {
          id
          status
          requestStatus
          assignedLocation {
            name
            location { id }
          }
          lineItems(first: 100) {
            nodes {
              id
              remainingQuantity
              totalQuantity
              lineItem {
                id
                title
                variantTitle
                sku
              }
            }
          }
        }
      }
    }
  }
`;

// ─── fulfillmentCreate ─────────────────────────────────────────────────────
// Shopify-side input groups line items by their fulfillment order.
// `notifyCustomer` lets Shopify send the shipping email.

export interface FulfillmentOrderLineItemsByFulfillmentOrderInput {
  fulfillmentOrderId: string;
  fulfillmentOrderLineItems?: Array<{ id: string; quantity: number }>;
}

export interface FulfillmentTrackingInput {
  number?: string | null;
  url?: string | null;
  company?: string | null;
}

export interface FulfillmentCreateVariables {
  fulfillment: {
    lineItemsByFulfillmentOrder: FulfillmentOrderLineItemsByFulfillmentOrderInput[];
    notifyCustomer?: boolean | null;
    trackingInfo?: FulfillmentTrackingInput | null;
  };
}

export interface FulfillmentNode {
  id: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  trackingInfo: Array<{ number: string | null; url: string | null; company: string | null }>;
}

export interface FulfillmentCreateResponse {
  fulfillmentCreate: {
    fulfillment: FulfillmentNode | null;
    userErrors: ShopifyUserError[];
  };
}

export const FULFILLMENT_CREATE_MUTATION = /* GraphQL */ `
  mutation FulfillmentCreate($fulfillment: FulfillmentInput!) {
    fulfillmentCreate(fulfillment: $fulfillment) {
      fulfillment {
        id
        status
        createdAt
        updatedAt
        trackingInfo { number url company }
      }
      userErrors { field message }
    }
  }
`;

// ─── fulfillmentTrackingInfoUpdate ─────────────────────────────────────────

export interface FulfillmentTrackingInfoUpdateVariables {
  fulfillmentId: string;
  trackingInfoInput: FulfillmentTrackingInput;
  notifyCustomer?: boolean | null;
}

export interface FulfillmentTrackingInfoUpdateResponse {
  fulfillmentTrackingInfoUpdate: {
    fulfillment: FulfillmentNode | null;
    userErrors: ShopifyUserError[];
  };
}

export const FULFILLMENT_TRACKING_INFO_UPDATE_MUTATION = /* GraphQL */ `
  mutation FulfillmentTrackingInfoUpdate(
    $fulfillmentId: ID!
    $trackingInfoInput: FulfillmentTrackingInput!
    $notifyCustomer: Boolean
  ) {
    fulfillmentTrackingInfoUpdate(
      fulfillmentId: $fulfillmentId
      trackingInfoInput: $trackingInfoInput
      notifyCustomer: $notifyCustomer
    ) {
      fulfillment {
        id
        status
        createdAt
        updatedAt
        trackingInfo { number url company }
      }
      userErrors { field message }
    }
  }
`;

// ─── fulfillmentCancel ─────────────────────────────────────────────────────

export interface FulfillmentCancelVariables {
  id: string;
}

export interface FulfillmentCancelResponse {
  fulfillmentCancel: {
    fulfillment: FulfillmentNode | null;
    userErrors: ShopifyUserError[];
  };
}

export const FULFILLMENT_CANCEL_MUTATION = /* GraphQL */ `
  mutation FulfillmentCancel($id: ID!) {
    fulfillmentCancel(id: $id) {
      fulfillment {
        id
        status
        createdAt
        updatedAt
        trackingInfo { number url company }
      }
      userErrors { field message }
    }
  }
`;

// ─── Phase 4: Draft orders ──────────────────────────────────────────────────

export interface DraftOrderLineItemInput {
  /** Variant ID to add to the draft (use this OR title for custom items). */
  variantId?: string;
  /** Custom (no-variant) line item — must set title + originalUnitPrice. */
  title?: string;
  quantity: number;
  /** Override the variant's price. Use cents-as-decimal-string format. */
  originalUnitPrice?: string;
  /** Optional appliedDiscount block (value, type, etc.) — keep flexible. */
  appliedDiscount?: {
    title?: string;
    description?: string;
    value: number;
    valueType: 'FIXED_AMOUNT' | 'PERCENTAGE';
  };
}

export interface DraftOrderInputShape {
  /** Line items required for create; optional for update (partial patch). */
  lineItems?: DraftOrderLineItemInput[];
  email?: string | null;
  note?: string | null;
  tags?: string[];
  shippingAddress?: MailingAddressInput;
  billingAddress?: MailingAddressInput;
  customAttributes?: AttributeInput[];
  /** Customer GID for attaching an existing Shopify customer. */
  purchasingEntity?: { customerId: string };
}

/** Shopify DraftOrder response node (subset we read back). */
export interface DraftOrderNode {
  id: string;
  name: string;
  status: string;
  invoiceUrl: string | null;
  invoiceSentAt: string | null;
  email: string | null;
  totalPriceSet: MoneyBag;
  subtotalPriceSet: MoneyBag;
  totalTaxSet: MoneyBag;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  order: { id: string; name: string } | null;
}

export interface DraftOrderCreateVariables {
  input: DraftOrderInputShape;
}

export interface DraftOrderCreateResponse {
  draftOrderCreate: {
    draftOrder: DraftOrderNode | null;
    userErrors: ShopifyUserError[];
  };
}

export const DRAFT_ORDER_CREATE_MUTATION = /* GraphQL */ `
  mutation DraftOrderCreate($input: DraftOrderInput!) {
    draftOrderCreate(input: $input) {
      draftOrder {
        id
        name
        status
        invoiceUrl
        invoiceSentAt
        email
        totalPriceSet { shopMoney { amount currencyCode } }
        subtotalPriceSet { shopMoney { amount currencyCode } }
        totalTaxSet { shopMoney { amount currencyCode } }
        createdAt
        updatedAt
        completedAt
        order { id name }
      }
      userErrors { field message }
    }
  }
`;

// ─── draftOrderUpdate ──────────────────────────────────────────────────────

export interface DraftOrderUpdateVariables {
  id: string;
  input: DraftOrderInputShape;
}

export interface DraftOrderUpdateResponse {
  draftOrderUpdate: {
    draftOrder: DraftOrderNode | null;
    userErrors: ShopifyUserError[];
  };
}

export const DRAFT_ORDER_UPDATE_MUTATION = /* GraphQL */ `
  mutation DraftOrderUpdate($id: ID!, $input: DraftOrderInput!) {
    draftOrderUpdate(id: $id, input: $input) {
      draftOrder {
        id
        name
        status
        invoiceUrl
        invoiceSentAt
        email
        totalPriceSet { shopMoney { amount currencyCode } }
        subtotalPriceSet { shopMoney { amount currencyCode } }
        totalTaxSet { shopMoney { amount currencyCode } }
        createdAt
        updatedAt
        completedAt
        order { id name }
      }
      userErrors { field message }
    }
  }
`;

// ─── draftOrderDelete ──────────────────────────────────────────────────────

export interface DraftOrderDeleteVariables {
  input: { id: string };
}

export interface DraftOrderDeleteResponse {
  draftOrderDelete: {
    deletedId: string | null;
    userErrors: ShopifyUserError[];
  };
}

export const DRAFT_ORDER_DELETE_MUTATION = /* GraphQL */ `
  mutation DraftOrderDelete($input: DraftOrderDeleteInput!) {
    draftOrderDelete(input: $input) {
      deletedId
      userErrors { field message }
    }
  }
`;

// ─── draftOrderComplete ────────────────────────────────────────────────────

export interface DraftOrderCompleteVariables {
  id: string;
  paymentPending?: boolean;
}

export interface DraftOrderCompleteResponse {
  draftOrderComplete: {
    draftOrder: (DraftOrderNode & {
      order: { id: string; name: string; legacyResourceId: string } | null;
    }) | null;
    userErrors: ShopifyUserError[];
  };
}

export const DRAFT_ORDER_COMPLETE_MUTATION = /* GraphQL */ `
  mutation DraftOrderComplete($id: ID!, $paymentPending: Boolean) {
    draftOrderComplete(id: $id, paymentPending: $paymentPending) {
      draftOrder {
        id
        name
        status
        completedAt
        order { id name legacyResourceId }
      }
      userErrors { field message }
    }
  }
`;

// ─── draftOrderInvoiceSend ─────────────────────────────────────────────────

export interface DraftOrderInvoiceSendVariables {
  id: string;
  email?: {
    to?: string | null;
    from?: string | null;
    subject?: string | null;
    customMessage?: string | null;
    bcc?: string[];
  };
}

export interface DraftOrderInvoiceSendResponse {
  draftOrderInvoiceSend: {
    draftOrder: (DraftOrderNode & {
      invoiceUrl: string | null;
      invoiceSentAt: string | null;
    }) | null;
    userErrors: ShopifyUserError[];
  };
}

export const DRAFT_ORDER_INVOICE_SEND_MUTATION = /* GraphQL */ `
  mutation DraftOrderInvoiceSend($id: ID!, $email: EmailInput) {
    draftOrderInvoiceSend(id: $id, email: $email) {
      draftOrder {
        id
        name
        status
        invoiceUrl
        invoiceSentAt
      }
      userErrors { field message }
    }
  }
`;

// ─── shopifyqlQuery ────────────────────────────────────────────────────────
// Runs a ShopifyQL string against the Analytics API. In API version 2026-01
// the field returns a concrete `ShopifyqlQueryResponse` object (NOT a union)
// with two fields:
//   * `parseErrors: [String!]!` — empty when the query parsed; otherwise an
//     array of human-readable error strings (the query string itself was
//     malformed).
//   * `tableData: ShopifyqlTableData` — nullable; populated when parsing
//     succeeded.
//
// `rows` is a JSON scalar (an array of arrays). Each inner array's values
// correspond positionally to `columns`. Values come back natively typed
// (numbers as numbers, strings as strings, null where the cell is empty).
//
// Required scope: `read_reports`. The `sessions` / `online_store_visitors`
// datasets additionally require the merchant to be on Shopify Advanced or
// Plus (Basic plans surface as HTTP 406 before the GraphQL envelope is ever
// returned — handled by the analytics service, not this file).

export interface ShopifyqlTableDataColumn {
  name: string;
  /// One of: STRING, NUMBER, PERCENT, CURRENCY, MONEY, DATE, DATETIME, ...
  dataType: string;
  displayName: string;
  subType?: string | null;
}

export interface ShopifyqlTableData {
  columns: ShopifyqlTableDataColumn[];
  /// JSON scalar — row-major 2D array; cell types follow `columns[i].dataType`.
  rows: Array<Array<string | number | boolean | null>>;
}

export interface ShopifyqlQueryResponse {
  shopifyqlQuery: {
    parseErrors: string[];
    tableData: ShopifyqlTableData | null;
  };
}

export interface ShopifyqlQueryVariables {
  shopifyql: string;
}

export const SHOPIFYQL_QUERY = /* GraphQL */ `
  query AnalyticsShopifyqlQuery($shopifyql: String!) {
    shopifyqlQuery(query: $shopifyql) {
      parseErrors
      tableData {
        columns { name dataType displayName }
        rows
      }
    }
  }
`;
