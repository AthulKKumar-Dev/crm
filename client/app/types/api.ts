// ─── API Envelope Types ─────────────────────────────────────────────────────

/** Successful API response wrapper returned by the backend. */
export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
}

/** Error API response wrapper returned by the backend. */
export interface ApiErrorResponse {
  success: false;
  statusCode: number;
  message: string;
  errors?: string[];
  timestamp: string;
  path: string;
}

/** Discriminated union of success and error API responses. */
export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

// ─── Core Domain Types ──────────────────────────────────────────────────────

/** JWT token pair issued on login/refresh. */
export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

/** Authenticated user profile. */
export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  emailVerified: boolean;
  twoFactorEnabled: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Full organization entity used throughout the frontend. */
export interface Organization {
  id: string;
  name: string;
  slug: string;
  type: "PERSONAL" | "ORGANIZATION";
  logo: string | null;
  timezone: string;
  currency: string;
  industry: string | null;
  website: string | null;
  billingPlan: "FREE" | "STARTER" | "GROWTH" | "ENTERPRISE";
  onboardingStatus: "PENDING" | "IN_PROGRESS" | "COMPLETED" | "SKIPPED";
  createdAt: string;
  updatedAt: string;
}

/** A user's membership in an organization, including the nested organization details. */
export interface OrganizationMembership {
  id: string;
  organizationId: string;
  role: UserRole;
  isActive: boolean;
  organization: Organization;
}

/** Possible roles a user can hold within an organization. */
export type UserRole = "OWNER" | "ADMIN" | "MANAGER" | "AGENT" | "VIEWER";

// ─── Auth Request Types ────────────────────────────────────────────────────

/** Payload for user registration. */
export interface SignupRequest {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  avatarUrl?: string;
}

/** Payload for user login (with optional TOTP for 2FA). */
export interface LoginRequest {
  email: string;
  password: string;
  totpCode?: string;
}

/** Payload for verifying a user's email via OTP code. */
export interface VerifyEmailRequest {
  userId: string;
  code: string;
}

/** Payload for re-sending the email verification code. */
export interface ResendVerificationRequest {
  userId: string;
}

// ─── Auth Response Types ───────────────────────────────────────────────────

/** Response returned after successful registration. */
export interface SignupResponse {
  userId: string;
  email: string;
  verifyCode: string;
  message: string;
  nextStep: "verify-email";
}

/** Simplified org shape returned by login/verify endpoints (flat, not nested). */
export interface AuthOrganization {
  id: string;
  name: string;
  slug: string;
  type: "PERSONAL" | "ORGANIZATION";
  role: UserRole;
}

/** Response returned after successful login, including tokens and user info. */
export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    avatarUrl: string | null;
    emailVerified: boolean;
    twoFactorEnabled: boolean;
  };
  organizations: AuthOrganization[];
  nextStep: "choose-account-type" | null;
}

/** Response returned after successful email verification. */
export interface VerifyEmailResponse {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    avatarUrl: string | null;
    emailVerified: boolean;
  };
  organizations: AuthOrganization[];
  nextStep: "choose-account-type" | null;
  message: string;
}

/** Response returned after re-sending the verification code. */
export interface ResendVerificationResponse {
  message: string;
  nextStep: "verify-email";
}

// ─── Forgot / Reset Password ──────────────────────────────────────────────

/** Payload for requesting a password reset email. */
export interface ForgotPasswordRequest {
  email: string;
}

/** Response after a password reset email is queued. */
export interface ForgotPasswordResponse {
  message: string;
}

/** Payload for setting a new password via a reset token. */
export interface ResetPasswordRequest {
  token: string;
  newPassword: string;
}

/** Response after the password has been successfully reset. */
export interface ResetPasswordResponse {
  message: string;
}

// ─── Switch Org Types ────────────────────────────────────────────────────

/** Payload for switching to a different organization. */
export interface SwitchOrgRequest {
  orgId: string;
}

/** Response after switching organization — includes new JWT tokens scoped to the selected org. */
export interface SwitchOrgResponse {
  accessToken: string;
  refreshToken: string;
  currentOrganization: AuthOrganization;
  organizations: AuthOrganization[];
}

// ─── User Types ───────────────────────────────────────────────────────────

/** Payload for changing the current user's password (requires current password). */
export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

