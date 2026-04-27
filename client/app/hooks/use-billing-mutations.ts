import { useMutation } from "@tanstack/react-query";
import { billingService } from "~/services/billing.service";
import { handleMutationError } from "~/lib/handle-mutation-error";
import type { StartOnboardingCheckoutRequest } from "~/types/api";

/**
 * Mutation hook to kick off the Razorpay onboarding checkout. Creates a
 * Razorpay Subscription server-side and returns the `subscriptionId` the
 * client uses to mount Checkout.js.
 */
export function useStartOnboardingCheckoutMutation() {
  return useMutation({
    mutationFn: (data: StartOnboardingCheckoutRequest) =>
      billingService.startOnboardingCheckout(data),
    onError: (error) =>
      handleMutationError(error, "Failed to start checkout."),
  });
}
