import { apiClient } from "~/lib/api-client";
import type {
  SignupRequest,
  SignupResponse,
  LoginRequest,
  LoginResponse,
  VerifyEmailRequest,
  VerifyEmailResponse,
  ResendVerificationRequest,
  ResendVerificationResponse,
  ForgotPasswordRequest,
  ForgotPasswordResponse,
  ResetPasswordRequest,
  ResetPasswordResponse,
  GetInviteResponse,
  AcceptInviteRequest,
  AcceptInviteResponse,
} from "~/types/api";

export const authService = {
  signup: (data: SignupRequest) =>
    apiClient.post<SignupResponse>("/auth/signup", data).then((r) => r.data),

  login: (data: LoginRequest) =>
    apiClient.post<LoginResponse>("/auth/login", data).then((r) => r.data),

  verifyEmail: (data: VerifyEmailRequest) =>
    apiClient
      .post<VerifyEmailResponse>("/auth/verify-email", data)
      .then((r) => r.data),

  resendVerification: (data: ResendVerificationRequest) =>
    apiClient
      .post<ResendVerificationResponse>("/auth/resend-verification", data)
      .then((r) => r.data),

  forgotPassword: (data: ForgotPasswordRequest) =>
    apiClient
      .post<ForgotPasswordResponse>("/auth/forgot-password", data)
      .then((r) => r.data),

  resetPassword: (data: ResetPasswordRequest) =>
    apiClient
      .post<ResetPasswordResponse>("/auth/reset-password", data)
      .then((r) => r.data),

  getInvite: (token: string) =>
    apiClient
      .get<GetInviteResponse>(`/auth/invite/${token}`)
      .then((r) => r.data),

  acceptInvite: (data: AcceptInviteRequest) =>
    apiClient
      .post<AcceptInviteResponse>("/auth/invite/accept", data)
      .then((r) => r.data),
};
