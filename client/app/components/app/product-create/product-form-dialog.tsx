import { useEffect, useState } from "react";
import { X, Loader2, Check } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import {
  useCreateProductMutation,
  useUpdateProductMutation,
} from "~/hooks/use-product-mutations";
import { useProduct } from "~/hooks/use-product-queries";
import type {
  CreateProductRequest,
  ProductDetail,
  ProductStatus,
  UpdateProductRequest,
} from "~/types/api";

type FormState = {
  title: string;
  vendor: string;
  productType: string;
  status: ProductStatus;
  tagsCsv: string;
  bodyHtml: string;
  hsnCode: string;
  gstRate: string; // string in form, parsed to number on submit
  variant: {
    price: string;
    sku: string;
    compareAtPrice: string;
    inventoryQuantity: string;
  };
};

const EMPTY: FormState = {
  title: "",
  vendor: "",
  productType: "",
  status: "ACTIVE",
  tagsCsv: "",
  bodyHtml: "",
  hsnCode: "",
  gstRate: "",
  variant: { price: "", sku: "", compareAtPrice: "", inventoryQuantity: "0" },
};

function fromProduct(p: ProductDetail): FormState {
  const v = p.variants[0];
  return {
    title: p.title,
    vendor: p.vendor ?? "",
    productType: p.productType ?? "",
    status: p.status,
    tagsCsv: (p.tags ?? []).join(", "),
    bodyHtml: (p as any).bodyHtml ?? "",
    hsnCode: (p as any).hsnCode ?? "",
    gstRate: (p as any).gstRate != null ? String((p as any).gstRate) : "",
    variant: {
      price: v ? String(v.price) : "",
      sku: v?.sku ?? "",
      compareAtPrice: v?.compareAtPrice ? String(v.compareAtPrice) : "",
      inventoryQuantity: v ? String(v.inventoryQuantity) : "0",
    },
  };
}

/**
 * Create / edit dialog for CRM-native products. Pass `productId` to edit;
 * omit it for create mode. Internally fetches the full product detail via
 * `useProduct` so the parent doesn't have to. Caller is expected to only
 * open this for MANUAL-channel products in edit mode (server returns 403
 * for SHOPIFY ones anyway).
 */
