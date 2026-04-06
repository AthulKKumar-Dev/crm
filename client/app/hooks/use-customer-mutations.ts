import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { customerService } from "~/services/customer.service";
import { customerKeys } from "~/hooks/use-customer-queries";
import { handleMutationError } from "~/lib/handle-mutation-error";
import type { UpdateCustomerRequest } from "~/types/api";

/** Mutation hook for updating a customer's VIP level, notes, segments, or tags. */
export function useUpdateCustomerMutation(customerId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: UpdateCustomerRequest) => customerService.update(customerId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: customerKeys.detail(customerId) });
      queryClient.invalidateQueries({ queryKey: customerKeys.list() });
      toast.success("Customer updated.");
    },
    onError: (error) => handleMutationError(error, "Failed to update customer."),
  });
}
