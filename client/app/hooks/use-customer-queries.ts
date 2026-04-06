import { useQuery } from "@tanstack/react-query";
import { customerService } from "~/services/customer.service";
import type { CustomerListParams } from "~/types/api";

/** React Query key factory for all customer-related queries. */
export const customerKeys = {
  all: ["customers"] as const,
  list: (params?: CustomerListParams) => [...customerKeys.all, "list", params] as const,
  detail: (id: string) => [...customerKeys.all, "detail", id] as const,
  tags: () => [...customerKeys.all, "tags"] as const,
  segments: () => [...customerKeys.all, "segments"] as const,
};

/** Fetch a paginated list of customers with optional filters. */
export function useCustomers(params?: CustomerListParams) {
  return useQuery({
    queryKey: customerKeys.list(params),
    queryFn: () => customerService.list(params),
  });
}

/** Fetch a single customer by ID. */
export function useCustomer(id?: string | null) {
  return useQuery({
    queryKey: customerKeys.detail(id!),
    queryFn: () => customerService.get(id!),
    enabled: !!id,
  });
}

/** Fetch all unique customer tags for filter dropdowns. */
export function useCustomerTags() {
  return useQuery({
    queryKey: customerKeys.tags(),
    queryFn: () => customerService.tags(),
  });
}

/** Fetch all unique customer segments for filter dropdowns. */
export function useCustomerSegments() {
  return useQuery({
    queryKey: customerKeys.segments(),
    queryFn: () => customerService.segments(),
  });
}
