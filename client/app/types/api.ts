export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
}

export interface ApiErrorResponse {
  success: false;
  statusCode: number;
  message: string;
  errors?: string[];
  timestamp: string;
  path: string;
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

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

export interface OrganizationMembership {
  id: string;
  organizationId: string;
  role: UserRole;
  isActive: boolean;
  organization: Organization;
}

export type UserRole = "OWNER" | "ADMIN" | "MANAGER" | "AGENT" | "VIEWER";

// ─── Auth Request Types ───

export interface SignupRequest {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  avatarUrl?: string;
}

export interface LoginRequest {
  email: string;
  password: string;
  totpCode?: string;
}

export interface VerifyEmailRequest {
  userId: string;
  code: string;
}

export interface ResendVerificationRequest {
  userId: string;
}

// ─── Auth Response Types ───

export interface SignupResponse {
  userId: string;
  email: string;
  verifyCode: string;
  message: string;
  nextStep: "verify-email";
}

// The backend returns a simplified org shape from login/verify endpoints
export interface AuthOrganization {
  id: string;
  name: string;
  slug: string;
  type: "PERSONAL" | "ORGANIZATION";
  role: UserRole;
}

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

export interface ResendVerificationResponse {
  message: string;
  nextStep: "verify-email";
}

// ─── Forgot / Reset Password ───

export interface ForgotPasswordRequest {
  email: string;
}

export interface ForgotPasswordResponse {
  message: string;
}

export interface ResetPasswordRequest {
  token: string;
  newPassword: string;
}

export interface ResetPasswordResponse {
  message: string;
}

// ─── User Types ───

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

export interface UpdateUserRequest {
  firstName?: string;
  lastName?: string;
  avatarUrl?: string;
}

// ─── Organization Types ───

/** The shape the backend actually returns for org endpoints */
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

export interface CreateOrganizationRequest {
  name: string;
  slug?: string;
  logo?: string;
  timezone?: string;
  currency?: string;
  industry?: string;
  website?: string;
}

export interface UpdateOrganizationRequest {
  name?: string;
  logo?: string;
  timezone?: string;
  currency?: string;
  industry?: string;
  website?: string;
  lowStockThreshold?: number;
}

// ─── Member Types ───

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

export interface UpdateMemberRoleRequest {
  role: UserRole;
}

// ─── Team Invite Types ───

export interface SendInviteRequest {
  email: string;
  role: UserRole;
}

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

// ─── Invite Types (Auth-level) ───

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

export interface AcceptInviteRequest {
  token: string;
  firstName?: string;
  lastName?: string;
  password?: string;
}

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