/** Payload for updating user profile fields. */
export interface UpdateUserRequest {
  firstName?: string;
  lastName?: string;
  avatarUrl?: string;
}

// ─── Organization Types ──────────────────────────────────────────────────

/** The shape the backend returns for organization CRUD endpoints. */
export interface OrgResponse {
  id: string;
  name: string;
  slug: string;
  type: "PERSONAL" | "ORGANIZATION";
  logo: string | null;
  timezone: string;
  currency: string;
  industry: string | null;
  website: string | null;
  lowStockThreshold: number;
  gstEnabled: boolean;
  billingPlan: "FREE" | "STARTER" | "GROWTH" | "ENTERPRISE";
  onboardingStatus: "PENDING" | "IN_PROGRESS" | "COMPLETED" | "SKIPPED";
  role: UserRole;
  createdAt: string;
}

/** Payload for creating a new organization. */
export interface CreateOrganizationRequest {
  name: string;
  slug?: string;
  logo?: string;
  timezone?: string;
  currency?: string;
  industry?: string;
  website?: string;
}

/** Payload for updating an existing organization's settings. */
export interface UpdateOrganizationRequest {
  name?: string;
  logo?: string;
  timezone?: string;
  currency?: string;
  industry?: string;
  website?: string;
  lowStockThreshold?: number;
  gstEnabled?: boolean;
}

// ─── Member Types ─────────────────────────────────────────────────────────

/** An organization member with their nested user profile. */
export interface OrgMember {
  id: string;
  role: UserRole;
  joinedAt: string;
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    avatarUrl: string | null;
    lastLoginAt: string | null;
  };
}

/** Payload for changing a member's role. */
export interface UpdateMemberRoleRequest {
  role: UserRole;
}

// ─── Team Invite Types ────────────────────────────────────────────────────

/** Payload for sending a team invitation. */
export interface SendInviteRequest {
  email: string;
  role: UserRole;
}

/** A pending team invitation record. */
export interface OrgInvite {
  id: string;
  email: string;
  role: UserRole;
  status: "PENDING";
  token?: string;
  invitedBy: string;
  expiresAt: string;
  createdAt: string;
}

// ─── Invite Types (Auth-level) ────────────────────────────────────────────

/** Response when fetching invite details by token (pre-accept). */
export interface GetInviteResponse {
  email: string;
  role: UserRole;
  organization: {
    id: string;
    name: string;
    slug: string;
    logo: string | null;
  };
  userExists: boolean;
}

/** Payload for accepting a team invitation (new or existing user). */
export interface AcceptInviteRequest {
  token: string;
  firstName?: string;
  lastName?: string;
  password?: string;
}

/** Response returned after successfully accepting an invitation (includes new session tokens). */
export interface AcceptInviteResponse {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
  };
  organization: {
    id: string;
    name: string;
    slug: string;
  };
}

// ─── Pagination ──────────────────────────────────────────────────────────────

/** Paginated response envelope returned by list endpoints. */
export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

// ─── Channel Types ───────────────────────────────────────────────────────────

/** Supported sales channel platforms. */
export type ChannelPlatform =
  | "SHOPIFY"
  | "WOOCOMMERCE"
  | "INSTAGRAM"
  | "FACEBOOK"
  | "WHATSAPP"
  | "TIKTOK"
  | "MANUAL";

/** Connection status of a channel. */
export type ChannelStatus = "CONNECTED" | "DISCONNECTED" | "ERROR" | "SYNCING";

/** Current synchronization status. */
export type SyncStatus = "IDLE" | "IN_PROGRESS" | "COMPLETED" | "FAILED";

