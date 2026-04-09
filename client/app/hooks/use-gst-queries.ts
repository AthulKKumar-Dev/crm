import { useQuery } from "@tanstack/react-query";
import { gstService } from "~/services/gst.service";

export const gstKeys = {
  all: ["gst"] as const,
  gstins: () => [...gstKeys.all, "gstins"] as const,
  states: () => [...gstKeys.all, "states"] as const,
  stateTaxRates: () => [...gstKeys.all, "state-tax-rates"] as const,
  collections: () => [...gstKeys.all, "collections"] as const,
  collectionOverrides: () => [...gstKeys.all, "collection-overrides"] as const,
  productTypeTaxRates: () => [...gstKeys.all, "product-type-tax-rates"] as const,
};

export function useGstins() {
  return useQuery({
    queryKey: gstKeys.gstins(),
    queryFn: () => gstService.listGstins(),
  });
}

export function useIndianStates() {
  return useQuery({
    queryKey: gstKeys.states(),
    queryFn: () => gstService.getStates(),
    staleTime: Infinity,
  });
}

export function useStateTaxRates() {
  return useQuery({
    queryKey: gstKeys.stateTaxRates(),
    queryFn: () => gstService.listStateTaxRates(),
  });
}

export function useCollections() {
  return useQuery({
    queryKey: gstKeys.collections(),
    queryFn: () => gstService.listCollections(),
  });
}

export function useCollectionOverrides() {
  return useQuery({
    queryKey: gstKeys.collectionOverrides(),
    queryFn: () => gstService.listCollectionOverrides(),
  });
}

export function useProductTypeTaxRates() {
  return useQuery({
    queryKey: gstKeys.productTypeTaxRates(),
    queryFn: () => gstService.listProductTypeTaxRates(),
  });
}
