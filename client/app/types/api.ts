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
