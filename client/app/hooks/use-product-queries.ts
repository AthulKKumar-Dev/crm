import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { pollWhile } from "~/lib/poll-while";
import { isProductPushInFlight } from "~/lib/product-shopify-sync";
import { productService } from "~/services/product.service";
import type {
  PaginatedResponse,
  Product,
  ProductDetail,
  ProductListParams,
  ProductShopifySync,
} from "~/types/api";

/** React Query key factory for all product-related queries. */
export const productKeys = {
  all: ["products"] as const,
  list: (params?: ProductListParams) => [...productKeys.all, "list", params] as const,
  detail: (id: string) => [...productKeys.all, "detail", id] as const,
  vendors: () => [...productKeys.all, "vendors"] as const,
  types: () => [...productKeys.all, "types"] as const,
  stats: (params?: { channelId?: string }) => [...productKeys.all, "stats", params] as const,
};

// A row shows a "Syncing" badge while its Shopify push is in flight. The list
// used to be fetched once, so the badge stayed until the page was reloaded.
// A stuck claim (PENDING, but abandoned) is not in flight and is not polled.
const pollWhileAnyProductPushing = pollWhile<PaginatedResponse<Product>>(
  (page) => page?.data.some((p) => isProductPushInFlight(p.shopifySync)) ?? false,
);

// The detail endpoint reports sync under metadata (only the list response
// maps it top-level), so check both places.
const pollWhileProductPushing = pollWhile<ProductDetail>((product) =>
  isProductPushInFlight(
    product?.shopifySync ??
      (product?.metadata as { shopifySync?: ProductShopifySync } | null | undefined)
        ?.shopifySync,
  ),
);

/** Fetch a paginated list of products with optional filters. */
export function useProducts(params?: ProductListParams) {
  return useQuery({
    queryKey: productKeys.list(params),
    queryFn: () => productService.list(params),
    placeholderData: keepPreviousData,
    refetchInterval: pollWhileAnyProductPushing,
  });
}

/** Fetch a single product by ID. */
export function useProduct(id?: string | null) {
  return useQuery({
    queryKey: productKeys.detail(id!),
    queryFn: () => productService.get(id!),
    enabled: !!id,
    // Poll only while a Shopify push is in flight; stops by itself once it
    // resolves (replaces the old blind 3s/8s setTimeout invalidations).
    refetchInterval: pollWhileProductPushing,
  });
}

/** Fetch the list of unique product vendors for filter dropdowns. */
export function useProductVendors() {
  return useQuery({
    queryKey: productKeys.vendors(),
    queryFn: () => productService.vendors(),
  });
}

/** Fetch the list of unique product types for filter dropdowns. */
export function useProductTypes() {
  return useQuery({
    queryKey: productKeys.types(),
    queryFn: () => productService.types(),
  });
}

/** Fetch aggregate product statistics. */
export function useProductStats(params?: { channelId?: string }) {
  return useQuery({
    queryKey: productKeys.stats(params),
    queryFn: () => productService.stats(params),
  });
}
