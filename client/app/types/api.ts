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

/** Payload for starting Shopify OAuth (the store domain). */
export interface ShopifyInstallRequest {
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
}