export function ProductFormDialog({
  productId,
  onClose,
}: {
  productId?: string;
  onClose: () => void;
}) {
  const isEdit = !!productId;
  const { data: product, isLoading } = useProduct(productId ?? null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    setForm(product ? fromProduct(product) : EMPTY);
    setErrors({});
  }, [product]);

  const createMutation = useCreateProductMutation();
  const updateMutation = useUpdateProductMutation();
  const isPending = createMutation.isPending || updateMutation.isPending;

  function patch(p: Partial<FormState>) {
    setForm((prev) => ({ ...prev, ...p }));
  }

  function patchVariant(p: Partial<FormState["variant"]>) {
    setForm((prev) => ({ ...prev, variant: { ...prev.variant, ...p } }));
  }

  function validate(): Record<string, string> {
    const e: Record<string, string> = {};
    if (!form.title.trim()) e.title = "Title is required";
    if (!form.variant.price || isNaN(parseFloat(form.variant.price))) {
      e.price = "Price is required";
    } else if (parseFloat(form.variant.price) < 0) {
      e.price = "Price must be ≥ 0";
    }
    if (form.gstRate && (parseFloat(form.gstRate) < 0 || parseFloat(form.gstRate) > 28)) {
      e.gstRate = "GST rate must be 0–28";
    }
    return e;
  }

  function handleSubmit() {
    const e = validate();
    if (Object.keys(e).length > 0) {
      setErrors(e);
      return;
    }

    const tags = form.tagsCsv
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    const variantPayload = {
      price: parseFloat(form.variant.price),
      sku: form.variant.sku || undefined,
      compareAtPrice: form.variant.compareAtPrice
        ? parseFloat(form.variant.compareAtPrice)
        : undefined,
      inventoryQuantity: form.variant.inventoryQuantity
        ? parseInt(form.variant.inventoryQuantity, 10)
        : 0,
    };

    if (isEdit && productId) {
      const data: UpdateProductRequest = {
        title: form.title,
        vendor: form.vendor || undefined,
        productType: form.productType || undefined,
        status: form.status,
        tags,
        hsnCode: form.hsnCode || undefined,
        gstRate: form.gstRate ? parseFloat(form.gstRate) : undefined,
        variant: variantPayload,
      };
      updateMutation.mutate(
        { id: productId, data },
        { onSuccess: () => onClose() },
      );
    } else {
      const data: CreateProductRequest = {
        title: form.title,
        vendor: form.vendor || undefined,
        productType: form.productType || undefined,
        status: form.status,
        tags,
        bodyHtml: form.bodyHtml || undefined,
        hsnCode: form.hsnCode || undefined,
        gstRate: form.gstRate ? parseFloat(form.gstRate) : undefined,
        variant: variantPayload,
      };
      createMutation.mutate(data, { onSuccess: () => onClose() });
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl bg-white dark:bg-gray-900 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b px-6 py-4">
          <div>
            <h2 className="text-sm font-bold text-gray-900 dark:text-gray-100">
              {isEdit ? "Edit product" : "Create product"}
            </h2>
            <p className="text-[10px] text-muted-foreground">
              {isEdit
                ? "Update name, price, tax, or stock for this CRM-managed product."
                : "Add a product to your CRM. It can be used in offline orders right away, and syncs to Shopify when you connect a store."}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Body — show spinner while fetching the product to edit */}
        {isEdit && isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
        <div className="space-y-5 px-6 py-5">
          {/* Section: product */}
          <Section title="Product">
            <Field
              label="Title"
              required
              error={errors.title}
              value={form.title}
              onChange={(v) => patch({ title: v })}
            />
            <div className="grid grid-cols-2 gap-3">
              <Field
                label="Vendor"
                value={form.vendor}
                onChange={(v) => patch({ vendor: v })}
              />
              <Field
                label="Product type"
                value={form.productType}
                onChange={(v) => patch({ productType: v })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-[10px] font-medium text-gray-600 dark:text-gray-400">
                  Status
                </span>
                <Select
                  value={form.status}
                  onValueChange={(v) =>
                    patch({ status: v as ProductStatus })
                  }
                >
                  <SelectTrigger className="mt-1 h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ACTIVE" className="text-xs">
                      Active
                    </SelectItem>
                    <SelectItem value="DRAFT" className="text-xs">
                      Draft
                    </SelectItem>
                    <SelectItem value="ARCHIVED" className="text-xs">
                      Archived
                    </SelectItem>
                  </SelectContent>
                </Select>
              </label>
              <Field
                label="Tags (comma-separated)"
                value={form.tagsCsv}
                onChange={(v) => patch({ tagsCsv: v })}
                placeholder="summer, sale"
              />
            </div>
          </Section>

          {/* Section: tax */}
          <Section title="Tax (GST)">
            <div className="grid grid-cols-2 gap-3">
              <Field
                label="HSN code"
                value={form.hsnCode}
                onChange={(v) => patch({ hsnCode: v })}
                mono
                placeholder="6109"
              />
              <Field
                label="GST rate (%)"
                error={errors.gstRate}
                value={form.gstRate}
                onChange={(v) => patch({ gstRate: v })}
                type="number"
                placeholder="18"
              />
            </div>
          </Section>

          {/* Section: variant */}
          <Section title="Variant">
            <div className="grid grid-cols-2 gap-3">
              <Field
                label="Price"
                required
                error={errors.price}
                value={form.variant.price}
                onChange={(v) => patchVariant({ price: v })}
                type="number"
                step="0.01"
                placeholder="0.00"
              />
              <Field
                label="Compare-at price (optional)"
                value={form.variant.compareAtPrice}
                onChange={(v) => patchVariant({ compareAtPrice: v })}
                type="number"
                step="0.01"
              />
              <Field
                label="SKU"
                value={form.variant.sku}
                onChange={(v) => patchVariant({ sku: v })}
                mono
              />
              <Field
                label="Stock on hand"
                value={form.variant.inventoryQuantity}
                onChange={(v) => patchVariant({ inventoryQuantity: v })}
                type="number"
              />
            </div>
          </Section>
        </div>
        )}

        {/* Footer */}
        <div className="flex items-center gap-2 border-t px-6 py-4">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isPending}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-[#CEF17B] px-4 py-2 text-xs font-semibold text-gray-900 hover:bg-[#BADE6F] disabled:opacity-50 transition-colors"
          >
            {isPending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Check className="size-3.5" />
            )}
            {isEdit ? "Save changes" : "Create product"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-xs text-muted-foreground hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </p>
      {children}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  step,
  mono = false,
  required = false,
  error,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  step?: string;
  mono?: boolean;
  required?: boolean;
  error?: string;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="text-[10px] font-medium text-gray-600 dark:text-gray-400">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </span>
      <input
        type={type}
        step={step}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={`mt-1 h-9 w-full rounded-lg border bg-white dark:bg-gray-800 px-3 text-xs focus:outline-none focus:ring-2 focus:ring-[#CEF17B]/50 ${
          error ? "border-red-400" : "border-input"
        } ${mono ? "font-mono" : ""}`}
      />
      {error && <span className="mt-1 block text-[10px] text-red-600">{error}</span>}
    </label>
  );
}
