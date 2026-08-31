import { useState } from "react";
import { Link } from "react-router";
import { Package } from "lucide-react";

import { Button } from "~/components/ui/button";
import { Skeleton } from "~/components/ui/skeleton";
import { EmptyState } from "./empty-state";
import { cn, formatCurrency } from "~/lib/utils";
import type { DashboardTopProduct, DashboardLowStockProduct } from "~/types/api";

type Tab = "top" | "low";

interface ProductsPanelProps {
    topProducts?: DashboardTopProduct[];
    lowStockProducts?: DashboardLowStockProduct[];
    isLoading?: boolean;
    currency: string;
    className?: string;
}

export function ProductsPanel({
    topProducts,
    lowStockProducts,
    isLoading,
    currency,
    className,
}: ProductsPanelProps) {
    const [tab, setTab] = useState<Tab>("top");
    const lowCount = lowStockProducts?.length ?? 0;
    const rows = tab === "top" ? topProducts : lowStockProducts;
    const isEmpty = !isLoading && (!rows || rows.length === 0);

    return (
        <div className={cn("flex flex-col rounded-xl bg-card shadow-sm ring-1 ring-border", className)}>
            {/* Segmented control */}
            <div className="p-3">
                <div role="tablist" className="flex gap-1 rounded-full bg-muted p-1">
                    <TabButton active={tab === "top"} onClick={() => setTab("top")}>
                        Top Products
                    </TabButton>
                    <TabButton active={tab === "low"} onClick={() => setTab("low")}>
                        Low Stock{lowCount > 0 && ` (${lowCount})`}
                    </TabButton>
                </div>
            </div>

            {/* Meta row */}
            <div className="flex items-center justify-between px-5 pb-2">
                <p className="text-caption font-medium text-foreground">
                    {tab === "top" ? "Best sellers" : "Running low"}
                </p>
                <p className="text-caption text-muted-foreground">
                    {tab === "top" ? "Last 30 days" : "Needs restock"}
                </p>
            </div>

            {/* Body */}
            <div className="flex flex-1 flex-col">
                {isLoading ? (
                    <div className="divide-y divide-border">
                        {Array.from({ length: 5 }).map((_, i) => (
                            <div key={i} className="flex items-center gap-3 px-5 py-3">
                                <Skeleton className="size-5 rounded-full" />
                                <div className="flex-1 space-y-1.5">
                                    <Skeleton className="h-3 w-40" />
                                    <Skeleton className="h-3 w-24" />
                                </div>
                                <Skeleton className="h-4 w-16" />
                            </div>
                        ))}
                    </div>
                ) : isEmpty ? (
                    <div className="flex flex-1 items-center justify-center px-5 py-12">
                        <EmptyState
                            icon={Package}
                            title={tab === "top" ? "No sales in this period" : "Everything is well stocked"}
                            description={
                                tab === "top"
                                    ? "Top sellers appear here once your products start selling."
                                    : "Products below their reorder threshold will show up here."
                            }
                            action={
                                <Button variant="outline" asChild>
                                    <Link to="/products">Add product</Link>
                                </Button>
                            }
                        />
                    </div>
                ) : (
                    <ul className="divide-y divide-border">
                        {tab === "top"
                            ? topProducts!.map((p, i) => (
                                <ProductRow
                                    key={p.externalProductId}
                                    image={p.image}
                                    rank={i + 1}
                                    title={p.title}
                                    meta={`${p.totalQuantitySold} sold · ${p.currentStock} in stock`}
                                    value={formatCurrency(p.totalQuantitySold * parseFloat(p.price), currency)}
                                />
                            ))
                            : lowStockProducts!.map((p, i) => (
                                <ProductRow
                                    key={p.id}
                                    image={p.image}
                                    rank={i + 1}
                                    title={p.title}
                                    meta={`${p.currentStock} in stock · reorder at ${p.threshold}`}
                                    value={`${p.lowestVariantStock} left`}
                                    tone={p.lowestVariantStock === 0 ? "danger" : "warning"}
                                />
                            ))}
                    </ul>
                )}
            </div>

            {/* Footer */}
            <div className="mt-auto border-t bg-muted/50">
                <Link
                    to="/products"
                    className="flex items-center justify-center py-3 text-caption font-medium text-brand-strong hover:text-brand-strong-hover"
                >
                    View All Products
                </Link>
            </div>
        </div>
    );
}

function TabButton({
    active,
    onClick,
    children,
}: {
    active: boolean;
    onClick: () => void;
    children: React.ReactNode;
}) {
    return (
        <button
            type="button"
            role="tab"
            aria-selected={active}
            onClick={onClick}
            className={cn(
                "flex-1 rounded-full px-4 py-1.5 text-caption font-medium transition-colors",
                active
                    ? "bg-ink text-brand font-semibold"
                    : "text-muted-foreground hover:text-foreground"
            )}
        >
            {children}
        </button>
    );
}

function ProductRow({
    rank,
    image,
    title,
    meta,
    value,
    tone,
}: {
    rank: number;
    image?: string | null;
    title: string;
    meta: string;
    value: string;
    tone?: "danger" | "warning";
}) {
    return (
        <li className="flex items-center gap-3 px-5 py-3">
            <span
                className={cn(
                    "flex size-5 shrink-0 items-center justify-center rounded-full text-micro font-semibold tabular-nums",
                    rank === 1 ? "bg-brand text-brand-foreground" : "text-muted-foreground"
                )}
            >
                {rank}
            </span>

            <div className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
                {image ? (
                    <img src={image} alt="" className="size-full object-cover" />
                ) : (
                    <Package className="size-4 text-muted-foreground" />
                )}
            </div>

            <div className="min-w-0 flex-1">
                <p className="truncate text-caption font-semibold text-foreground">{title}</p>
                <p className="text-micro text-muted-foreground">{meta}</p>
            </div>

            <span
                className={cn(
                    "shrink-0 text-caption font-semibold tabular-nums",
                    tone === "danger" ? "text-danger" : tone === "warning" ? "text-warning-strong" : "text-foreground"
                )}
            >
                {value}
            </span>
        </li>
    );
}