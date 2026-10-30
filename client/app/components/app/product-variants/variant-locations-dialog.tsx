import { useMemo, useState } from "react";
import { Search } from "lucide-react";

import { Checkbox } from "~/components/ui/checkbox";
import { Input } from "~/components/ui/input";
import { ModalShell, DialogFooter } from "~/components/app/order-dialog-primitives";
import { STOCK_TERMS } from "~/lib/inventory-vocabulary";
import { useWarehouses } from "~/hooks/use-inventory-queries";
import { useSetVariantLocationsMutation } from "~/hooks/use-product-mutations";
import type { VariantStockDetail } from "~/types/api";

type StockLevel = VariantStockDetail["levels"][number];

/**
 * Picks the locations one variant is stocked at — Shopify's "Edit locations".
 *
 * A location the variant still holds stock at cannot be unticked: the server
 * would refuse, so it is shown ticked and locked with the reason instead of
 * letting the merchant untick it and be turned away on save.
 */
export function VariantLocationsDialog({
  variantId,
  levels,
  onClose,
}: {
  variantId: string;
  levels: StockLevel[];
  onClose: () => void;
}) {
  const warehousesQuery = useWarehouses();
  const saveLocations = useSetVariantLocationsMutation();
  const [searchText, setSearchText] = useState("");

  const stockLevelByWarehouseId = useMemo(() => {
    const levelsByWarehouse = new Map<string, StockLevel>();
    for (const level of levels) levelsByWarehouse.set(level.warehouseId, level);
    return levelsByWarehouse;
  }, [levels]);

  const [selectedWarehouseIds, setSelectedWarehouseIds] = useState<Set<string>>(
    () => new Set(stockLevelByWarehouseId.keys()),
  );

  const locationRows = useMemo(
    () =>
      (warehousesQuery.data ?? [])
        .filter((warehouse) => warehouse.isActive)
        .map((warehouse) => {
          const stockLevel = stockLevelByWarehouseId.get(warehouse.id);
          const holdsStock =
            !!stockLevel &&
            (stockLevel.available !== 0 ||
              stockLevel.reserved !== 0 ||
              stockLevel.qc !== 0 ||
              stockLevel.damaged !== 0);
          return {
            warehouseId: warehouse.id,
            name: warehouse.name,
            isShopifyLocation: !!warehouse.shopifyLocationId,
            onHand: stockLevel
              ? stockLevel.available + stockLevel.reserved + stockLevel.qc + stockLevel.damaged
              : null,
            // Cannot be unticked while it holds stock.
            isLocked: holdsStock,
          };
        }),
    [warehousesQuery.data, stockLevelByWarehouseId],
  );

  const normalizedSearch = searchText.trim().toLowerCase();
  const visibleRows = normalizedSearch
    ? locationRows.filter((row) => row.name.toLowerCase().includes(normalizedSearch))
    : locationRows;

  const setLocationSelected = (warehouseId: string, isSelected: boolean) =>
    setSelectedWarehouseIds((previous) => {
      const updated = new Set(previous);
      if (isSelected) updated.add(warehouseId);
      else updated.delete(warehouseId);
      return updated;
    });

  const allVisibleSelected =
    visibleRows.length > 0 && visibleRows.every((row) => selectedWarehouseIds.has(row.warehouseId));
  const someVisibleSelected = visibleRows.some((row) => selectedWarehouseIds.has(row.warehouseId));
  const setAllVisibleSelected = (isSelected: boolean) =>
    setSelectedWarehouseIds((previous) => {
      const updated = new Set(previous);
      for (const row of visibleRows) {
        if (isSelected) updated.add(row.warehouseId);
        else if (!row.isLocked) updated.delete(row.warehouseId);
      }
      return updated;
    });

  // Only active locations are on offer, so only they are compared and sent. A
  // variant can still hold a row at a location that was later deactivated;
  // the server leaves that row alone and would reject its id in the list.
  const warehouseIdsToSave = locationRows
    .filter((row) => selectedWarehouseIds.has(row.warehouseId))
    .map((row) => row.warehouseId);
  const currentlyStockedCount = locationRows.filter((row) =>
    stockLevelByWarehouseId.has(row.warehouseId),
  ).length;
  const hasChanges =
    warehouseIdsToSave.length !== currentlyStockedCount ||
    warehouseIdsToSave.some((warehouseId) => !stockLevelByWarehouseId.has(warehouseId));
  const nothingSelected = warehouseIdsToSave.length === 0;

  const handleSave = () =>
    saveLocations.mutate(
      { variantId, data: { warehouseIds: warehouseIdsToSave } },
      { onSuccess: onClose },
    );

  return (
    <ModalShell title="Edit inventory locations" onClose={onClose} maxWidthClass="max-w-lg">
      <div className="space-y-3 px-6 py-4">
        <p className="text-caption text-muted-foreground">
          Select the locations that stock this variant. Changes to a Shopify location
          reach Shopify the next time this product is synced.
        </p>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-9 pl-8"
            placeholder="Search locations"
            aria-label="Search locations"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
          />
        </div>

        {warehousesQuery.isLoading ? (
          <p className="py-6 text-center text-caption text-muted-foreground">Loading locations…</p>
        ) : warehousesQuery.isError ? (
          <p className="py-6 text-center text-caption text-muted-foreground">
            Couldn&apos;t load locations.
          </p>
        ) : (
          <div className="divide-y rounded-lg border border-border">
            <label className="flex items-center gap-3 bg-muted/50 px-3 py-2">
              <Checkbox
                checked={allVisibleSelected ? true : someVisibleSelected ? "indeterminate" : false}
                onCheckedChange={(checked) => setAllVisibleSelected(checked === true)}
                disabled={saveLocations.isPending || visibleRows.length === 0}
                aria-label="Select all locations"
              />
              <span className="min-w-0 flex-1 text-micro font-medium uppercase tracking-wide text-muted-foreground">
                Location
              </span>
              <span className="text-micro font-medium uppercase tracking-wide text-muted-foreground">
                {STOCK_TERMS.onHand.label}
              </span>
            </label>
            {visibleRows.length === 0 ? (
              <p className="px-3 py-6 text-center text-caption text-muted-foreground">
                No location matches &ldquo;{searchText.trim()}&rdquo;.
              </p>
            ) : (
              visibleRows.map((row) => (
                <label key={row.warehouseId} className="flex items-center gap-3 px-3 py-2.5">
                  <Checkbox
                    checked={selectedWarehouseIds.has(row.warehouseId)}
                    onCheckedChange={(checked) =>
                      setLocationSelected(row.warehouseId, checked === true)
                    }
                    disabled={saveLocations.isPending || row.isLocked}
                    aria-label={row.name}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-label text-foreground" title={row.name}>
                      {row.name}
                    </span>
                    <span className="block text-micro text-muted-foreground">
                      {row.isLocked
                        ? "Holds stock — set it to 0 to remove"
                        : row.isShopifyLocation
                          ? "Shopify location"
                          : "CRM only — not on Shopify"}
                    </span>
                  </span>
                  {row.onHand !== null && (
                    <span className="text-label tabular-nums text-foreground">{row.onHand}</span>
                  )}
                </label>
              ))
            )}
          </div>
        )}

        {!warehousesQuery.isLoading && nothingSelected && (
          <p className="text-micro text-danger">Pick at least one location.</p>
        )}
      </div>
      <DialogFooter
        confirmLabel="Save"
        onConfirm={handleSave}
        onClose={onClose}
        pending={saveLocations.isPending}
        confirmDisabled={!hasChanges || nothingSelected}
      />
    </ModalShell>
  );
}
