import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { gstService } from "~/services/gst.service";
import { gstKeys } from "~/hooks/use-gst-queries";
import { handleMutationError } from "~/lib/handle-mutation-error";
import type {
  CreateGstinRequest,
  UpdateGstinRequest,
  CreateStateTaxRateRequest,
  UpdateStateTaxRateRequest,
  CreateCollectionOverrideRequest,
  UpdateCollectionOverrideRequest,
} from "~/types/api";

// ─── GSTIN Mutations ───

export function useCreateGstinMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateGstinRequest) => gstService.createGstin(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: gstKeys.gstins() });
      toast.success("GSTIN added successfully.");
    },
    onError: (error) => handleMutationError(error, "Failed to add GSTIN."),
  });
}

export function useUpdateGstinMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateGstinRequest }) =>
      gstService.updateGstin(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: gstKeys.gstins() });
      toast.success("GSTIN updated successfully.");
    },
    onError: (error) => handleMutationError(error, "Failed to update GSTIN."),
  });
}

export function useDeleteGstinMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => gstService.deleteGstin(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: gstKeys.gstins() });
      toast.success("GSTIN deactivated.");
    },
    onError: (error) => handleMutationError(error, "Failed to deactivate GSTIN."),
  });
}

// ─── State Tax Rate Mutations ───

export function useCreateStateTaxRateMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateStateTaxRateRequest) => gstService.createStateTaxRate(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: gstKeys.stateTaxRates() });
      toast.success("State tax rate added.");
    },
    onError: (error) => handleMutationError(error, "Failed to add state tax rate."),
  });
}

export function useUpdateStateTaxRateMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateStateTaxRateRequest }) =>
      gstService.updateStateTaxRate(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: gstKeys.stateTaxRates() });
      toast.success("State tax rate updated.");
    },
    onError: (error) => handleMutationError(error, "Failed to update state tax rate."),
  });
}

export function useDeleteStateTaxRateMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => gstService.deleteStateTaxRate(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: gstKeys.stateTaxRates() });
      toast.success("State tax rate removed.");
    },
    onError: (error) => handleMutationError(error, "Failed to remove state tax rate."),
  });
}

// ─── Collection Override Mutations ───

export function useCreateCollectionOverrideMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateCollectionOverrideRequest) => gstService.createCollectionOverride(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: gstKeys.collectionOverrides() });
      queryClient.invalidateQueries({ queryKey: gstKeys.collections() });
      toast.success("Collection tax override added.");
    },
    onError: (error) => handleMutationError(error, "Failed to add collection override."),
  });
}

export function useUpdateCollectionOverrideMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateCollectionOverrideRequest }) =>
      gstService.updateCollectionOverride(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: gstKeys.collectionOverrides() });
      queryClient.invalidateQueries({ queryKey: gstKeys.collections() });
      toast.success("Collection tax override updated.");
    },
    onError: (error) => handleMutationError(error, "Failed to update collection override."),
  });
}

export function useDeleteCollectionOverrideMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => gstService.deleteCollectionOverride(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: gstKeys.collectionOverrides() });
      queryClient.invalidateQueries({ queryKey: gstKeys.collections() });
      toast.success("Collection tax override removed.");
    },
    onError: (error) => handleMutationError(error, "Failed to remove collection override."),
  });
}
