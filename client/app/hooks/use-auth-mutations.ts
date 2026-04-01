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
      if (!isAxiosError(error)) {
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
      if (data.organizations.length > 0) {
        useAuthStore.getState().setCurrentOrg(data.organizations[0].organization.id);
      }
      navigate(resolvePostAuthRoute(data.nextStep));
    },
    onError: (error) => {
      if (isAxiosError(error) && error.response?.status === 403) {
        const userId = error.response.data?.userId;
        if (userId) {
          toast.info("Please verify your email first.");
          navigate(`/auth/verify-email?userId=${userId}`);
          return;
        }
      }
      if (!isAxiosError(error)) {
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
      if (data.organizations.length > 0) {
        useAuthStore.getState().setCurrentOrg(data.organizations[0].organization.id);
      }
      toast.success("Email verified successfully!");
      navigate(resolvePostAuthRoute(data.nextStep));
    },
    onError: (error) => {
      if (!isAxiosError(error)) {
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
