import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import {
  ArrowLeft,
  Loader2,
  Pencil,
  Trash2,
  Check,
  AlertTriangle,
  Package,
  ExternalLink,
} from "lucide-react";
import { useProduct } from "~/hooks/use-product-queries";
import { useOrders } from "~/hooks/use-order-queries";
import { useDeleteProductMutation } from "~/hooks/use-product-mutations";
import { useCurrentOrg } from "~/hooks/use-org-queries";
import { ProductFormDialog } from "~/components/app/product-create/product-form-dialog";
import { cn, formatCurrency } from "~/lib/utils";

export function meta() {
  return [{ title: "Product Detail | Collabo CRM" }];
}

const STATUS_CLASS: Record<string, string> = {
  ACTIVE: "bg-[#CEF17B]/30 text-[#084734]",
  DRAFT: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  ARCHIVED: "bg-orange-100 text-orange-700",
};

export default function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: product, isLoading } = useProduct(id);
  const { data: org } = useCurrentOrg();
  const currency = org?.currency ?? "INR";
  const [editing, setEditing] = useState(false);
  const deleteMutation = useDeleteProductMutation();

  // Recent orders that contain this product (filtered server-side via the
  // new productId param we just added).
  const { data: recentOrders } = useOrders(
    id ? { productId: id, limit: 5 } : undefined,
  );

  if (isLoading || !product) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const isManual = product.channel?.platform === "MANUAL";
  const meta = ((product as any).metadata ?? {}) as Record<string, unknown>;
  const sync = (meta.shopifySync ?? null) as
    | { status: "PENDING" | "SYNCED" | "FAILED"; shopifyProductId?: string; error?: string }
    | null;
  const totalStock = (product as any).totalStock ?? 0;

  function handleArchive() {
    if (!product) return;
    if (
      confirm(
        `Archive "${product.title}"? Existing orders will keep their record.`,
      )
    ) {
      deleteMutation.mutate(product.id, {
        onSuccess: () => navigate("/products"),
      });
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            to="/products"
            className="mb-1 inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-gray-900 dark:hover:text-gray-100"
          >
            <ArrowLeft className="size-3.5" />
            Back to products
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">{product.title}</h1>
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
          </div>
          <p className="text-xs text-muted-foreground">
            {product.vendor && <>Vendor: {product.vendor} • </>}
            {product.productType && <>Type: {product.productType} • </>}
            {totalStock} in stock
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isManual ? (
            <>
              <button
                onClick={() => setEditing(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-input bg-white dark:bg-gray-900 px-3 py-2 text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800/60"
              >
                <Pencil className="size-3.5" />
                Edit
              </button>
              <button
                onClick={handleArchive}
                className="inline-flex items-center gap-1.5 rounded-lg border border-input bg-white dark:bg-gray-900 px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
              >
                <Trash2 className="size-3.5" />
                Archive
              </button>
            </>
          ) : (
            <span className="text-[11px] text-muted-foreground italic">
              Synced products are read-only — edit in {product.channel?.name ?? "Shopify"}.
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {/* Description */}
          {(product as any).bodyHtml && (
            <Section title="Description">
              <div
                className="prose prose-sm max-w-none dark:prose-invert text-xs"
                dangerouslySetInnerHTML={{ __html: (product as any).bodyHtml }}
              />
            </Section>
          )}

          {/* Variants */}
          <Section title={`Variants (${product.variants.length})`}>
            <div className="overflow-x-auto -mx-5">
              <table className="w-full text-xs">
                <thead className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  <tr className="border-b">
                    <th className="px-5 py-2 text-left font-medium">Title</th>
                    <th className="px-5 py-2 text-left font-medium">SKU</th>
                    <th className="px-5 py-2 text-right font-medium">Price</th>
                    <th className="px-5 py-2 text-right font-medium">Compare-at</th>
                    <th className="px-5 py-2 text-right font-medium">Stock</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {product.variants.map((v) => (
                    <tr key={v.id}>
                      <td className="px-5 py-3">
                        <p className="font-medium text-gray-900 dark:text-gray-100">{v.title}</p>
                        {(v.option1 || v.option2 || v.option3) && (
                          <p className="text-[10px] text-muted-foreground">
                            {[v.option1, v.option2, v.option3].filter(Boolean).join(" / ")}
                          </p>
                        )}
                      </td>
                      <td className="px-5 py-3 font-mono text-[11px] text-muted-foreground">
                        {v.sku ?? "—"}
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums font-medium">
                        {formatCurrency(v.price, currency)}
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums text-muted-foreground">
                        {v.compareAtPrice ? formatCurrency(v.compareAtPrice, currency) : "—"}
                      </td>
                      <td
                        className={cn(
                          "px-5 py-3 text-right tabular-nums font-medium",
                          v.inventoryQuantity === 0 && "text-red-600",
                          v.inventoryQuantity > 0 &&
                            v.inventoryQuantity <= 5 &&
                            "text-amber-600",
                        )}
                      >
                        {v.inventoryQuantity}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          {/* Recent sales */}
          <Section
            title={`Recent sales${
              recentOrders?.meta?.total ? ` (${recentOrders.meta.total} total)` : ""
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
                          • {new Date(o.createdAt).toLocaleDateString("en-IN")}
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
        </div>

        <div className="space-y-6">
          {/* Stock summary */}
          <Section title="Inventory">
            <dl className="space-y-1.5 text-xs">
              <DescRow label="Total stock" value={String(totalStock)} icon={<Package className="size-3" />} />
              <DescRow label="Variants" value={String(product.variants.length)} />
            </dl>
          </Section>

          {/* GST */}
          {((product as any).hsnCode || (product as any).gstRate != null) && (
            <Section title="GST">
              <dl className="space-y-1.5 text-xs">
                <DescRow label="HSN code" value={(product as any).hsnCode || "—"} />
                <DescRow
                  label="GST rate"
                  value={
                    (product as any).gstRate != null ? `${(product as any).gstRate}%` : "—"
                  }
                />
              </dl>
            </Section>
          )}

          {/* Tags */}
          {product.tags && product.tags.length > 0 && (
            <Section title="Tags">
              <div className="flex flex-wrap gap-1">
                {product.tags.map((t) => (
                  <span
                    key={t}
                    className="rounded-full bg-gray-100 dark:bg-gray-800 px-2 py-0.5 text-[10px] text-gray-700 dark:text-gray-300"
                  >
                    {t}
                  </span>
                ))}
              </div>
            </Section>
          )}

          {/* Channel */}
          <Section title="Channel">
            <p className="text-xs text-gray-900 dark:text-gray-100">
              {product.channel?.name ?? "—"}
            </p>
            <p className="text-[10px] text-muted-foreground">{product.channel?.platform}</p>
          </Section>

          {/* Shopify sync card */}
          {sync && (
            <Section title="Shopify Sync">
              <ShopifySyncCard sync={sync} />
            </Section>
          )}
        </div>
      </div>

      {/* Edit dialog */}
      {editing && (
        <ProductFormDialog
          productId={product.id}
          onClose={() => setEditing(false)}
        />
      )}
    </div>
  );
}

function ShopifySyncCard({
  sync,
}: {
  sync: { status: "PENDING" | "SYNCED" | "FAILED"; shopifyProductId?: string; error?: string };
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
    <section className="rounded-xl bg-white dark:bg-gray-900 shadow-sm ring-1 ring-border">
      <h2 className="border-b px-5 py-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h2>
      <div className="px-5 py-4">{children}</div>
    </section>
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
      <dt className="inline-flex items-center gap-1.5 text-muted-foreground">
        {icon}
        {label}
      </dt>
      <dd className="font-medium text-gray-900 dark:text-gray-100">{value}</dd>
    </div>
  );
}
