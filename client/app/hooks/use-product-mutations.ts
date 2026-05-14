import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { productService } from "~/services/product.service";
import { productKeys } from "~/hooks/use-product-queries";
import { handleMutationError } from "~/lib/handle-mutation-error";
import type {
  CreateProductRequest,
  UpdateProductRequest,
} from "~/types/api";

/** Create a CRM-native product. */
export function useCreateProductMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateProductRequest) => productService.create(data),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: productKeys.all });

      // The server tells us whether a Shopify push was queued. If so, the
      // local row will rebadge from MANUAL → SHOPIFY in 1-3s once the worker
      // pushes it. We force a second invalidation after a short delay so the
      // user sees the "Synced" badge appear without manually refreshing.
      const queued = (result as { shopifyPushQueued?: boolean }).shopifyPushQueued;
      if (queued) {
        toast.success("Product created. Syncing to Shopify…");
        setTimeout(() => {
          queryClient.invalidateQueries({ queryKey: productKeys.all });
        }, 3000);
        // One more pass after 8s in case Shopify is slow.
        setTimeout(() => {
          queryClient.invalidateQueries({ queryKey: productKeys.all });
        }, 8000);
      } else {
        // Auto-sync is OFF (default) — product stays local. The merchant can
        // push it from the product list/edit UI or via the channels-page
        // bulk Sync. Toast copy reflects this so we don't promise a sync
        // that won't happen.
        toast.success(
          "Product created. Sync to Shopify manually when you're ready.",
        );
      }
    },
    onError: (error) =>
      handleMutationError(error, "Failed to create product."),
  });
}

/** Edit a MANUAL-channel product. */
export function useUpdateProductMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateProductRequest }) =>
      productService.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: productKeys.all });
      toast.success("Product updated.");
    },
    onError: (error) =>
      handleMutationError(error, "Failed to update product."),
  });
}

/** Soft-delete (archive) a MANUAL-channel product. */
export function useDeleteProductMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => productService.softDelete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: productKeys.all });
      toast.success("Product archived.");
    },
    onError: (error) =>
      handleMutationError(error, "Failed to archive product."),
  });
}

/**
 * POST /products/:id/sync — manually push a MANUAL product to Shopify.
 * Idempotent; the toast reflects the server's status.
 */
export function useSyncProductMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => productService.syncToShopify(id),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: productKeys.all });
      if (result.status === "ALREADY_SYNCED") {
        toast.info("Product already synced to Shopify.");
      } else if (result.status === "ALREADY_QUEUED") {
        toast.info("Sync already in progress.");
      } else {
        toast.success("Sync to Shopify queued.");
      }
    },
    onError: (error) => handleMutationError(error, "Failed to sync product."),
  });
}