/** A connected sales channel (e.g. Shopify store). */
export interface Channel {
  id: string;
  organizationId: string;
  name: string;
  platform: ChannelPlatform;
  status: ChannelStatus;
  isEnabled: boolean;
  externalStoreUrl: string | null;
  lastSyncedAt: string | null;
  syncStatus: SyncStatus;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

/** A single sync log entry recording a synchronization attempt. */
export interface SyncLog {
  id: string;
  channelId: string;
  status: SyncStatus;
  entityType: string;
  recordsProcessed: number;
  recordsFailed: number;
  totalEstimated: number | null;
  errorMessage: string | null;
  startedAt: string;
  completedAt: string | null;
  createdAt: string;
}

/** Channel detail including recent sync history. */
export interface ChannelDetail extends Channel {
  syncLogs: SyncLog[];
}

/** Payload for updating a channel's name or enabled status. */
export interface UpdateChannelRequest {
  name?: string;
  isEnabled?: boolean;
}

/** Payload for triggering a manual sync. */
export interface TriggerSyncRequest {
  entityTypes: string[];
}

/** Payload for starting Shopify OAuth with merchant's custom app credentials. */
export interface ShopifyInstallRequest {
  shopDomain: string;
  apiKey: string;
  apiSecret: string;
}

/** Payload for manually connecting a Shopify store with custom app credentials. */
export interface ManualConnectShopifyRequest {
  shopDomain: string;
  apiKey: string;
  apiSecret: string;
  accessToken: string;
}

/** Response after manual Shopify connect. */
export interface ManualConnectShopifyResponse {
  channelId: string;
  shopName: string;
  shopDomain: string;
}

/** Response containing the OAuth redirect URL. */
export interface OAuthInstallResponse {
  authUrl: string;
}

// ─── Product Types ───────────────────────────────────────────────────────────

/** Product publication status. */
export type ProductStatus = "ACTIVE" | "DRAFT" | "ARCHIVED";

/** Derived stock status for filtering. */
export type StockStatus = "in_stock" | "low_stock" | "out_of_stock";

/** A product image with source URL and alt text. */
export interface ProductImage {
  id: string;
  src: string;
  alt: string | null;
}

/** A product variant with pricing and inventory. */
export interface ProductVariant {
  id: string;
  title: string;
  sku: string | null;
  price: number;
  compareAtPrice: number | null;
  inventoryQuantity: number;
  option1: string | null;
  option2: string | null;
  option3: string | null;
}

/** Channel reference embedded in product/order/customer responses. */
export interface ChannelRef {
  id: string;
  name: string;
  platform: string;
}

/** A product in a list response (summary view). */
export interface Product {
  id: string;
  title: string;
  vendor: string | null;
  productType: string | null;
  status: ProductStatus;
  tags: string[];
  totalStock: number;
  variantCount: number;
  priceRange: { min: number; max: number };
  image: ProductImage | null;
  channel: ChannelRef;
  createdAt: string;
  variants: ProductVariant[];
}

/** A product detail response with all variants and images. */
export interface ProductDetail extends Product {
  images: ProductImage[];
}

/** Query parameters for the product list endpoint. */
export interface ProductListParams {
  page?: number;
  limit?: number;
  status?: ProductStatus;
  vendor?: string;
  productType?: string;
  channelId?: string;
  search?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  stockStatus?: StockStatus;
}

// ─── Order Types ─────────────────────────────────────────────────────────────

/** Financial status of an order. */
export type FinancialStatus =
  | "PENDING"
  | "AUTHORIZED"
  | "PARTIALLY_PAID"
  | "PAID"
  | "PARTIALLY_REFUNDED"
  | "REFUNDED"
  | "VOIDED";

/** Fulfillment status of an order. */
export type FulfillmentStatus = "UNFULFILLED" | "FULFILLED" | "PARTIAL" | "RESTOCKED";

/** Customer summary embedded in an order response. */
export interface OrderCustomer {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

/** An order in a list response (summary view). */
export interface Order {
  id: string;
  orderNumber: number;
  name: string;
  financialStatus: FinancialStatus;
  fulfillmentStatus: FulfillmentStatus;
  currency: string;
  totalPrice: number;
  subtotalPrice: number;
  totalTax: number;
  totalDiscounts: number;
  totalShippingPrice: number;
  tags: string[];
  note: string | null;
  cancelReason: string | null;
  cancelledAt: string | null;
  customer: OrderCustomer;
  channel: ChannelRef;
  itemCount: number;
  createdAt: string;
}

/** A line item within an order detail. */
export interface OrderLineItem {
  id: string;
  title: string;
  quantity: number;
  price: number;
  sku: string | null;
  variantTitle: string | null;
}

/** A fulfillment record within an order detail. */
export interface OrderFulfillment {
  id: string;
  status: string;
  trackingNumber: string | null;
  trackingUrl: string | null;
  createdAt: string;
}

/** A refund record within an order detail. */
export interface OrderRefund {
  id: string;
  amount: number;
  reason: string | null;
  createdAt: string;
}

/** A timeline event within an order detail. */
export interface OrderTimeline {
  id: string;
  message: string;
  createdAt: string;
}

/** Full order detail with line items, fulfillments, refunds, and timeline. */
export interface OrderDetail extends Order {
  lineItems: OrderLineItem[];
  fulfillments: OrderFulfillment[];
  refunds: OrderRefund[];
  timeline: OrderTimeline[];
}

/** Query parameters for the order list endpoint. */
export interface OrderListParams {
  page?: number;
  limit?: number;
  financialStatus?: FinancialStatus;
  fulfillmentStatus?: FulfillmentStatus;
  channelId?: string;
  search?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  dateFrom?: string;
  dateTo?: string;
}

// ─── Customer Types ──────────────────────────────────────────────────────────

/** VIP tier for a customer. */
export type VipLevel = "NONE" | "BRONZE" | "SILVER" | "GOLD" | "PLATINUM";

/** A customer in a list response (summary view). */
export interface Customer {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  vipLevel: VipLevel;
  totalSpent: number;
  ordersCount: number;
  tags: string[];
  segments: string[];
  state: string | null;
  channel: ChannelRef;
  createdAt: string;
}

/** A customer activity log entry. */
export interface CustomerActivityLog {
  id: string;
  action: string;
  details: Record<string, unknown> | null;
  createdAt: string;
}

/** Full customer detail with recent orders and activity history. */
export interface CustomerDetail extends Customer {
  orders: Order[];
  activityLogs: CustomerActivityLog[];
}

/** Query parameters for the customer list endpoint. */
export interface CustomerListParams {
  page?: number;
  limit?: number;
  vipLevel?: VipLevel;
  channelId?: string;
  search?: string;
  tag?: string;
  segment?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

/** Payload for updating a customer's VIP level, notes, segments, or tags. */
export interface UpdateCustomerRequest {
  vipLevel?: VipLevel;
  internalNotes?: string;
  segments?: string[];
  tags?: string[];
  gstin?: string;
  billingStateCode?: string;
  billingStateName?: string;
}

// ─── Order Stats Types ──────────────────────────────────────────────────────

/** Direction of a period-over-period change. */
export type ChangeDirection = "up" | "down" | "same";

/** A single metric with current/previous values and change percentage. */
export interface StatMetric {
  current: number;
  previous: number;
  change: {
    percentage: number;
    direction: ChangeDirection;
  };
}

/** Period-over-period comparison stats returned by GET /orders/stats. */
export interface OrderStatsResponse {
  period: {
    current: { from: string; to: string };
    previous: { from: string; to: string };
  };
  totalNewOrders: StatMetric;
  pendingOrders: StatMetric;
  totalSales: StatMetric;
  totalProductsSold: StatMetric;
}

// ─── Dashboard Types ────────────────────────────────────────────────────────

/** Query parameters for the dashboard overview endpoint. */
export interface DashboardQueryParams {
  dateFrom?: string;
  dateTo?: string;
  channelId?: string;
}

/** Fulfillment status breakdown counts. */
export interface FulfillmentBreakdown {
  unfulfilled: number;
  fulfilled: number;
  partial: number;
  restocked: number;
}

/** A top-selling product returned by the dashboard endpoint. */
export interface DashboardTopProduct {
  externalProductId: string;
  title: string;
  image: string | null;
  totalQuantitySold: number;
  totalOrders: number;
  currentStock: number;
  price: string;
}

/** A recent order returned by the dashboard endpoint (subset of full Order). */
export interface DashboardRecentOrder {
  id: string;
  orderNumber: number;
  name: string;
  totalPrice: number;
  currency: string;
  financialStatus: FinancialStatus;
  fulfillmentStatus: FulfillmentStatus;
  customer: OrderCustomer;
  itemCount: number;
  createdAt: string;
}

/** Full dashboard overview response. */
export interface DashboardOverview {
  totalSales: number;
  totalOrders: number;
  totalCustomers: number;
  totalProducts: number;
  totalInventory: number;
  fulfillmentBreakdown: FulfillmentBreakdown;
  topSellingProducts: DashboardTopProduct[];
  recentOrders: DashboardRecentOrder[];
}

// ─── Customer Stats Types ──────────────────────────────────────────────────

/** New-customers metric with period-over-period comparison. */
export interface NewCustomersMetric {
  current: number;
  previous: number;
  change: {
    percentage: number;
    direction: ChangeDirection;
  };
}

/** VIP tier breakdown counts. */
export interface VipBreakdown {
  none: number;
  bronze: number;
  silver: number;
  gold: number;
  platinum: number;
}

/** Aggregate customer statistics returned by GET /customers/stats. */
export interface CustomerStatsResponse {
  totalCustomers: number;
  activeCustomers: number;
  inactiveCustomers: number;
  newCustomers: NewCustomersMetric;
  totalRevenue: number;
  averageCustomerValue: number;
  averageOrderValue: number;
  vipBreakdown: VipBreakdown;
}

// ─── Product Stats Types ───────────────────────────────────────────────────

/** Aggregate product statistics returned by GET /products/stats. */
export interface ProductStatsResponse {
  totalProducts: number;
  activeListings: number;
  draftProducts: number;
  archivedProducts: number;
  outOfStockProducts: number;
  lowStockProducts: number;
  lowStockThreshold: number;
  totalInventoryUnits: number;
}

// ─── GST Types ──────────────────────────────────────────────────────────────

/** An Indian state with its GST state code. */
export interface IndianState {
  code: string;
  name: string;
  unionTerritory: boolean;
}

/** A GSTIN registration for an organization. */
export interface OrganizationGstin {
  id: string;
  organizationId: string;
  gstin: string;
  legalName: string;
  tradeName: string | null;
  stateCode: string;
  stateName: string;
  address: Record<string, unknown> | null;
  isDefault: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Payload for adding a new GSTIN registration. */
export interface CreateGstinRequest {
  gstin: string;
  legalName: string;
  tradeName?: string;
  stateCode: string;
  stateName: string;
  address?: Record<string, unknown>;
  isDefault?: boolean;
}

/** Payload for updating a GSTIN registration. */
export interface UpdateGstinRequest {
  gstin?: string;
  legalName?: string;
  tradeName?: string;
  stateCode?: string;
  stateName?: string;
  address?: Record<string, unknown>;
  isDefault?: boolean;
  isActive?: boolean;
}

// ─── Invoice Types ──────────────────────────────────────────────────────────

/** GST transaction type. */
export type GstType = "CGST_SGST" | "IGST";

/** Invoice status. */
export type InvoiceStatus = "DRAFT" | "ISSUED" | "CANCELLED" | "CREDIT_NOTE";

/** An invoice line item with full tax breakdown. */
export interface InvoiceLineItem {
  id: string;
  orderLineItemId: string | null;
  description: string;
  hsnCode: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  taxableValue: number;
  gstRate: number;
  cgstRate: number;
  cgstAmount: number;
  sgstRate: number;
  sgstAmount: number;
  igstRate: number;
  igstAmount: number;
  totalTax: number;
  totalAmount: number;
}

/** An invoice in a list response (summary view). */
export interface Invoice {
  id: string;
  invoiceNumber: string;
  invoiceDate: string;
  financialYear: string;
  buyerName: string;
  buyerGstin: string | null;
  placeOfSupply: string;
  placeOfSupplyName: string;
  gstType: GstType;
  subtotal: number;
  totalCgst: number;
  totalSgst: number;
  totalIgst: number;
  totalTax: number;
  totalDiscount: number;
  grandTotal: number;
  currency: string;
  status: InvoiceStatus;
  order: { name: string; orderNumber: number };
  createdAt: string;
}

/** Full invoice detail with line items. */
export interface InvoiceDetail extends Invoice {
  sellerGstin: string;
  sellerLegalName: string;
  sellerAddress: Record<string, unknown> | null;
  sellerStateCode: string;
  sellerStateName: string;
  buyerAddress: Record<string, unknown> | null;
  buyerStateCode: string;
  buyerStateName: string;
  reverseCharge: boolean;
  notes: string | null;
  lineItems: InvoiceLineItem[];
}

/** Payload for generating a new invoice. */
export interface CreateInvoiceRequest {
  orderId: string;
  sellerGstinId?: string;
  buyerGstin?: string;
  placeOfSupplyCode?: string;
  notes?: string;
}

/** Query parameters for the invoice list endpoint. */
export interface InvoiceListParams {
  page?: number;
  limit?: number;
  financialYear?: string;
  status?: InvoiceStatus;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  sellerGstinId?: string;
}

/** Query parameters for the GST return summary endpoint. */
export interface GstReturnParams {
  financialYear: string;
  period: string;
  returnType?: "GSTR1" | "GSTR3B";
  sellerGstinId?: string;
}

// ─── GST Return Types ───────────────────────────────────────────────────────

/** A B2B buyer group in GSTR-1. */
export interface Gstr1B2bEntry {
  buyerGstin: string;
  buyerName: string;
  invoiceCount: number;
  invoices: Array<{
    invoiceNumber: string;
    invoiceDate: string;
    gstType: GstType;
    subtotal: number;
    cgst: number;
    sgst: number;
    igst: number;
    totalTax: number;
    grandTotal: number;
  }>;
  totalTaxable: number;
  totalTax: number;
}

/** A B2C state-wise summary in GSTR-1. */
export interface Gstr1B2cSummary {
  placeOfSupply: string;
  placeOfSupplyName: string;
  invoiceCount: number;
  totalTaxable: number;
  totalCgst: number;
  totalSgst: number;
  totalIgst: number;
  totalTax: number;
}

/** HSN-wise summary in GSTR-1. */
export interface Gstr1HsnSummary {
  hsnCode: string;
  quantity: number;
  taxable: number;
  tax: number;
}

/** Full GSTR-1 return data. */
export interface GstReturnGstr1 {
  b2b: Gstr1B2bEntry[];
  b2cSummary: Gstr1B2cSummary[];
  hsnSummary: Gstr1HsnSummary[];
  totals: {
    totalTaxable: number;
    totalCgst: number;
    totalSgst: number;
    totalIgst: number;
    totalTax: number;
    totalInvoices: number;
  };
}

/** Outward supply by rate in GSTR-3B. */
export interface Gstr3bOutwardSupply {
  gstRate: number;
  taxableValue: number;
  cgst: number;
  sgst: number;
  igst: number;
  totalTax: number;
}

/** Full GSTR-3B return data. */
export interface GstReturnGstr3B {
  outwardSupplies: Gstr3bOutwardSupply[];
  interState: {
    invoiceCount: number;
    totalTaxable: number;
    totalIgst: number;
  };
  taxPayable: {
    cgst: number;
    sgst: number;
    igst: number;
    total: number;
  };
}

/** Payload for updating a product's HSN code and GST rate. */
export interface UpdateProductGstRequest {
  hsnCode?: string;
  gstRate?: number;
}

// ─── State Tax Rate Types ───────────────────────────────────────────────────

/** A default GST rate configured for a specific state. */
export interface StateTaxRate {
  id: string;
  organizationId: string;
  stateCode: string;
  stateName: string;
  gstRate: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateStateTaxRateRequest {
  stateCode: string;
  gstRate: number;
}

export interface UpdateStateTaxRateRequest {
  gstRate: number;
}

// ─── Product Type Tax Rate Types ─────────────────────────────────────────────

/** A default GST rate configured for a specific product type. */
export interface ProductTypeTaxRate {
  id: string;
  organizationId: string;
  productType: string;
  gstRate: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateProductTypeTaxRateRequest {
  productType: string;
  gstRate: number;
}

export interface UpdateProductTypeTaxRateRequest {
  gstRate: number;
}

// ─── Collection Types ───────────────────────────────────────────────────────

/** A synced Shopify collection. */
export interface ShopifyCollection {
  id: string;
  organizationId: string;
  title: string;
  handle: string | null;
  collectionType: string;
  taxOverride: CollectionTaxOverride | null;
  createdAt: string;
}

/** A GST rate override for a collection. */
export interface CollectionTaxOverride {
  id: string;
  organizationId: string;
  collectionId: string;
  gstRate: number;
  collection?: { id: string; title: string; handle: string | null };
  createdAt: string;
  updatedAt: string;
}

export interface CreateCollectionOverrideRequest {
  collectionId: string;
  gstRate: number;
}

export interface UpdateCollectionOverrideRequest {
  gstRate: number;
}
