import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { inventoryService } from "~/services/inventory.service";
import { handleMutationError } from "~/lib/handle-mutation-error";
import { inventoryKeys } from "./use-inventory-queries";
import { productKeys } from "./use-product-queries";
import type {
  BulkLocationsRequest,
  CreateAdjustmentRequest,
  CreateWarehouseRequest,
  GenerateCodesRequest,
  UpdateWarehouseRequest,
} from "~/types/api";

/**
 * Inventory mutations. Every stock-touching mutation invalidates BOTH the
 * inventory prefix and the products prefix — the products list/detail screens
 * render variant.inventoryQuantity (the sellable cache) and must refresh.
 */

export function useEnableInventoryMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => inventoryService.enable(),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: inventoryKeys.all });
      if (res.status === "SEEDING") {
        toast.success("Warehousing is being set up — seeding stock from your catalog.");
      }
    },
    onError: (error) => handleMutationError(error, "Failed to enable warehousing."),
  });
}

export function useCreateAdjustmentMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateAdjustmentRequest) => inventoryService.createAdjustment(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: inventoryKeys.all });
      queryClient.invalidateQueries({ queryKey: productKeys.all });
      toast.success("Stock adjusted.");
    },
    onError: (error) => handleMutationError(error, "Failed to adjust stock."),
  });
}

export function useGenerateSkusMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: GenerateCodesRequest) => inventoryService.generateSkus(data),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: inventoryKeys.all });
      queryClient.invalidateQueries({ queryKey: productKeys.all });
      toast.success(
        `Generated ${res.generated} SKU${res.generated === 1 ? "" : "s"}` +
          (res.skipped > 0 ? ` (${res.skipped} skipped)` : "") + ".",
      );
    },
    onError: (error) => handleMutationError(error, "Failed to generate SKUs."),
  });
}

export function useGenerateBarcodesMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: GenerateCodesRequest) => inventoryService.generateBarcodes(data),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: inventoryKeys.all });
      queryClient.invalidateQueries({ queryKey: productKeys.all });
      toast.success(
        `Generated ${res.generated} barcode${res.generated === 1 ? "" : "s"}` +
          (res.skipped > 0 ? ` (${res.skipped} skipped — no SKU yet)` : "") + ".",
      );
    },
    onError: (error) => handleMutationError(error, "Failed to generate barcodes."),
  });
}

export function useCreateWarehouseMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateWarehouseRequest) => inventoryService.createWarehouse(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: inventoryKeys.all });
      toast.success("Warehouse created.");
    },
    onError: (error) => handleMutationError(error, "Failed to create warehouse."),
  });
}

export function useUpdateWarehouseMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateWarehouseRequest }) =>
      inventoryService.updateWarehouse(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: inventoryKeys.all });
      toast.success("Warehouse updated.");
    },
    onError: (error) => handleMutationError(error, "Failed to update warehouse."),
  });
}

export function useBulkCreateLocationsMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: BulkLocationsRequest }) =>
      inventoryService.bulkCreateLocations(id, data),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: inventoryKeys.all });
      toast.success(`Created ${res.created} locations.`);
    },
    onError: (error) => handleMutationError(error, "Failed to create locations."),
  });
}
