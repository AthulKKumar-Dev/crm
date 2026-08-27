import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Link, useBlocker, useParams } from "react-router";
import {
  Loader2,
  Pencil,
  Trash2,
  Check,
  AlertTriangle,
  Package,
  Plus,
  Calendar,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import {
  useProduct,
  useProductTypes,
  useProductVendors,
} from "~/hooks/use-product-queries";
import { useOrders } from "~/hooks/use-order-queries";
import {
  useBulkUpdateVariantsMutation,
  useGenerateVariantsMutation,
  useUpdateOptionsMutation,
  useUpdateProductMutation,
  useUpdateVariantMutation,
} from "~/hooks/use-product-mutations";
import { useCurrentRole } from "~/hooks/use-current-role";
import { useInventoryStatus, useVariantStock } from "~/hooks/use-inventory-queries";
import { useCurrentOrg } from "~/hooks/use-org-queries";
import { calcMargin, cn, formatCurrency } from "~/lib/utils";
import { formatDate, formatDateTime } from "~/lib/format-date";
import { handleMutationError } from "~/lib/handle-mutation-error";
import { toast } from "sonner";
import type {
  ProductDetail,
  ProductOption,
  ProductShopifySync,
  ProductStatus,
  ProductVariant,
  UpdateProductRequest,
  UpdateVariantRequest,
} from "~/types/api";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
  normalizeBodyHtml,
  RichTextEditor,
} from "~/components/ui/rich-text-editor";
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxValue,
  useComboboxAnchor,
} from "~/components/ui/combobox";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "~/components/ui/breadcrumb";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
} from "~/components/ui/field";
import { Switch } from "~/components/ui/switch";
import { Separator } from "~/components/ui/separator";
import { Item, ItemMedia } from "~/components/ui/item";
import { motion } from "framer-motion";
import { Badge } from "~/components/ui/badge";

export function meta() {
  return [{ title: "Product Detail | Collabo CRM" }];
}

const STATUS_CLASS: Record<string, string> = {
  ACTIVE: "bg-[#CEF17B]/30 text-[#084734]",
  DRAFT: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  ARCHIVED: "bg-orange-100 text-orange-700",
};

const STATUS_OPTIONS = ["Active", "Draft", "Archived"] as const;

const STATUS_LABEL: Record<ProductStatus, string> = {
  ACTIVE: "Active",
  DRAFT: "Draft",
  ARCHIVED: "Archived",
};

const STATUS_VALUE: Record<string, ProductStatus> = {
  Active: "ACTIVE",
  Draft: "DRAFT",
  Archived: "ARCHIVED",
};

const PRODUCT_TABS = [
  { id: "overview", label: "Overview" },
  { id: "variants", label: "Variants" },
  { id: "orders", label: "Orders" },
  { id: "channels", label: "Channels" },
  { id: "insights", label: "Insights" },
  { id: "seo", label: "SEO" },
] as const;

type ProductTab = (typeof PRODUCT_TABS)[number]["id"];

function toInputNumber(value: number | string | null | undefined): string {
  if (value == null || value === "") return "";
  const n = typeof value === "string" ? Number(value) : value;
  return Number.isFinite(n) ? String(n) : "";
}

