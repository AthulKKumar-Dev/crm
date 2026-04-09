import { apiClient } from "~/lib/api-client";
import type {
  OrganizationGstin,
  CreateGstinRequest,
  UpdateGstinRequest,
  IndianState,
  StateTaxRate,
  CreateStateTaxRateRequest,
  UpdateStateTaxRateRequest,
  ShopifyCollection,
  CollectionTaxOverride,
  CreateCollectionOverrideRequest,
  UpdateCollectionOverrideRequest,
  ProductTypeTaxRate,
  CreateProductTypeTaxRateRequest,
  UpdateProductTypeTaxRateRequest,
} from "~/types/api";

export const gstService = {
  // ─── GSTIN Management ───
  listGstins: () =>
    apiClient.get<OrganizationGstin[]>("/gst/gstins").then((res) => res.data),

  createGstin: (data: CreateGstinRequest) =>
    apiClient.post<OrganizationGstin>("/gst/gstins", data).then((res) => res.data),

  updateGstin: (id: string, data: UpdateGstinRequest) =>
    apiClient.patch<OrganizationGstin>(`/gst/gstins/${id}`, data).then((res) => res.data),

  deleteGstin: (id: string) =>
    apiClient.delete(`/gst/gstins/${id}`).then((res) => res.data),

  getStates: () =>
    apiClient.get<IndianState[]>("/gst/states").then((res) => res.data),

  // ─── State Tax Rates ───
  listStateTaxRates: () =>
    apiClient.get<StateTaxRate[]>("/gst/state-tax-rates").then((res) => res.data),

  createStateTaxRate: (data: CreateStateTaxRateRequest) =>
    apiClient.post<StateTaxRate>("/gst/state-tax-rates", data).then((res) => res.data),

  updateStateTaxRate: (id: string, data: UpdateStateTaxRateRequest) =>
    apiClient.patch<StateTaxRate>(`/gst/state-tax-rates/${id}`, data).then((res) => res.data),

  deleteStateTaxRate: (id: string) =>
    apiClient.delete(`/gst/state-tax-rates/${id}`).then((res) => res.data),

  // ─── Collections ───
  listCollections: () =>
    apiClient.get<ShopifyCollection[]>("/gst/collections").then((res) => res.data),

  // ─── Collection Tax Overrides ───
  listCollectionOverrides: () =>
    apiClient.get<CollectionTaxOverride[]>("/gst/collection-overrides").then((res) => res.data),

  createCollectionOverride: (data: CreateCollectionOverrideRequest) =>
    apiClient.post<CollectionTaxOverride>("/gst/collection-overrides", data).then((res) => res.data),

  updateCollectionOverride: (id: string, data: UpdateCollectionOverrideRequest) =>
    apiClient.patch<CollectionTaxOverride>(`/gst/collection-overrides/${id}`, data).then((res) => res.data),

  deleteCollectionOverride: (id: string) =>
    apiClient.delete(`/gst/collection-overrides/${id}`).then((res) => res.data),

  // ─── Product Type Tax Rates ───
  listProductTypeTaxRates: () =>
    apiClient.get<ProductTypeTaxRate[]>("/gst/product-type-tax-rates").then((res) => res.data),

  createProductTypeTaxRate: (data: CreateProductTypeTaxRateRequest) =>
    apiClient.post<ProductTypeTaxRate>("/gst/product-type-tax-rates", data).then((res) => res.data),

  updateProductTypeTaxRate: (id: string, data: UpdateProductTypeTaxRateRequest) =>
    apiClient.patch<ProductTypeTaxRate>(`/gst/product-type-tax-rates/${id}`, data).then((res) => res.data),

  deleteProductTypeTaxRate: (id: string) =>
    apiClient.delete(`/gst/product-type-tax-rates/${id}`).then((res) => res.data),
};
