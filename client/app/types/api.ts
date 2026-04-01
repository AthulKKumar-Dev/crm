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
  message: string;
  nextStep: "verify-email";
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: User;
  organizations: OrganizationMembership[];
  nextStep: "choose-account-type" | null;
}

export interface VerifyEmailResponse {
  accessToken: string;
  refreshToken: string;
  user: User;
  organizations: OrganizationMembership[];
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