/** "" → null (clear the field); valid number → number; garbage → undefined (skip). */
function toNullableNumber(input: string): number | null | undefined {
  if (!input.trim()) return null;
  const parsed = Number(input);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function normalizeOptions(options: ProductOption[]): ProductOption[] {
  return options.map((option, index) => ({
    name: option.name?.trim() ?? "",
    values: (option.values ?? [])
      .map((value) => value.trim())
      .filter(Boolean),
    position: index + 1,
  }));
}

function optionsEqual(a: ProductOption[], b: ProductOption[]): boolean {
  return (
    JSON.stringify(normalizeOptions(a)) === JSON.stringify(normalizeOptions(b))
  );
}

/**
 * Local editable option with a stable client-side key for React lists.
 * The `uid` never leaves the client — normalizeOptions strips it from
 * payloads and comparisons.
 */
type EditableOption = ProductOption & { uid: string };

const newUid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : // crypto.randomUUID needs a secure context; fall back for plain-HTTP dev.
    `uid-${Math.random().toString(36).slice(2)}`;

type VariantDraft = {
  price: string;
  cost: string;
  inventoryQuantity: string;
  sku: string;
};

function buildVariantDrafts(
  variants: ProductVariant[],
): Record<string, VariantDraft> {
  const drafts: Record<string, VariantDraft> = {};
  for (const variant of variants) {
    drafts[variant.id] = {
      price: toInputNumber(variant.price),
      cost: toInputNumber(variant.cost),
      inventoryQuantity: toInputNumber(variant.inventoryQuantity ?? 0),
      sku: variant.sku ?? "",
    };
  }
  return drafts;
}

function isVariantDraftDirty(
  variant: ProductVariant,
  draft?: VariantDraft,
): boolean {
  if (!draft) return false;
  return (
    draft.price !== toInputNumber(variant.price) ||
    draft.cost !== toInputNumber(variant.cost) ||
    draft.inventoryQuantity !== toInputNumber(variant.inventoryQuantity ?? 0) ||
    draft.sku !== (variant.sku ?? "")
  );
}

function tagsEqual(a: string[], b: string[]): boolean {
  return (
    JSON.stringify([...a].sort()) === JSON.stringify([...b].sort())
  );
}

type FormBaseline = {
  title: string;
  bodyHtml: string;
  productType: string;
  vendor: string;
  tags: string[];
  status: ProductStatus;
  price: string;
  compareAtPrice: string;
  cost: string;
  taxable: boolean;
  sku: string;
  barcode: string;
  trackQuantity: boolean;
  continueSelling: boolean;
  inventoryQuantity: string;
  options: ProductOption[];
  variantDrafts: Record<string, VariantDraft>;
};

function captureBaseline(p: ProductDetail): FormBaseline {
  const defaultVariant = p.variants?.[0];
  return {
    title: p.title,
    bodyHtml: normalizeBodyHtml(p.bodyHtml ?? ""),
    productType: p.productType ?? "",
    vendor: p.vendor ?? "",
    tags: [...(p.tags ?? [])],
    status: p.status,
    price: toInputNumber(defaultVariant?.price),
    compareAtPrice: toInputNumber(defaultVariant?.compareAtPrice),
    cost: toInputNumber(defaultVariant?.cost),
    taxable: defaultVariant?.taxable ?? true,
    sku: defaultVariant?.sku ?? "",
    barcode: defaultVariant?.barcode ?? "",
    trackQuantity: defaultVariant?.trackQuantity ?? true,
    continueSelling: defaultVariant?.continueSellingWhenOutOfStock ?? false,
    inventoryQuantity: toInputNumber(defaultVariant?.inventoryQuantity ?? 0),
    options: normalizeOptions(p.options ?? []),
    variantDrafts: buildVariantDrafts(p.variants ?? []),
  };
}

function areVariantDraftsDirty(
  current: Record<string, VariantDraft>,
  baseline: Record<string, VariantDraft>,
): boolean {
  for (const id of Object.keys(baseline)) {
    const draft = current[id];
    const base = baseline[id];
    if (!draft || !base) continue;
    if (
      draft.price !== base.price ||
      draft.cost !== base.cost ||
      draft.inventoryQuantity !== base.inventoryQuantity ||
      draft.sku !== base.sku
    ) {
      return true;
    }
  }
  return false;
}

function getGroupFieldDisplay(
  variants: ProductVariant[],
  drafts: Record<string, VariantDraft>,
  field: "price" | "cost" | "inventoryQuantity",
): { kind: "single"; value: string } | { kind: "range"; value: string } {
  const values = variants
    .map((variant) => {
      const raw = drafts[variant.id]?.[field] ?? "";
      const n = Number(raw);
      return Number.isFinite(n) ? n : null;
    })
    .filter((n): n is number => n != null);

  if (values.length === 0) return { kind: "single", value: "" };
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (min === max) return { kind: "single", value: String(min) };
  return { kind: "range", value: `${min} – ${max}` };
}

export default function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { isVendor } = useCurrentRole();
  const { data: product, isLoading, isError, refetch } = useProduct(id);
  const { data: org } = useCurrentOrg();
  const { data: productTypes = [] } = useProductTypes();
  const { data: vendors = [] } = useProductVendors();
  const currency = org?.currency ?? "INR";
  const [title, setTitle] = useState("");
  const [bodyHtml, setBodyHtml] = useState("");
  const [productType, setProductType] = useState("");
  const [vendor, setVendor] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [status, setStatus] = useState<ProductStatus>("ACTIVE");
  const [price, setPrice] = useState("");
  const [compareAtPrice, setCompareAtPrice] = useState("");
  const [cost, setCost] = useState("");
  const [taxable, setTaxable] = useState(true);
  const [sku, setSku] = useState("");
  const [barcode, setBarcode] = useState("");
  const [trackQuantity, setTrackQuantity] = useState(true);
  const [continueSelling, setContinueSelling] = useState(false);
  const [inventoryQuantity, setInventoryQuantity] = useState("0");
  const [activeTab, setActiveTab] = useState<ProductTab>("overview");
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);
  const [expandedVariantGroups, setExpandedVariantGroups] = useState<Set<string>>(
    new Set(),
  );
  const [options, setOptions] = useState<EditableOption[]>([]);
  const [optionValueDrafts, setOptionValueDrafts] = useState<string[]>([]);
  const [variantDrafts, setVariantDrafts] = useState<Record<string, VariantDraft>>(
    {},
  );
  const [editingVariantId, setEditingVariantId] = useState<string | null>(null);
  const [hydratedProductId, setHydratedProductId] = useState<string | null>(
    null,
  );
  const [editorReady, setEditorReady] = useState(false);
  const baselineRef = useRef<FormBaseline | null>(null);
  // All save-flow mutations run silent: handleSaveProduct owns the single
  // success/error toast for the whole save.
  const updateMutation = useUpdateProductMutation({ silent: true });
  const updateVariantMutation = useUpdateVariantMutation(id ?? "", { silent: true });
  const bulkUpdateVariantsMutation = useBulkUpdateVariantsMutation(id ?? "", { silent: true });
  const updateOptionsMutation = useUpdateOptionsMutation(id ?? "", { silent: true });
  const generateVariantsMutation = useGenerateVariantsMutation(id ?? "", { silent: true });

  const hydrateFormFromProduct = useCallback((p: ProductDetail) => {
    setTitle(p.title);
    setBodyHtml(p.bodyHtml ?? "");
    setProductType(p.productType ?? "");
    setVendor(p.vendor ?? "");
    setStatus(p.status);
    setTags(p.tags ?? []);
    const nextOptions = normalizeOptions(p.options ?? []);
    setOptions(nextOptions.map((option) => ({ ...option, uid: newUid() })));
    setOptionValueDrafts(nextOptions.map(() => ""));
    setVariantDrafts(buildVariantDrafts(p.variants ?? []));
    const defaultVariant = p.variants?.[0];
    setPrice(toInputNumber(defaultVariant?.price));
    setCompareAtPrice(toInputNumber(defaultVariant?.compareAtPrice));
    setCost(toInputNumber(defaultVariant?.cost));
    setTaxable(defaultVariant?.taxable ?? true);
    setSku(defaultVariant?.sku ?? "");
    setBarcode(defaultVariant?.barcode ?? "");
    setTrackQuantity(defaultVariant?.trackQuantity ?? true);
    setContinueSelling(defaultVariant?.continueSellingWhenOutOfStock ?? false);
    setInventoryQuantity(toInputNumber(defaultVariant?.inventoryQuantity ?? 0));
    baselineRef.current = captureBaseline(p);
  }, []);

  const handleEditorReady = useCallback((stableValue: string) => {
    setEditorReady(true);
    if (baselineRef.current) {
      baselineRef.current = {
        ...baselineRef.current,
        bodyHtml: normalizeBodyHtml(stableValue),
      };
    }
  }, []);

  useLayoutEffect(() => {
    if (!product) {
      setHydratedProductId(null);
      setEditorReady(false);
      baselineRef.current = null;
      return;
    }
    setEditorReady(false);
    hydrateFormFromProduct(product);
    setHydratedProductId(product.id);
    // Keyed on the id only: refetches of the SAME product (invalidations,
    // sync polling) must not overwrite the user's in-progress edits. Explicit
    // re-sync after a save happens in handleSaveProduct.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product?.id, hydrateFormFromProduct]);

  useEffect(() => {
    const images =
      product?.images?.length
        ? product.images
        : product?.image
          ? [product.image]
          : [];
    if (!images.length) {
      setSelectedImageId(null);
      return;
    }
    setSelectedImageId((prev) =>
      prev && images.some((img) => img.id === prev) ? prev : images[0].id,
    );
  }, [product?.id, product?.images, product?.image]);

  useEffect(() => {
    setExpandedVariantGroups(new Set());
  }, [product?.id]);

  const typeItems = useMemo(() => {
    const items = [...productTypes];
    if (productType && !items.includes(productType)) items.unshift(productType);
    return items;
  }, [productTypes, productType]);

  const vendorItems = useMemo(() => {
    const items = [...vendors];
    if (vendor && !items.includes(vendor)) items.unshift(vendor);
    return items;
  }, [vendors, vendor]);

  const tagItems = useMemo(() => {
    const set = new Set([...tags, ...(product?.tags ?? [])]);
    return Array.from(set).filter(Boolean).sort();
  }, [tags, product?.tags]);

  const variantGroups = useMemo(
    () => groupVariantsByOption1(product?.variants ?? []),
    [product?.variants],
  );
  const hasNestedVariants = (product?.variants ?? []).some((v) => v.option2);
  const option1Name = product?.options?.[0]?.name ?? "Variant";
  const option2Name = product?.options?.[1]?.name ?? "Option";

  // Recent orders that contain this product (filtered server-side via the
  // new productId param we just added).
  const { data: recentOrders } = useOrders(
    id ? { productId: id, limit: 5 } : undefined,
  );

  // useBlocker must run on every render (hooks can't follow the early returns
  // below), but the dirty flags are computed after the product-loaded guard —
  // so the blocker reads them through a ref assigned once they exist.
  const dirtyNavRef = useRef(false);
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirtyNavRef.current &&
      currentLocation.pathname !== nextLocation.pathname,
  );

  // Only take over the page when there's no cached product to show — a failed
  // background refetch on loaded (possibly dirty) data must not eat the form.
  if (isError && !product) {
    return (
      <div className="flex h-96 flex-col items-center justify-center gap-3">
        <p className="text-sm text-muted-foreground">
          Couldn't load this product. Check your connection and try again.
        </p>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          Try again
        </Button>
      </div>
    );
  }

  if (isLoading || !product) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const isManual = product.channel?.platform === "MANUAL";
  // Prefer the typed field; fall back to legacy metadata for older records.
  const metadataSync =
    (product.metadata as { shopifySync?: ProductShopifySync } | null | undefined)
      ?.shopifySync ?? null;
  const sync: ProductShopifySync | null = product.shopifySync ?? metadataSync;
  const totalStock = product.totalStock ?? 0;
  const variantsCount = product.variants?.length ?? 0;
  const ordersCount = recentOrders?.meta?.total ?? 0;
  const liveChannelsCount = product.channel ? 1 : 0;
  const primaryImage = product.images?.[0] ?? product.image;
  const galleryImages =
    product.images.length > 0
      ? product.images
      : product.image
        ? [product.image]
        : [];
  const selectedImage =
    galleryImages.find((img) => img.id === selectedImageId) ??
    galleryImages[0] ??
    null;
  const defaultVariant = product.variants?.[0] ?? null;
  const hasVariantOptions =
    (product.options?.length ?? 0) > 0 ||
    (product.variants?.length ?? 0) > 1 ||
    (product.variants ?? []).some(
      (v) =>
        !!v.option2 ||
        !!v.option3 ||
        (!!v.option1 && v.option1 !== "Default Title"),
    );
  const isSimpleProduct = !hasVariantOptions;
  const pricingMargin = calcMargin(price, cost);
  const baseline = baselineRef.current;

  const isPricingDirty =
    isSimpleProduct &&
    !!baseline &&
    (price !== baseline.price ||
      compareAtPrice !== baseline.compareAtPrice ||
      cost !== baseline.cost ||
      taxable !== baseline.taxable);

  const isInventoryDirty =
    isSimpleProduct &&
    !!baseline &&
    (sku !== baseline.sku ||
      barcode !== baseline.barcode ||
      trackQuantity !== baseline.trackQuantity ||
      continueSelling !== baseline.continueSelling ||
      inventoryQuantity !== baseline.inventoryQuantity);

  const isVariantDirty = isPricingDirty || isInventoryDirty;
  const isOptionsDirty = baseline
    ? !optionsEqual(options, baseline.options)
    : false;
  const isVariantsTableDirty = baseline
    ? areVariantDraftsDirty(variantDrafts, baseline.variantDrafts)
    : false;

  const isFormReady =
    hydratedProductId === product.id && baselineRef.current != null;
  const isProductDirty =
    isFormReady &&
    editorReady &&
    !!baseline &&
    (title !== baseline.title ||
      normalizeBodyHtml(bodyHtml) !== baseline.bodyHtml ||
      productType !== baseline.productType ||
      vendor !== baseline.vendor ||
      !tagsEqual(tags, baseline.tags) ||
      status !== baseline.status ||
      isVariantDirty ||
      isOptionsDirty ||
      isVariantsTableDirty);

  const isSaving =
    updateMutation.isPending ||
    updateVariantMutation.isPending ||
    bulkUpdateVariantsMutation.isPending ||
    updateOptionsMutation.isPending ||
    generateVariantsMutation.isPending;

  // Keep the navigation blocker in sync with the latest dirty state.
  dirtyNavRef.current = isProductDirty && !isSaving;

  function patchVariantDraft(
    variant: ProductVariant,
    patch: Partial<VariantDraft>,
  ) {
    setVariantDrafts((prev) => ({
      ...prev,
      // Variants that appeared after hydration (generated, webhook-created)
      // have no draft yet — seed from the variant itself, never from blanks.
      [variant.id]: {
        ...(prev[variant.id] ?? buildVariantDrafts([variant])[variant.id]),
        ...patch,
      },
    }));
    if (defaultVariant && variant.id === defaultVariant.id) {
      if (patch.price !== undefined) setPrice(patch.price);
      if (patch.cost !== undefined) setCost(patch.cost);
      if (patch.inventoryQuantity !== undefined) {
        setInventoryQuantity(patch.inventoryQuantity);
      }
      if (patch.sku !== undefined) setSku(patch.sku);
    }
  }

  function applyDraftToGroup(
    variants: ProductVariant[],
    patch: Partial<VariantDraft>,
  ) {
    setVariantDrafts((prev) => {
      const next = { ...prev };
      for (const variant of variants) {
        next[variant.id] = {
          ...(next[variant.id] ?? buildVariantDrafts([variant])[variant.id]),
          ...patch,
        };
      }
      return next;
    });
    if (defaultVariant && variants.some((v) => v.id === defaultVariant.id)) {
      if (patch.price !== undefined) setPrice(patch.price);
      if (patch.cost !== undefined) setCost(patch.cost);
      if (patch.inventoryQuantity !== undefined) {
        setInventoryQuantity(patch.inventoryQuantity);
      }
      if (patch.sku !== undefined) setSku(patch.sku);
    }
  }

  function handleDiscardChanges() {
    if (!product) return;
    hydrateFormFromProduct(product);
  }

  async function handleSaveProduct() {
    if (!product || !isProductDirty) return;

    const data: UpdateProductRequest = {};

    if (title !== product.title) {
      data.title = title;
    }
    if (
      normalizeBodyHtml(bodyHtml) !== normalizeBodyHtml(product.bodyHtml ?? "")
    ) {
      const normalized = normalizeBodyHtml(bodyHtml);
      data.bodyHtml = normalized ? bodyHtml : undefined;
    }
    if (productType !== (product.productType ?? "")) {
      data.productType = productType || undefined;
    }
    if (vendor !== (product.vendor ?? "")) {
      data.vendor = vendor || undefined;
    }
    if (
      JSON.stringify([...tags].sort()) !==
      JSON.stringify([...(product.tags ?? [])].sort())
    ) {
      data.tags = tags;
    }
    if (status !== product.status) {
      data.status = status;
    }

    const hasProductChanges = Object.keys(data).length > 0;

    let variantData: UpdateVariantRequest | null = null;
    if (isVariantDirty && defaultVariant) {
      variantData = {};
      const parsedPrice = Number(price);
      if (
        price.trim() &&
        Number.isFinite(parsedPrice) &&
        price !== toInputNumber(defaultVariant.price)
      ) {
        variantData.price = parsedPrice;
      }
      if (compareAtPrice !== toInputNumber(defaultVariant.compareAtPrice)) {
        const next = toNullableNumber(compareAtPrice);
        if (next !== undefined) variantData.compareAtPrice = next;
      }
      if (cost !== toInputNumber(defaultVariant.cost)) {
        const next = toNullableNumber(cost);
        if (next !== undefined) variantData.cost = next;
      }
      if (taxable !== (defaultVariant.taxable ?? true)) {
        variantData.taxable = taxable;
      }
      if (sku !== (defaultVariant.sku ?? "")) {
        variantData.sku = sku.trim() || null;
      }
      if (barcode !== (defaultVariant.barcode ?? "")) {
        variantData.barcode = barcode.trim() || null;
      }
      if (trackQuantity !== (defaultVariant.trackQuantity ?? true)) {
        variantData.trackQuantity = trackQuantity;
      }
      if (
        continueSelling !==
        (defaultVariant.continueSellingWhenOutOfStock ?? false)
      ) {
        variantData.continueSellingWhenOutOfStock = continueSelling;
      }
      if (
        inventoryQuantity !==
        toInputNumber(defaultVariant.inventoryQuantity ?? 0)
      ) {
        const parsedQty = Number.parseInt(inventoryQuantity, 10);
        // Blank/garbage input is skipped — never silently zeroed.
        if (Number.isFinite(parsedQty)) {
          variantData.inventoryQuantity = parsedQty;
        }
      }
      if (Object.keys(variantData).length === 0) {
        variantData = null;
      }
    }

    try {
      if (hasProductChanges) {
        await updateMutation.mutateAsync({ id: product.id, data });
      }
      if (variantData && defaultVariant) {
        await updateVariantMutation.mutateAsync({
          variantId: defaultVariant.id,
          data: variantData,
        });
      }

      const variantUpdates: Array<UpdateVariantRequest & { variantId: string }> =
        [];
      for (const variant of product.variants ?? []) {
        // On simple products, default variant price/cost/stock are saved via Overview.
        if (
          isSimpleProduct &&
          defaultVariant &&
          variant.id === defaultVariant.id
        ) {
          continue;
        }
        const draft = variantDrafts[variant.id];
        if (!isVariantDraftDirty(variant, draft) || !draft) continue;

        const update: UpdateVariantRequest & { variantId: string } = {
          variantId: variant.id,
        };
        if (draft.price !== toInputNumber(variant.price)) {
          const parsedPrice = Number(draft.price);
          if (draft.price.trim() && Number.isFinite(parsedPrice)) {
            update.price = parsedPrice;
          }
        }
        if (draft.cost !== toInputNumber(variant.cost)) {
          const next = toNullableNumber(draft.cost);
          if (next !== undefined) update.cost = next;
        }
        if (
          draft.inventoryQuantity !==
          toInputNumber(variant.inventoryQuantity ?? 0)
        ) {
          const parsedQty = Number.parseInt(draft.inventoryQuantity, 10);
          if (Number.isFinite(parsedQty)) {
            update.inventoryQuantity = parsedQty;
          }
        }
        if (draft.sku !== (variant.sku ?? "")) {
          update.sku = draft.sku.trim() || null;
        }
        if (Object.keys(update).length > 1) {
          variantUpdates.push(update);
        }
      }
      if (variantUpdates.length > 0) {
        await bulkUpdateVariantsMutation.mutateAsync(variantUpdates);
      }

      if (isOptionsDirty) {
        const normalized = normalizeOptions(options);
        const canGenerate =
          normalized.length > 0 &&
          normalized.every((option) => option.name && option.values.length > 0);

        await updateOptionsMutation.mutateAsync(normalized);

        if (canGenerate) {
          await generateVariantsMutation.mutateAsync();
        }
      }

      // Re-sync the form from the saved product so server-side normalization
      // (and newly generated variants) land in local state deterministically.
      const { data: refreshed } = await refetch();
      if (refreshed) hydrateFormFromProduct(refreshed);

      toast.success("Product saved.");
    } catch (error) {
      handleMutationError(
        error,
        "Save failed — some changes may not have been applied. Please review and save again.",
      );
    }
  }

  function handleAddOption() {
    if (options.length >= 3) return;
    setOptions((prev) => [
      ...prev,
      { name: "", values: [], position: prev.length + 1, uid: newUid() },
    ]);
    setOptionValueDrafts((prev) => [...prev, ""]);
  }

  function handleRemoveOption(index: number) {
    setOptions((prev) =>
      prev
        .filter((_, i) => i !== index)
        .map((option, i) => ({ ...option, position: i + 1 })),
    );
    setOptionValueDrafts((prev) => prev.filter((_, i) => i !== index));
  }

  function handleOptionNameChange(index: number, name: string) {
    setOptions((prev) =>
      prev.map((option, i) => (i === index ? { ...option, name } : option)),
    );
  }

  function handleRemoveOptionValue(optionIndex: number, valueIndex: number) {
    setOptions((prev) =>
      prev.map((option, i) =>
        i === optionIndex
          ? {
            ...option,
            values: option.values.filter((_, vi) => vi !== valueIndex),
          }
          : option,
      ),
    );
  }

  function handleAddOptionValue(optionIndex: number) {
    const draft = optionValueDrafts[optionIndex]?.trim();
    if (!draft) return;
    setOptions((prev) =>
      prev.map((option, i) => {
        if (i !== optionIndex) return option;
        if (option.values.includes(draft)) return option;
        return { ...option, values: [...option.values, draft] };
      }),
    );
    setOptionValueDrafts((prev) =>
      prev.map((value, i) => (i === optionIndex ? "" : value)),
    );
  }

  function toggleVariantGroup(key: string) {
    setExpandedVariantGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink asChild>
                  <Link to="/products">Products</Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage className="max-w-xs truncate sm:max-w-md">
                  {product.title}
                </BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

          <div className="flex min-w-0 items-start gap-4">
            {primaryImage && (
              <Item variant="outline" className="w-fit shrink-0 border-0 p-0">
                <ItemMedia variant="image" className="size-16 rounded-lg sm:size-20">
                  <img
                    src={primaryImage.src}
                    alt={primaryImage.alt ?? product.title}
                  />
                </ItemMedia>
              </Item>
            )}

            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-[24px] font-bold text-gray-900 dark:text-gray-100">
                  {product.title}
                </h1>
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[10px] font-medium",
                    STATUS_CLASS[product.status] ?? "bg-gray-100 text-gray-600",
                  )}
                >
                  {product.status}
                </span>
                {isManual ? (
                  <span className="inline-flex items-center rounded-full bg-blue-50 dark:bg-blue-900/30 px-2 py-0.5 text-[10px] font-medium text-blue-700 dark:text-blue-300">
                    CRM (Manual)
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-green-50 dark:bg-green-900/30 px-2 py-0.5 text-[10px] font-medium text-green-700 dark:text-green-300">
                    <Check className="size-3" />
                    Synced from {product.channel?.platform}
                  </span>
                )}
                {product.status === "DRAFT" && product.publishedAt && new Date(product.publishedAt) > new Date() && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 dark:bg-blue-900/30 px-2 py-0.5 text-[10px] font-medium text-blue-700 dark:text-blue-300">
                    <Calendar className="size-3" />
                    Publishes on {formatDateTime(product.publishedAt)}
                  </span>
                )}
              </div>

              <p className="text-xs text-muted-foreground">
                {product.vendor && <>Vendor: {product.vendor} • </>}
                {product.productType && <>Type: {product.productType} • </>}
                {totalStock} in stock
              </p>
            </div>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {isProductDirty && (
            <>
              <Button
                type="button"
                variant="outline"
                size="action"
                onClick={handleDiscardChanges}
                disabled={isSaving}
              >
                Discard
              </Button>
              <Button
                type="button"
                variant="brand"
                size="action"
                onClick={handleSaveProduct}
                disabled={isSaving}
              >
                {isSaving && (
                  <Loader2 className="size-3.5 animate-spin" />
                )}
                Save
              </Button>
            </>
          )}
        </div>
      </div>

      <nav
        role="tablist"
        aria-label="Product sections"
        className="flex w-full max-w-full md:w-fit items-center gap-0.5 overflow-x-auto rounded-full bg-foreground/90 dark:bg-gray-900 px-2 py-1.5 shadow-sm ring-1 ring-black/[0.06] dark:ring-gray-700"
      >
        {PRODUCT_TABS.map(({ id, label }) => {
          const isActive = activeTab === id;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              id={`product-tab-${id}`}
              aria-selected={isActive}
              aria-controls="product-tabpanel"
              onClick={() => setActiveTab(id)}
              className={cn(
                "relative flex shrink-0 items-center gap-1.5 rounded-full px-4 py-1.5 text-sm select-none",
                isActive
                  ? "font-semibold text-gray-900 dark:text-gray-900"
                  : "font-medium text-background hover:text-background/70 dark:text-gray-400 dark:hover:text-gray-200",
              )}
            >
              {isActive && (
                <motion.span
                  layoutId="product-tab-pill"
                  initial={false}
                  className="absolute inset-0 rounded-full bg-[#CEF17B]"
                  transition={{
                    type: "spring",
                    stiffness: 380,
                    damping: 32,
                    mass: 1,
                  }}
                />
              )}
              <span className="relative z-10">{label}</span>
            </button>
          );
        })}
      </nav>
      {/* Left side */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div
          className="space-y-6 lg:col-span-2"
          role="tabpanel"
          id="product-tabpanel"
          aria-labelledby={`product-tab-${activeTab}`}
        >
          {activeTab === "overview" && (
            <>
              <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-border dark:bg-gray-900">
                <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
                  <div>
                    <h2 className="text-[14px] font-semibold text-gray-900 dark:text-gray-100">
                      Product Images
                    </h2>
                    <p className="mt-0.5 text-[12px] text-muted-foreground">
                      Photos and video shown across your channels.
                    </p>
                  </div>
                </div>

                <div className="p-4">
                  {galleryImages.length > 0 ? (
                    <div className="flex items-start gap-3">
                      <div className="relative aspect-square min-w-0 flex-[4] overflow-hidden rounded-2xl bg-[#f5f5f7] dark:bg-gray-800">
                        <span className="absolute left-4 top-4 z-10 rounded-full bg-white px-3 py-1 text-xs font-medium text-gray-900 shadow-sm dark:bg-gray-900 dark:text-gray-100">
                          {selectedImage?.alt ?? "Front view"}
                        </span>
                        <div className="flex h-full w-full items-center justify-center">
                          <img
                            src={selectedImage?.src}
                            alt={selectedImage?.alt ?? product.title}
                            className="max-h-full max-w-full object-contain"
                          />
                        </div>
                      </div>

                      <div className="flex min-w-0 flex-[1] flex-col gap-3">
                        {galleryImages.map((img) => {
                          const isSelected = img.id === selectedImageId;
                          return (
                            <button
                              key={img.id}
                              type="button"
                              onClick={() => setSelectedImageId(img.id)}
                              className={cn(
                                "aspect-square w-full overflow-hidden rounded-xl bg-[#f5f5f7] p-2 dark:bg-gray-800",
                                isSelected
                                  ? "ring-2 ring-[#CEF17B] ring-offset-2 ring-offset-white dark:ring-offset-gray-900"
                                  : "ring-1 ring-transparent",
                              )}
                            >
                              <img
                                src={img.src}
                                alt={img.alt ?? product.title}
                                className="h-full w-full rounded-lg object-cover"
                              />
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <div className="flex aspect-square items-center justify-center rounded-2xl bg-[#f5f5f7] text-sm text-muted-foreground dark:bg-gray-800">
                      No product images
                    </div>
                  )}
                </div>
              </div>

              <Section title="Basic Information">
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <Label
                      htmlFor="title"
                      className="text-[12px] font-medium text-muted-foreground"
                    >
                      Title
                    </Label>
                    <Input
                      id="title"
                      placeholder="Title"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-[12px] font-medium text-muted-foreground">
                      Description
                    </Label>
                    <RichTextEditor
                      key={product.id}
                      value={bodyHtml}
                      onChange={setBodyHtml}
                      onEditorReady={handleEditorReady}
                      placeholder="Describe this product…"
                    />
                  </div>

                </div>
              </Section>

              {isSimpleProduct && (
                <Section title="Pricing">
                  <div className="space-y-4">
                    <div className="space-y-3">
                      <div className="flex flex-row items-center gap-2">
                        <div className="flex flex-col flex-1 gap-1">
                          <Label
                            htmlFor="product-price"
                            className="text-[12px] font-medium text-muted-foreground"
                          >
                            Price
                          </Label>
                          <Input
                            id="product-price"
                            type="number"
                            inputMode="decimal"
                            min="0"
                            step="0.01"
                            placeholder="0.00"
                            value={price}
                            onChange={(e) => {
                              const next = e.target.value;
                              setPrice(next);
                              if (defaultVariant) {
                                patchVariantDraft(defaultVariant, { price: next });
                              }
                            }}
                            disabled={!defaultVariant}
                          />
                        </div>
                        <div className="flex flex-col flex-1 gap-1">
                          <Label
                            htmlFor="product-compare-at-price"
                            className="text-[12px] font-medium text-muted-foreground"
                          >
                            Compare at price
                          </Label>
                          <Input
                            id="product-compare-at-price"
                            type="number"
                            inputMode="decimal"
                            min="0"
                            step="0.01"
                            placeholder="0.00"
                            value={compareAtPrice}
                            onChange={(e) => setCompareAtPrice(e.target.value)}
                            disabled={!defaultVariant}
                          />
                        </div>
                        <div className="flex flex-col flex-1 gap-1">
                          <Label
                            htmlFor="product-cost"
                            className="text-[12px] font-medium text-muted-foreground"
                          >
                            Cost per item
                          </Label>
                          <Input
                            id="product-cost"
                            type="number"
                            inputMode="decimal"
                            min="0"
                            step="0.01"
                            placeholder="0.00"
                            value={cost}
                            onChange={(e) => {
                              const next = e.target.value;
                              setCost(next);
                              if (defaultVariant) {
                                patchVariantDraft(defaultVariant, { cost: next });
                              }
                            }}
                            disabled={!defaultVariant}
                          />
                        </div>
                      </div>
                      <div className="flex flex-row gap-6 items-center justify-between rounded-lg">
                        <div className="flex flex-col flex-1 gap-1 bg-[#f5f5f5] p-2 rounded-lg dark:bg-gray-800/60">
                          <Label className="text-[12px] font-medium text-muted-foreground">
                            Margin
                          </Label>
                          <span className="text-[12px] font-medium text-muted-foreground">
                            {pricingMargin
                              ? `${pricingMargin.marginPct.toFixed(0)}%`
                              : "—"}
                          </span>
                        </div>
                        <div className="flex flex-col flex-1 gap-1 bg-[#f5f5f5] p-2 rounded-lg dark:bg-gray-800/60">
                          <Label className="text-[12px] font-medium text-muted-foreground">
                            Profit per item
                          </Label>
                          <span className="text-[12px] font-medium text-muted-foreground">
                            {pricingMargin
                              ? formatCurrency(pricingMargin.profit, currency)
                              : "—"}
                          </span>
                        </div>
                      </div>
                      <Separator />
                      <Field orientation="horizontal">
                        <FieldContent>
                          <FieldLabel className="text-[13px]" htmlFor="product-taxable">
                            Charge tax on this product
                          </FieldLabel>
                          <FieldDescription className="text-[10px]">
                            Applies your store&apos;s default tax rate.
                          </FieldDescription>
                        </FieldContent>
                        <Switch
                          id="product-taxable"
                          checked={taxable}
                          onCheckedChange={setTaxable}
                          disabled={!defaultVariant}
                        />
                      </Field>
                    </div>
                  </div>
                </Section>
              )}

              {isSimpleProduct && (
                <Section title="Inventory">
                  <div className="space-y-4">
                    <div className="space-y-3">
                      <div className="flex flex-row justify-between gap-2">
                        <div className="flex flex-col flex-1 gap-1">
                          <Label
                            htmlFor="product-sku"
                            className="text-[12px] font-medium text-muted-foreground"
                          >
                            SKU
                          </Label>
                          <Input
                            id="product-sku"
                            placeholder="SKU"
                            value={sku}
                            onChange={(e) => {
                              const next = e.target.value;
                              setSku(next);
                              if (defaultVariant) {
                                patchVariantDraft(defaultVariant, { sku: next });
                              }
                            }}
                            disabled={!defaultVariant}
                          />
                        </div>
                        <div className="flex flex-col flex-1 gap-1">
                          <Label
                            htmlFor="product-barcode"
                            className="text-[12px] font-medium text-muted-foreground"
                          >
                            Barcode
                          </Label>
                          <Input
                            id="product-barcode"
                            placeholder="Barcode"
                            value={barcode}
                            onChange={(e) => setBarcode(e.target.value)}
                            disabled={!defaultVariant}
                          />
                        </div>
                      </div>

                      <Field orientation="horizontal">
                        <FieldContent>
                          <FieldLabel className="text-[13px]" htmlFor="product-track-quantity">
                            Track quantity
                          </FieldLabel>
                        </FieldContent>
                        <Switch
                          id="product-track-quantity"
                          checked={trackQuantity}
                          onCheckedChange={setTrackQuantity}
                          disabled={!defaultVariant}
                        />
                      </Field>

                      <Field orientation="horizontal">
                        <FieldContent>
                          <FieldLabel
                            className="text-[13px]"
                            htmlFor="product-continue-selling"
                          >
                            Continue selling when out of stock
                          </FieldLabel>
                        </FieldContent>
                        <Switch
                          id="product-continue-selling"
                          checked={continueSelling}
                          onCheckedChange={setContinueSelling}
                          disabled={!defaultVariant}
                        />
                      </Field>

                      <div className="flex flex-row gap-2 items-center justify-between">
                        <div className="flex flex-col flex-1 gap-1 bg-[#f5f5f5] p-2 rounded-lg dark:bg-gray-800/60">
                          <Label
                            htmlFor="product-inventory-available"
                            className="text-[12px] font-medium text-muted-foreground"
                          >
                            Available inventory
                          </Label>
                          {trackQuantity ? (
                            <Input
                              id="product-inventory-available"
                              type="number"
                              inputMode="numeric"
                              min="0"
                              step="1"
                              className="h-8 bg-white dark:bg-gray-900"
                              value={inventoryQuantity}
                              onChange={(e) => {
                                const next = e.target.value;
                                setInventoryQuantity(next);
                                if (defaultVariant) {
                                  patchVariantDraft(defaultVariant, {
                                    inventoryQuantity: next,
                                  });
                                }
                              }}
                              disabled={!defaultVariant}
                            />
                          ) : (
                            <span className="text-[12px] font-medium text-muted-foreground">
                              Not tracked
                            </span>
                          )}
                        </div>
                        <div className="flex flex-col flex-1 gap-1 bg-[#f5f5f5] p-2 rounded-lg dark:bg-gray-800/60">
                          <Label className="text-[12px] font-medium text-muted-foreground">
                            Committed
                          </Label>
                          <span className="text-[12px] font-medium text-muted-foreground">
                            —
                          </span>
                        </div>
                        <div className="flex flex-col flex-1 gap-1 bg-[#f5f5f5] p-2 rounded-lg dark:bg-gray-800/60">
                          <Label className="text-[12px] font-medium text-muted-foreground">
                            On hand
                          </Label>
                          <span className="text-[12px] font-medium text-muted-foreground">
                            {trackQuantity ? inventoryQuantity || "0" : "—"}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </Section>
              )}

            </>
          )}

          {activeTab === "variants" && (
            <>
              <Section title="Options">
                <div className="space-y-4">
                  {options.length === 0 ? (
                    <p className="text-[12px] text-muted-foreground">
                      No options yet. Add Size, Color, or Material to create variants.
                    </p>
                  ) : (
                    <div className="flex flex-col gap-4">
                      {options.map((option, optionIndex) => (
                        <div key={option.uid} className="space-y-2">
                          <div className="flex items-center gap-2">
                            <Input
                              value={option.name}
                              onChange={(e) =>
                                handleOptionNameChange(optionIndex, e.target.value)
                              }
                              placeholder="Option name (e.g. Size)"
                              className="h-8 max-w-xs text-[12px]"
                            />
                            <button
                              type="button"
                              onClick={() => handleRemoveOption(optionIndex)}
                              className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-red-600"
                              aria-label="Remove option"
                              title="Remove option"
                            >
                              <Trash2 className="size-3.5" />
                            </button>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            {option.values.map((value, valueIndex) => (
                              <Badge
                                key={`${value}-${valueIndex}`}
                                className="gap-1 text-[12px]"
                                variant="outline"
                              >
                                {value}
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleRemoveOptionValue(optionIndex, valueIndex)
                                  }
                                  className="ml-0.5 text-muted-foreground hover:text-foreground"
                                  aria-label={`Remove ${value}`}
                                >
                                  ×
                                </button>
                              </Badge>
                            ))}
                            <Input
                              value={optionValueDrafts[optionIndex] ?? ""}
                              onChange={(e) =>
                                setOptionValueDrafts((prev) =>
                                  prev.map((draft, i) =>
                                    i === optionIndex ? e.target.value : draft,
                                  ),
                                )
                              }
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  handleAddOptionValue(optionIndex);
                                }
                              }}
                              placeholder="Add value"
                              className="h-7 w-28 text-[12px]"
                            />
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-7 px-2 text-[11px]"
                              onClick={() => handleAddOptionValue(optionIndex)}
                              disabled={!optionValueDrafts[optionIndex]?.trim()}
                            >
                              Add
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex flex-wrap items-center gap-2">
                    {options.length < 3 && (
                      <Button type="button" variant="outline" onClick={handleAddOption}>
                        <Plus className="size-4" />
                        Add option
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      onClick={async () => {
                        try {
                          const result =
                            await generateVariantsMutation.mutateAsync();
                          toast.success(
                            `Generated ${result.created} new variant${result.created === 1 ? "" : "s"}.`,
                          );
                        } catch (error) {
                          handleMutationError(
                            error,
                            "Failed to generate variants.",
                          );
                        }
                      }}
                      disabled={
                        generateVariantsMutation.isPending ||
                        options.length === 0 ||
                        options.some(
                          (option) => !option.name.trim() || option.values.length === 0,
                        ) ||
                        isOptionsDirty
                      }
                      title={
                        isOptionsDirty
                          ? "Save options first, then generate variants"
                          : "Create missing variant combinations from options"
                      }
                    >
                      {generateVariantsMutation.isPending ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Plus className="size-4" />
                      )}
                      Generate variants
                    </Button>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Saving options also generates any missing variants for the table.
                  </p>
                </div>
              </Section>


              <Section title={`Variants (${product.variants.length})`}>
                <div className="overflow-x-auto -mx-5">
                  <table className="w-full text-xs">
                    <thead className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      <tr className="border-b">
                        <th className="px-5 py-2 text-left font-medium">
                          {hasNestedVariants ? option1Name : "Title"}
                        </th>
                        <th className="px-5 py-2 text-left font-medium">SKU</th>
                        <th className="px-5 py-2 text-right font-medium">Price</th>
                        <th className="px-5 py-2 text-right font-medium">Stock</th>
                        <th className="px-5 py-2 text-right font-medium">Edit</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {hasNestedVariants
                        ? variantGroups.map((group) => {
                          const isOpen = expandedVariantGroups.has(group.key);
                          const priceDisplay = getGroupFieldDisplay(
                            group.variants,
                            variantDrafts,
                            "price",
                          );
                          const stockDisplay = getGroupFieldDisplay(
                            group.variants.filter((v) => v.trackQuantity !== false),
                            variantDrafts,
                            "inventoryQuantity",
                          );

                          return (
                            <Fragment key={group.key}>
                              <tr className="bg-muted/30 hover:bg-muted/50">
                                <td className="px-5 py-3">
                                  <button
                                    type="button"
                                    className="inline-flex items-center gap-2 text-left"
                                    onClick={() => toggleVariantGroup(group.key)}
                                  >
                                    {isOpen ? (
                                      <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
                                    ) : (
                                      <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                                    )}
                                    <span className="font-semibold text-gray-900 dark:text-gray-100">
                                      {group.key}
                                    </span>
                                    <span className="text-[10px] font-normal text-muted-foreground">
                                      {group.variants.length}{" "}
                                      {option2Name.toLowerCase()}
                                      {group.variants.length === 1 ? "" : "s"}
                                    </span>
                                  </button>
                                </td>
                                <td className="px-5 py-3 text-muted-foreground">—</td>
                                <td className="px-5 py-3 text-right">
                                  <VariantGroupBulkInput
                                    display={priceDisplay}
                                    ariaLabel={`Set price for all ${group.key} variants`}
                                    onApply={(value) =>
                                      applyDraftToGroup(group.variants, {
                                        price: value,
                                      })
                                    }
                                  />
                                </td>
                                <td className="px-5 py-3 text-right">
                                  {group.variants.every(
                                    (v) => v.trackQuantity === false,
                                  ) ? (
                                    <span className="text-[10px] italic text-muted-foreground">
                                      Untracked
                                    </span>
                                  ) : (
                                    <VariantGroupBulkInput
                                      display={stockDisplay}
                                      integer
                                      ariaLabel={`Set stock for all ${group.key} variants`}
                                      onApply={(value) =>
                                        applyDraftToGroup(
                                          group.variants.filter(
                                            (v) => v.trackQuantity !== false,
                                          ),
                                          { inventoryQuantity: value },
                                        )
                                      }
                                    />
                                  )}
                                </td>
                                <td className="px-5 py-3" />
                              </tr>
                              {isOpen &&
                                group.variants.map((v) => (
                                  <VariantTableRow
                                    key={v.id}
                                    variant={v}
                                    draft={
                                      variantDrafts[v.id] ?? {
                                        price: toInputNumber(v.price),
                                        cost: toInputNumber(v.cost),
                                        inventoryQuantity: toInputNumber(
                                          v.inventoryQuantity ?? 0,
                                        ),
                                        sku: v.sku ?? "",
                                      }
                                    }
                                    onDraftChange={(patch) =>
                                      patchVariantDraft(v, patch)
                                    }
                                    onEdit={() => setEditingVariantId(v.id)}
                                    productTitle={product.title}
                                    indented
                                    titleLabel={v.option2 ?? v.title}
                                    subtitle={
                                      v.option3 && v.option3 !== "Default Title"
                                        ? v.option3
                                        : null
                                    }
                                  />
                                ))}
                            </Fragment>
                          );
                        })
                        : product.variants.map((v) => (
                          <VariantTableRow
                            key={v.id}
                            variant={v}
                            draft={
                              variantDrafts[v.id] ?? {
                                price: toInputNumber(v.price),
                                cost: toInputNumber(v.cost),
                                inventoryQuantity: toInputNumber(
                                  v.inventoryQuantity ?? 0,
                                ),
                                sku: v.sku ?? "",
                              }
                            }
                            onDraftChange={(patch) =>
                              patchVariantDraft(v, patch)
                            }
                            onEdit={() => setEditingVariantId(v.id)}
                            productTitle={product.title}
                          />
                        ))}
                    </tbody>
                  </table>
                </div>
              </Section>

              <VariantEditDialog
                variant={
                  editingVariantId
                    ? (product.variants.find((v) => v.id === editingVariantId) ??
                      null)
                    : null
                }
                draft={
                  editingVariantId
                    ? variantDrafts[editingVariantId] ?? null
                    : null
                }
                currency={currency}
                open={!!editingVariantId}
                onOpenChange={(open) => {
                  if (!open) setEditingVariantId(null);
                }}
                onSaveDraft={(patch) => {
                  const editingVariant = editingVariantId
                    ? product.variants.find((v) => v.id === editingVariantId)
                    : null;
                  if (editingVariant) {
                    patchVariantDraft(editingVariant, patch);
                  }
                }}
                onSave={async (data) => {
                  if (!editingVariantId) return;
                  try {
                    await updateVariantMutation.mutateAsync({
                      variantId: editingVariantId,
                      data,
                    });
                    // The dialog persists fields the Overview mirrors also
                    // hold (compare-at, barcode, switches). Sync them so the
                    // dirty check doesn't resurrect stale values on the next
                    // page-level Save.
                    if (defaultVariant && editingVariantId === defaultVariant.id) {
                      if (data.compareAtPrice !== undefined) {
                        setCompareAtPrice(toInputNumber(data.compareAtPrice));
                      }
                      if (data.barcode !== undefined) {
                        setBarcode(data.barcode ?? "");
                      }
                      if (data.taxable !== undefined) setTaxable(data.taxable);
                      if (data.trackQuantity !== undefined) {
                        setTrackQuantity(data.trackQuantity);
                      }
                      if (data.continueSellingWhenOutOfStock !== undefined) {
                        setContinueSelling(data.continueSellingWhenOutOfStock);
                      }
                    }
                    toast.success("Variant updated.");
                    setEditingVariantId(null);
                  } catch (error) {
                    handleMutationError(error, "Failed to update variant.");
                  }
                }}
                isSaving={updateVariantMutation.isPending}
              />
            </>
          )}

          {activeTab === "orders" && (
            <Section
              title={`Recent sales${recentOrders?.meta?.total ? ` (${recentOrders.meta.total} total)` : ""
                }`}
            >
              {recentOrders?.data?.length ? (
                <ul className="divide-y">
                  {recentOrders.data.map((o) => (
                    <li key={o.id}>
                      <Link
                        to={`/orders/${o.id}`}
                        className="-mx-5 flex items-center justify-between gap-3 px-5 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-800/50"
                      >
                        <div>
                          <p className="text-xs font-medium text-gray-900 dark:text-gray-100">
                            {o.name}
                          </p>
                          <p className="text-[10px] text-muted-foreground">
                            {o.customer
                              ? `${o.customer.firstName ?? ""} ${o.customer.lastName ?? ""}`.trim() || "Guest"
                              : "Guest"}{" "}
                            • {formatDate(o.createdAt)}
                          </p>
                        </div>
                        <p className="text-xs tabular-nums font-semibold">
                          {formatCurrency(o.totalPrice, currency)}
                        </p>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-muted-foreground italic">
                  No orders include this product yet.
                </p>
              )}
            </Section>
          )}

          {activeTab === "channels" && (
            <>
              <Section title="Channel">
                <dl className="space-y-1.5 text-xs">
                  <DescRow label="Channel name" value={product.channel?.name ?? "—"} />
                  <DescRow label="Platform" value={product.channel?.platform ?? "—"} />
                  <DescRow label="Total stock" value={String(totalStock)} icon={<Package className="size-3" />} />
                  <DescRow label="Variants" value={String(product.variants.length)} />
                </dl>
              </Section>
              {sync && (
                <Section title="Shopify Sync">
                  <ShopifySyncCard sync={sync} />
                </Section>
              )}
            </>
          )}

          {activeTab === "insights" && (
            <Section title="Insights">
              <p className="text-xs text-muted-foreground italic">
                Product insights and analytics will appear here.
              </p>
            </Section>
          )}

          {activeTab === "seo" && (
            <Section title="SEO">
              <dl className="space-y-1.5 text-xs">
                <DescRow label="Product title" value={product.title} />
                <DescRow
                  label="Tags"
                  value={product.tags?.length ? product.tags.join(", ") : "—"}
                />
              </dl>
              <p className="mt-3 text-xs text-muted-foreground italic">
                Advanced SEO fields coming soon.
              </p>
            </Section>
          )}
        </div>
        {/* Right side */}
        <div className="space-y-6 lg:sticky lg:top-6 lg:self-start">
          {/* Stock summary */}

          <Section title="Status">
            <div className="space-y-3">
              <div className="flex flex-col gap-5 items-start  justify-between">
                <Combobox
                  items={[...STATUS_OPTIONS]}
                  value={STATUS_LABEL[status]}
                  onValueChange={(label) => {
                    const next = STATUS_VALUE[label ?? ""];
                    if (next) setStatus(next);
                  }}
                >
                  <ComboboxInput
                    placeholder="Select status"
                    className="w-full"
                  />
                  <ComboboxContent>
                    <ComboboxEmpty>No items found.</ComboboxEmpty>
                    <ComboboxList>
                      {(item) => (
                        <ComboboxItem key={item} value={item}>
                          {item}
                        </ComboboxItem>
                      )}
                    </ComboboxList>
                  </ComboboxContent>
                </Combobox>

              </div>
              <Separator className="my-3" />
              <div className="flex gap-2 items-start justify-between">
                <p className="text-[12px]">Published on: </p>
                <span className="font-medium text-[12px]">
                  {formatDate(product.publishedAt ?? product.createdAt)}
                </span>
              </div>
              <div className="flex gap-2 items-start justify-between">
                <p className="text-[12px]">Last updated: </p>
                <span className="font-medium text-[12px]">
                  {formatDate(product.updatedAt ?? product.createdAt)}
                </span>
              </div>
            </div>
          </Section>


          <Section title="Product Organization">
            <dl className="space-y-3 text-xs">
              <ComboboxField
                label="Product Type"
                items={typeItems}
                value={productType}
                onChange={setProductType}
                placeholder="Select product type"
              />
              <ComboboxField
                label="Vendor"
                items={vendorItems}
                value={vendor}
                onChange={setVendor}
                placeholder="Select vendor"
                disabled={isVendor}
              />
              <TagsComboboxField
                label="Tags"
                items={tagItems}
                value={tags}
                onChange={setTags}
              />

            </dl>
          </Section>


          <Section title="At Glance">
            <dl className="space-y-1.5 text-xs flex flex-col gap-[6px]">
              <DescRow label="Orders" value={String(ordersCount)} />
              <DescRow label="Variants" value={String(variantsCount)} />
              <DescRow label="In stock" value={String(totalStock)} />
              <DescRow
                label="Live channels"
                value={
                  liveChannelsCount > 0
                    ? `${liveChannelsCount}${product.channel?.name ? ` (${product.channel.name})` : ""}`
                    : "0"
                }
              />
            </dl>
          </Section>

        </div>
      </div>

      <Dialog
        open={blocker.state === "blocked"}
        onOpenChange={(open) => {
          if (!open) blocker.reset?.();
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Discard unsaved changes?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            You have unsaved changes on this product. If you leave now they
            will be lost.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => blocker.reset?.()}>
              Keep editing
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => blocker.proceed?.()}
            >
              Discard and leave
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div >
  );
}

function ShopifySyncCard({
  sync,
}: {
  sync: Pick<ProductShopifySync, "status" | "shopifyProductId" | "error">;
}) {
  if (sync.status === "SYNCED") {
    return (
      <div className="space-y-2 text-xs">
        <span className="inline-flex items-center gap-1 rounded-full bg-green-50 dark:bg-green-900/30 px-2 py-0.5 text-[10px] font-medium text-green-700 dark:text-green-300">
          <Check className="size-3" />
          Synced
        </span>
        {sync.shopifyProductId && (
          <p className="text-[10px] text-muted-foreground">
            Shopify ID: <span className="font-mono">{sync.shopifyProductId}</span>
          </p>
        )}
      </div>
    );
  }
  if (sync.status === "PENDING") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 dark:bg-blue-900/30 px-2 py-0.5 text-[10px] font-medium text-blue-700 dark:text-blue-300">
        <Loader2 className="size-3 animate-spin" />
        Syncing
      </span>
    );
  }
  if (sync.status === "OUT_OF_SYNC") {
    return (
      <div className="space-y-2 text-xs">
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 dark:bg-amber-900/30 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-300">
          <AlertTriangle className="size-3" />
          Out of sync
        </span>
        <p className="text-[10px] text-muted-foreground">
          Local edits haven't been pushed yet. Click <em>Sync to Shopify</em> when ready.
        </p>
      </div>
    );
  }
  return (
    <div className="space-y-2 text-xs">
      <span className="inline-flex items-center gap-1 rounded-full bg-red-50 dark:bg-red-900/30 px-2 py-0.5 text-[10px] font-medium text-red-700 dark:text-red-300">
        <AlertTriangle className="size-3" />
        Sync failed
      </span>
      {sync.error && <p className="text-[10px] text-red-700 dark:text-red-400">{sync.error}</p>}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[6px] bg-white dark:bg-gray-900 shadow-sm ring-1 ring-border">
      <h2 className="border-b px-5 py-3 text-[14px] font-semibold  tracking-wider text-muted-foreground">
        {title}
      </h2>
      <div className="px-5 py-4">{children}</div>
    </section>
  );
}

function groupVariantsByOption1(variants: ProductVariant[]) {
  const map = new Map<string, ProductVariant[]>();

  for (const v of variants) {
    const key =
      !v.option1 || v.option1 === "Default Title" ? "Default" : v.option1;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(v);
  }

  return Array.from(map.entries())
    .map(([key, items]) => ({
      key,
      variants: items.sort((a, b) => a.position - b.position),
    }))
    .sort((a, b) => a.variants[0].position - b.variants[0].position);
}

function isDefaultVariantLabel(value?: string | null): boolean {
  return !value || value === "Default Title";
}

function formatVariantTitle(
  variant: ProductVariant,
  productTitle?: string,
  titleLabel?: string,
): string {
  if (titleLabel && !isDefaultVariantLabel(titleLabel)) return titleLabel;
  if (
    isDefaultVariantLabel(variant.title) ||
    isDefaultVariantLabel(variant.option1)
  ) {
    return productTitle?.trim() || "Default";
  }
  return variant.title;
}

function formatVariantOptionLabel(variant: ProductVariant): string | null {
  const parts = [variant.option1, variant.option2, variant.option3].filter(
    (value): value is string => !!value && value !== "Default Title",
  );
  return parts.length > 0 ? parts.join(" / ") : null;
}

function VariantGroupBulkInput({
  display,
  onApply,
  integer = false,
  ariaLabel,
}: {
  display: { kind: "single"; value: string } | { kind: "range"; value: string };
  onApply: (value: string) => void;
  integer?: boolean;
  ariaLabel: string;
}) {
  const [focused, setFocused] = useState(false);
  const [editValue, setEditValue] = useState("");

  useEffect(() => {
    if (!focused) {
      setEditValue(display.kind === "single" ? display.value : "");
    }
  }, [display, focused]);

  function commit() {
    const next = editValue.trim();
    setFocused(false);
    if (!next) {
      setEditValue(display.kind === "single" ? display.value : "");
      return;
    }
    const parsed = integer ? Number.parseInt(next, 10) : Number(next);
    if (!Number.isFinite(parsed) || parsed < 0) {
      setEditValue(display.kind === "single" ? display.value : "");
      return;
    }
    onApply(String(parsed));
  }

  return (
    <Input
      type="text"
      inputMode={integer ? "numeric" : "decimal"}
      aria-label={ariaLabel}
      className="ml-auto h-7 w-28 text-right text-xs"
      value={
        focused
          ? editValue
          : display.kind === "single"
            ? display.value
            : display.value
      }
      placeholder={display.kind === "range" ? display.value : undefined}
      onFocus={() => {
        setFocused(true);
        setEditValue(display.kind === "single" ? display.value : "");
      }}
      onChange={(e) => setEditValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          (e.target as HTMLInputElement).blur();
        }
        if (e.key === "Escape") {
          setFocused(false);
          setEditValue(display.kind === "single" ? display.value : "");
          (e.target as HTMLInputElement).blur();
        }
      }}
      onClick={(e) => e.stopPropagation()}
    />
  );
}

function VariantTableRow({
  variant: v,
  draft,
  onDraftChange,
  onEdit,
  productTitle,
  indented = false,
  titleLabel,
  subtitle,
}: {
  variant: ProductVariant;
  draft: VariantDraft;
  onDraftChange: (patch: Partial<VariantDraft>) => void;
  onEdit: () => void;
  productTitle?: string;
  indented?: boolean;
  titleLabel?: string;
  subtitle?: string | null;
}) {
  const stockTracked = v.trackQuantity !== false;
  const title = formatVariantTitle(v, productTitle, titleLabel);
  const optionLabel = !indented ? formatVariantOptionLabel(v) : null;

  return (
    <tr className={indented ? "bg-muted/10" : undefined}>
      <td className={cn("px-5 py-3", indented && "pl-12")}>
        <p className="font-medium text-gray-900 dark:text-gray-100">{title}</p>
        {optionLabel && (
          <p className="text-[10px] text-muted-foreground">{optionLabel}</p>
        )}
        {subtitle && !isDefaultVariantLabel(subtitle) && (
          <p className="text-[10px] text-muted-foreground">{subtitle}</p>
        )}
      </td>
      <td className="px-5 py-3">
        <Input
          className="h-7 w-28 font-mono text-[11px]"
          placeholder="SKU"
          aria-label={`SKU for ${v.title}`}
          value={draft.sku}
          onChange={(e) => onDraftChange({ sku: e.target.value })}
        />
      </td>
      <td className="px-5 py-3 text-right">
        <Input
          type="number"
          inputMode="decimal"
          min="0"
          step="0.01"
          aria-label={`Price for ${v.title}`}
          className="ml-auto h-7 w-24 text-right text-xs"
          value={draft.price}
          onChange={(e) => onDraftChange({ price: e.target.value })}
        />
      </td>
      <td className="px-5 py-3 text-right">
        {!stockTracked ? (
          <span
            className="text-[10px] italic text-muted-foreground"
            title="Not tracked"
          >
            Untracked
          </span>
        ) : (
          <Input
            type="number"
            inputMode="numeric"
            min="0"
            step="1"
            aria-label={`Stock for ${v.title}`}
            className="ml-auto h-7 w-20 text-right text-xs"
            value={draft.inventoryQuantity}
            onChange={(e) =>
              onDraftChange({ inventoryQuantity: e.target.value })
            }
          />
        )}
      </td>
      <td className="px-5 py-3 text-right">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 px-2 text-[11px]"
          onClick={onEdit}
        >
          <Pencil className="size-3.5" />
          Edit
        </Button>
      </td>
    </tr>
  );
}

/**
 * Per-warehouse bucket breakdown for one variant, shown in place of the single
 * editable quantity once warehousing is on. Read-only by design: every write
 * has to go through the movement ledger so it leaves an audit row, which is
 * what the Inventory screen's Adjust action does.
 */
function VariantWarehouseStock({ variantId }: { variantId: string }) {
  const stock = useVariantStock(variantId);
  const levels = stock.data?.levels ?? [];

  if (stock.isLoading) {
    return (
      <p className="rounded-lg bg-gray-50 dark:bg-gray-800/50 px-3 py-2 text-[11px] text-muted-foreground">
        Loading stock by warehouse…
      </p>
    );
  }
  if (stock.isError) {
    return (
      <p className="rounded-lg bg-gray-50 dark:bg-gray-800/50 px-3 py-2 text-[11px] text-muted-foreground">
        Couldn't load stock by warehouse.
      </p>
    );
  }
  if (levels.length === 0) {
    return (
      <p className="rounded-lg bg-gray-50 dark:bg-gray-800/50 px-3 py-2 text-[11px] text-muted-foreground">
        No stock recorded for this variant in any warehouse yet.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg ring-1 ring-border">
      <table className="w-full text-left text-[11px]">
        <thead>
          <tr className="border-b text-muted-foreground">
            <th className="px-2.5 py-1.5 font-medium">Warehouse</th>
            <th className="px-2.5 py-1.5 text-right font-medium">Available</th>
            <th className="px-2.5 py-1.5 text-right font-medium">Reserved</th>
            <th className="px-2.5 py-1.5 text-right font-medium">QC</th>
            <th className="px-2.5 py-1.5 text-right font-medium">Damaged</th>
            <th className="px-2.5 py-1.5 text-right font-medium">On hand</th>
          </tr>
        </thead>
        <tbody>
          {levels.map((l) => (
            <tr key={l.id} className="border-b last:border-b-0">
              <td className="px-2.5 py-1.5">
                {l.warehouse.name}
                {l.defaultLocation?.fullCode && (
                  <span className="ml-1.5 font-mono text-[10px] text-muted-foreground">
                    {l.defaultLocation.fullCode}
                  </span>
                )}
              </td>
              <td
                className={cn(
                  "px-2.5 py-1.5 text-right font-semibold tabular-nums",
                  l.available < 0 && "text-red-600",
                  l.available === 0 && "text-orange-500",
                )}
              >
                {l.available}
              </td>
              <td className="px-2.5 py-1.5 text-right tabular-nums">{l.reserved}</td>
              <td className="px-2.5 py-1.5 text-right tabular-nums">{l.qc}</td>
              <td className="px-2.5 py-1.5 text-right tabular-nums">{l.damaged}</td>
              <td className="px-2.5 py-1.5 text-right font-semibold tabular-nums">
                {l.available + l.reserved + l.qc + l.damaged}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function VariantEditDialog({
  variant,
  draft,
  currency,
  open,
  onOpenChange,
  onSaveDraft,
  onSave,
  isSaving,
}: {
  variant: ProductVariant | null;
  draft: VariantDraft | null;
  currency: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaveDraft: (patch: Partial<VariantDraft>) => void;
  onSave: (data: UpdateVariantRequest) => Promise<void>;
  isSaving: boolean;
}) {
  const [price, setPrice] = useState("");
  const [compareAtPrice, setCompareAtPrice] = useState("");
  const [cost, setCost] = useState("");
  const [sku, setSku] = useState("");
  const [barcode, setBarcode] = useState("");
  const [inventoryQuantity, setInventoryQuantity] = useState("0");
  const [trackQuantity, setTrackQuantity] = useState(true);
  const [continueSelling, setContinueSelling] = useState(false);
  const [taxable, setTaxable] = useState(true);

  // With warehousing on, this variant's stock is the sum of per-warehouse
  // buckets and `inventoryQuantity` is only a cache of it. Writing the field
  // directly would bypass the movement ledger and be silently recomputed away
  // by the next stock movement, so it becomes read-only and the real numbers
  // are shown below instead.
  const warehousingEnabled = useInventoryStatus().data?.warehousingEnabled === true;

  useEffect(() => {
    if (!variant || !open) return;
    setPrice(draft?.price ?? toInputNumber(variant.price));
    setCompareAtPrice(toInputNumber(variant.compareAtPrice));
    setCost(draft?.cost ?? toInputNumber(variant.cost));
    setSku(draft?.sku ?? variant.sku ?? "");
    setBarcode(variant.barcode ?? "");
    setInventoryQuantity(
      draft?.inventoryQuantity ?? toInputNumber(variant.inventoryQuantity ?? 0),
    );
    setTrackQuantity(variant.trackQuantity ?? true);
    setContinueSelling(variant.continueSellingWhenOutOfStock ?? false);
    setTaxable(variant.taxable ?? true);
    // Seed once per open (or when switching variants). Depending on `draft`
    // or the `variant` object identity would re-seed over the user's typing
    // whenever a background refetch re-renders the parent.
  }, [open, variant?.id]);

  if (!variant) return null;

  async function handleSave() {
    const data: UpdateVariantRequest = {};
    const parsedPrice = Number(price);
    if (price.trim() && Number.isFinite(parsedPrice)) data.price = parsedPrice;
    const nextCompareAt = toNullableNumber(compareAtPrice);
    if (nextCompareAt !== undefined) data.compareAtPrice = nextCompareAt;
    const nextCost = toNullableNumber(cost);
    if (nextCost !== undefined) data.cost = nextCost;
    data.sku = sku.trim() || null;
    data.barcode = barcode.trim() || null;
    const parsedQty = Number.parseInt(inventoryQuantity, 10);
    if (Number.isFinite(parsedQty)) data.inventoryQuantity = parsedQty;
    data.trackQuantity = trackQuantity;
    data.continueSellingWhenOutOfStock = continueSelling;
    data.taxable = taxable;

    onSaveDraft({
      price,
      cost,
      inventoryQuantity,
      sku,
    });
    await onSave(data);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit variant</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <p className="text-[12px] text-muted-foreground">
            {[variant.option1, variant.option2, variant.option3]
              .filter((v) => v && v !== "Default Title")
              .join(" / ") || variant.title}
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="ve-price" className="text-[12px]">Price ({currency})</Label>
              <Input
                id="ve-price"
                type="number"
                min="0"
                step="0.01"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ve-compare" className="text-[12px]">Compare at</Label>
              <Input
                id="ve-compare"
                type="number"
                min="0"
                step="0.01"
                value={compareAtPrice}
                onChange={(e) => setCompareAtPrice(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ve-cost" className="text-[12px]">Cost</Label>
              <Input
                id="ve-cost"
                type="number"
                min="0"
                step="0.01"
                value={cost}
                onChange={(e) => setCost(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ve-stock" className="text-[12px]">Stock</Label>
              <Input
                id="ve-stock"
                type="number"
                min="0"
                step="1"
                value={inventoryQuantity}
                onChange={(e) => setInventoryQuantity(e.target.value)}
                disabled={!trackQuantity || warehousingEnabled}
              />
              {warehousingEnabled && (
                <p className="text-[11px] text-muted-foreground">
                  Set per warehouse in{" "}
                  <Link to="/products/inventory" className="underline">Inventory</Link>
                </p>
              )}
            </div>
            <div className="space-y-1">
              <Label htmlFor="ve-sku" className="text-[12px]">SKU</Label>
              <Input id="ve-sku" value={sku} onChange={(e) => setSku(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ve-barcode" className="text-[12px]">Barcode</Label>
              <Input
                id="ve-barcode"
                value={barcode}
                onChange={(e) => setBarcode(e.target.value)}
              />
            </div>
          </div>
          {warehousingEnabled && <VariantWarehouseStock variantId={variant.id} />}
          <Field orientation="horizontal">
            <FieldContent>
              <FieldLabel className="text-[13px]" htmlFor="ve-track">
                Track quantity
              </FieldLabel>
            </FieldContent>
            <Switch
              id="ve-track"
              checked={trackQuantity}
              onCheckedChange={setTrackQuantity}
            />
          </Field>
          <Field orientation="horizontal">
            <FieldContent>
              <FieldLabel className="text-[13px]" htmlFor="ve-continue">
                Continue selling when out of stock
              </FieldLabel>
            </FieldContent>
            <Switch
              id="ve-continue"
              checked={continueSelling}
              onCheckedChange={setContinueSelling}
            />
          </Field>
          <Field orientation="horizontal">
            <FieldContent>
              <FieldLabel className="text-[13px]" htmlFor="ve-taxable">
                Charge tax
              </FieldLabel>
            </FieldContent>
            <Switch id="ve-taxable" checked={taxable} onCheckedChange={setTaxable} />
          </Field>
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSaving}
          >
            Cancel
          </Button>
          <Button type="button" onClick={handleSave} disabled={isSaving}>
            {isSaving && <Loader2 className="size-3.5 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TagsComboboxField({
  label,
  items,
  value,
  onChange,
  placeholder = "Add tags…",
}: {
  label: string;
  items: string[];
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
}) {
  const anchor = useComboboxAnchor();
  const createInputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [createMode, setCreateMode] = useState(false);
  const [newValue, setNewValue] = useState("");

  useEffect(() => {
    if (!open || !createMode) return;
    const scrollY = window.scrollY;
    const frame = requestAnimationFrame(() => {
      createInputRef.current?.focus({ preventScroll: true });
      window.scrollTo(0, scrollY);
    });
    return () => cancelAnimationFrame(frame);
  }, [open, createMode]);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setCreateMode(false);
      setNewValue("");
    }
  }

  function handleAddClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setCreateMode(true);
    // Defer open so this click isn't treated as an outside dismiss.
    queueMicrotask(() => setOpen(true));
  }

  function commitNewValue() {
    const next = newValue.trim();
    if (!next) return;
    if (!value.includes(next)) onChange([...value, next]);
    setOpen(false);
    setCreateMode(false);
    setNewValue("");
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <dt className="text-muted-foreground text-[12px]">{label}</dt>
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onClick={handleAddClick}
          aria-label={`Add ${label.toLowerCase()}`}
          className="rounded-full p-0.5 text-muted-foreground hover:bg-muted"
        >
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <g strokeWidth="0" />
            <g strokeLinecap="round" strokeLinejoin="round" />
            <g
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M7 12h5m0 0h5m-5 0V7m0 5v5" />
              <circle cx="12" cy="12" r="9" />
            </g>
          </svg>
        </button>
      </div>
      <dd>
        <Combobox
          multiple
          autoHighlight
          items={items}
          value={value}
          onValueChange={(next) => onChange(next ?? [])}
          open={open}
          onOpenChange={handleOpenChange}
        >
          <ComboboxChips ref={anchor} className="w-full">
            <ComboboxValue>
              {(values) => (
                <>
                  {values.map((tag: string) => (
                    <ComboboxChip key={tag}>{tag}</ComboboxChip>
                  ))}
                  <ComboboxChipsInput placeholder={placeholder} />
                </>
              )}
            </ComboboxValue>
          </ComboboxChips>
          <ComboboxContent anchor={anchor}>
            {createMode && (
              <div
                className="flex items-center gap-1.5 border-b p-2"
                onMouseDown={(e) => e.preventDefault()}
              >
                <Input
                  ref={createInputRef}
                  value={newValue}
                  placeholder={`Add new ${label.toLowerCase()}…`}
                  className="h-8"
                  onChange={(e) => setNewValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      e.stopPropagation();
                      commitNewValue();
                    }
                  }}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 shrink-0 px-2 text-xs"
                  onClick={commitNewValue}
                  disabled={!newValue.trim()}
                >
                  Add
                </Button>
              </div>
            )}
            <ComboboxEmpty>No tags found.</ComboboxEmpty>
            <ComboboxList>
              {(item) => (
                <ComboboxItem key={item} value={item}>
                  {item}
                </ComboboxItem>
              )}
            </ComboboxList>
          </ComboboxContent>
        </Combobox>
      </dd>
    </div>
  );
}

function ComboboxField({
  label,
  items,
  value,
  onChange,
  placeholder,
  disabled = false,
  hideAddButton = false,
}: {
  label: string;
  items: string[];
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  disabled?: boolean;
  hideAddButton?: boolean;
}) {
  const createInputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [createMode, setCreateMode] = useState(false);
  const [newValue, setNewValue] = useState("");

  useEffect(() => {
    if (!open || !createMode) return;
    const scrollY = window.scrollY;
    const frame = requestAnimationFrame(() => {
      createInputRef.current?.focus({ preventScroll: true });
      window.scrollTo(0, scrollY);
    });
    return () => cancelAnimationFrame(frame);
  }, [open, createMode]);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setCreateMode(false);
      setNewValue("");
    }
  }

  function handleAddClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (disabled) return;
    setCreateMode(true);
    // Defer open so this click isn't treated as an outside dismiss.
    queueMicrotask(() => setOpen(true));
  }

  function commitNewValue() {
    const next = newValue.trim();
    if (!next) return;
    onChange(next);
    setOpen(false);
    setCreateMode(false);
    setNewValue("");
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <dt className="text-muted-foreground text-[12px]">{label}</dt>
        {!hideAddButton && !disabled && (
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onClick={handleAddClick}
            aria-label={`Add ${label.toLowerCase()}`}
            className="rounded-full p-0.5 text-muted-foreground hover:bg-muted"
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
            >
              <g strokeWidth="0" />
              <g strokeLinecap="round" strokeLinejoin="round" />
              <g
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M7 12h5m0 0h5m-5 0V7m0 5v5" />
                <circle cx="12" cy="12" r="9" />
              </g>
            </svg>
          </button>
        )}
      </div>
      <dd>
        <Combobox
          items={items}
          value={value || null}
          onValueChange={(next) => onChange(next ?? "")}
          disabled={disabled}
          open={open}
          onOpenChange={handleOpenChange}
        >
          <ComboboxInput placeholder={placeholder} />
          <ComboboxContent>
            {createMode && (
              <div
                className="flex items-center gap-1.5 border-b p-2"
                onMouseDown={(e) => e.preventDefault()}
              >
                <Input
                  ref={createInputRef}
                  value={newValue}
                  placeholder={`Add new ${label.toLowerCase()}…`}
                  className="h-8"
                  onChange={(e) => setNewValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      e.stopPropagation();
                      commitNewValue();
                    }
                  }}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 shrink-0 px-2 text-xs"
                  onClick={commitNewValue}
                  disabled={!newValue.trim()}
                >
                  Add
                </Button>
              </div>
            )}
            <ComboboxEmpty>No items found.</ComboboxEmpty>
            <ComboboxList>
              {(item: string) => (
                <ComboboxItem key={item} value={item}>
                  {item}
                </ComboboxItem>
              )}
            </ComboboxList>
          </ComboboxContent>
        </Combobox>
      </dd>
    </div>
  );
}

function DescRow({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between">
      <dt className="inline-flex items-center gap-1.5 text-muted-foreground text-[13px]">
        {icon}
        {label}
      </dt>
      <dd className="font-medium text-gray-900 dark:text-gray-100">{value}</dd>
    </div>
  );
}
