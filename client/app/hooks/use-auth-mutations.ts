import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { isAxiosError } from "axios";
import { authService } from "~/services/auth.service";
import { useAuthStore } from "~/stores/auth.store";
import type {
  SignupRequest,
  LoginRequest,
  VerifyEmailRequest,
  ResendVerificationRequest,
  ForgotPasswordRequest,
  ResetPasswordRequest,
  AcceptInviteRequest,
} from "~/types/api";

function resolvePostAuthRoute(nextStep: string | null): string {
  return nextStep === "choose-account-type" ? "/onboarding/account-type" : "/dashboard";
}

export function useSignupMutation() {
  const navigate = useNavigate();

  return useMutation({
    mutationFn: (data: SignupRequest) => authService.signup(data),
    onSuccess: (data) => {
      toast.success("Account created! Please verify your email.");
      navigate(`/auth/verify-email?userId=${data.userId}`);
    },
    onError: (error) => {
      if (isAxiosError(error)) {
        const msg = error.response?.data?.message;
        if (msg) {
          toast.error(msg);
        }
      } else {
        toast.error("Something went wrong. Please try again.");
      }
    },
  });
}

export function useLoginMutation() {
  const navigate = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);

  return useMutation({
    mutationFn: (data: LoginRequest) => authService.login(data),
    onSuccess: (data) => {
      setAuth(data.user, data.accessToken, data.refreshToken, data.organizations);
      // Backend returns flat orgs: { id, name, slug, type, role }
      // setAuth normalizes them — use the org id directly
      if (data.organizations.length > 0) {
        useAuthStore.getState().setCurrentOrg(data.organizations[0].id);
      }
      navigate(resolvePostAuthRoute(data.nextStep));
    },
    onError: (error) => {
      if (isAxiosError(error)) {
        // 403 = email not verified → redirect to OTP page
        if (error.response?.status === 403) {
          const userId = error.response.data?.userId;
          if (userId) {
            toast.info("Please verify your email first.");
            navigate(`/auth/verify-email?userId=${userId}`);
            return;
          }
        }
        // Show server error message (e.g. "Invalid email or password")
        const msg = error.response?.data?.message;
        if (msg) {
          toast.error(msg);
        }
      } else {
        toast.error("Something went wrong. Please try again.");
      }
    },
  });
}

export function useVerifyEmailMutation() {
  const navigate = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);

  return useMutation({
    mutationFn: (data: VerifyEmailRequest) => authService.verifyEmail(data),
    onSuccess: (data) => {
      setAuth(data.user, data.accessToken, data.refreshToken, data.organizations);
      // Backend returns flat orgs: { id, name, slug, type, role }
      if (data.organizations.length > 0) {
        useAuthStore.getState().setCurrentOrg(data.organizations[0].id);
      }
      toast.success("Email verified successfully!");
      navigate(resolvePostAuthRoute(data.nextStep));
    },
    onError: (error) => {
      if (isAxiosError(error)) {
        const msg = error.response?.data?.message;
        if (msg) {
          toast.error(msg);
        }
      } else {
        toast.error("Something went wrong. Please try again.");
      }
    },
  });
}

export function useResendVerificationMutation() {
  return useMutation({
    mutationFn: (data: ResendVerificationRequest) =>
      authService.resendVerification(data),
    onSuccess: () => {
      toast.success("Verification code resent to your email.");
    },
    onError: (error) => {
      if (isAxiosError(error)) {
        toast.error(error.response?.data?.message || "Failed to resend code.");
      } else {
        toast.error("Something went wrong. Please try again.");
      }
    },
  });
}

export function useForgotPasswordMutation() {
  return useMutation({
    mutationFn: (data: ForgotPasswordRequest) =>
      authService.forgotPassword(data),
    onError: (error) => {
      if (!isAxiosError(error)) {
        toast.error("Something went wrong. Please try again.");
      }
    },
  });
}

export function useResetPasswordMutation() {
  const navigate = useNavigate();

  return useMutation({
    mutationFn: (data: ResetPasswordRequest) =>
      authService.resetPassword(data),
    onSuccess: () => {
      toast.success("Password reset successfully. You can now sign in.");
      navigate("/auth/login");
    },
    onError: (error) => {
      if (!isAxiosError(error)) {
        toast.error("Something went wrong. Please try again.");
      }
    },
  });
}

export function useAcceptInviteMutation() {
  const navigate = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);

  return useMutation({
    mutationFn: (data: AcceptInviteRequest) =>
      authService.acceptInvite(data),
    onSuccess: (data) => {
      // Build a minimal User object from the response
      const user = {
        id: data.user.id,
        email: data.user.email,
        firstName: data.user.firstName,
        lastName: data.user.lastName,
        avatarUrl: null,
        emailVerified: true,
        twoFactorEnabled: false,
        lastLoginAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // Build org membership from invite response
      const membership = {
        id: crypto.randomUUID(),
        organizationId: data.organization.id,
        role: "AGENT" as const,
        isActive: true,
        organization: {
          id: data.organization.id,
          name: data.organization.name,
          slug: data.organization.slug,
          type: "ORGANIZATION" as const,
          logo: null,
          timezone: "UTC",
          currency: "USD",
          industry: null,
          website: null,
          billingPlan: "FREE" as const,
          onboardingStatus: "COMPLETED" as const,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      };

      setAuth(user, data.accessToken, data.refreshToken, [membership]);
      useAuthStore.getState().setCurrentOrg(data.organization.id);
      toast.success(`Joined ${data.organization.name} successfully!`);
      navigate("/dashboard");
    },
    onError: (error) => {
      if (!isAxiosError(error)) {
        toast.error("Something went wrong. Please try again.");
      }
    },
  });
}
