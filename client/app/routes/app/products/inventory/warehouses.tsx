import { useState } from "react";
import { Link } from "react-router";
import {
  ArrowLeft,
  Grid3x3,
  Pencil,
  Plus,
  ShoppingBag,
  Star,
  Warehouse as WarehouseIcon,
} from "lucide-react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { EmptyState } from "~/components/app/empty-state";
import { QueryErrorState } from "~/components/app/query-error-state";
import { TableSkeleton } from "~/components/app/table-skeleton";
import { ModalShell, DialogFooter } from "~/components/app/order-dialog-primitives";
import {
  useInventoryStatus,
  useWarehouseLocations,
  useWarehouses,
} from "~/hooks/use-inventory-queries";
import {
  useBulkCreateLocationsMutation,
  useCreateWarehouseMutation,
  useUpdateWarehouseMutation,
} from "~/hooks/use-inventory-mutations";
import type { Warehouse } from "~/types/api";

/**
 * Warehouse management. Warehouses carrying a Shopify location id are mirrors
 * created by the location sync — their name and active state follow Shopify,
 * so the actions offered on them are deliberately narrower than on a
 * hand-created one.
 */
export default function WarehousesPage() {
  const status = useInventoryStatus();
  const warehouses = useWarehouses();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Warehouse | null>(null);
  const [griddingFor, setGriddingFor] = useState<Warehouse | null>(null);

  const rows = warehouses.data ?? [];
  const shopifyMapped = rows.filter((w) => w.shopifyLocationId).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm" className="text-xs text-muted-foreground">
            <Link to="/products/inventory">
              <ArrowLeft className="size-3.5" /> Inventory
            </Link>
          </Button>
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Warehouses</h1>
        </div>
        <Button
          size="sm"
          onClick={() => setCreating(true)}
          className="bg-[#CEF17B] text-gray-900 hover:bg-[#b8e67d]"
        >
          <Plus className="size-3.5" /> New warehouse
        </Button>
      </div>

      {shopifyMapped > 0 && (
        <p className="rounded-lg bg-gray-50 dark:bg-gray-800/50 px-3 py-2 text-[11px] text-muted-foreground">
          {shopifyMapped} warehouse{shopifyMapped === 1 ? "" : "s"} mirror a Shopify
          location. Their stock is reconciled from Shopify on every sync, and their
          name and active state follow the location — rename them in Shopify.
        </p>
      )}

      {warehouses.isLoading ? (
        <TableSkeleton rows={4} columns={6} />
      ) : warehouses.isError ? (
        <QueryErrorState resource="warehouses" onRetry={() => warehouses.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={WarehouseIcon}
          title="No warehouses yet"
          description={
            status.data?.warehousingEnabled
              ? "Connect Shopify to mirror its locations automatically, or create one by hand."
              : "Enable warehousing from the Inventory page to start tracking stock per warehouse."
          }
          action={
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus className="size-3.5" /> New warehouse
            </Button>
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-xl bg-white dark:bg-gray-900 shadow-sm ring-1 ring-border">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b text-muted-foreground">
                <th className="px-3 py-2.5 font-medium">Warehouse</th>
                <th className="px-3 py-2.5 font-medium">Code</th>
                <th className="px-3 py-2.5 font-medium">Source</th>
                <th className="px-3 py-2.5 text-right font-medium">Locations</th>
                <th className="px-3 py-2.5 text-right font-medium">Stock lines</th>
                <th className="px-3 py-2.5 font-medium">State</th>
                <th className="px-3 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {rows.map((w) => (
                <WarehouseRow
                  key={w.id}
                  warehouse={w}
                  onEdit={() => setEditing(w)}
                  onGenerateGrid={() => setGriddingFor(w)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {creating && <CreateWarehouseDialog onClose={() => setCreating(false)} />}
      {editing && <EditWarehouseDialog warehouse={editing} onClose={() => setEditing(null)} />}
      {griddingFor && (
        <LocationGridDialog warehouse={griddingFor} onClose={() => setGriddingFor(null)} />
      )}
    </div>
  );
}

function WarehouseRow({
  warehouse: w,
  onEdit,
  onGenerateGrid,
}: {
  warehouse: Warehouse;
  onEdit: () => void;
  onGenerateGrid: () => void;
}) {
  const update = useUpdateWarehouseMutation();

  return (
    <tr className="border-b last:border-b-0 hover:bg-gray-50 dark:hover:bg-gray-800/50">
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-2">
          <div className="flex size-7 items-center justify-center rounded-md bg-gray-100 dark:bg-gray-800">
            <WarehouseIcon className="size-3.5 text-gray-400" />
          </div>
          <span className="font-medium text-gray-900 dark:text-gray-100">{w.name}</span>
          {w.isDefault && (
            <span className="inline-flex items-center gap-1 rounded-full bg-[#CEF17B] px-2 py-0.5 text-[10px] font-semibold text-gray-900">
              <Star className="size-2.5" /> Default
            </span>
          )}
        </div>
      </td>
      <td className="px-3 py-2.5 font-mono">{w.code}</td>
      <td className="px-3 py-2.5">
        {w.shopifyLocationId ? (
          <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
            <ShoppingBag className="size-3" /> Shopify · {w.shopifyLocationId}
          </span>
        ) : (
          <span className="text-[11px] text-muted-foreground">Manual</span>
        )}
      </td>
      <td className="px-3 py-2.5 text-right tabular-nums">{w.locationCount}</td>
      <td className="px-3 py-2.5 text-right tabular-nums">{w.stockLineCount}</td>
      <td className="px-3 py-2.5">
        <span className={w.isActive ? "text-green-600" : "text-muted-foreground"}>
          {w.isActive ? "Active" : "Inactive"}
        </span>
      </td>
      <td className="px-3 py-2.5">
        <div className="flex items-center justify-end gap-1.5">
          <Button variant="outline" size="sm" className="h-7 text-[11px]" onClick={onGenerateGrid}>
            <Grid3x3 className="size-3" /> Locations
          </Button>
          <Button variant="outline" size="sm" className="h-7 text-[11px]" onClick={onEdit}>
            <Pencil className="size-3" /> Edit
          </Button>
          {!w.isDefault && w.isActive && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-[11px]"
              disabled={update.isPending}
              onClick={() => update.mutate({ id: w.id, data: { isDefault: true } })}
            >
              Make default
            </Button>
          )}
        </div>
      </td>
    </tr>
  );
}

function CreateWarehouseDialog({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const create = useCreateWarehouseMutation();

  // Mirrors CreateWarehouseDto's ^[A-Z0-9]{1,8}$ — the code is the prefix of
  // every location full-code under it, and scanner keyboard-wedges only emit
  // this charset reliably across layouts.
  const codeValid = /^[A-Z0-9]{1,8}$/.test(code);
  const valid = name.trim().length > 0 && codeValid;

  return (
    <ModalShell
      title="New warehouse"
      subtitle="For stock you hold outside Shopify. Shopify locations mirror themselves automatically."
      onClose={onClose}
    >
      <div className="space-y-4 px-6 py-4 text-xs">
        <label className="block space-y-1">
          <span className="font-medium text-gray-700 dark:text-gray-300">Name</span>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-8 text-xs"
            placeholder="e.g. Overflow Store"
            autoFocus
          />
        </label>
        <label className="block space-y-1">
          <span className="font-medium text-gray-700 dark:text-gray-300">
            Code
            <span className="ml-2 font-normal text-muted-foreground">
              1-8 uppercase letters or digits
            </span>
          </span>
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            className="h-8 font-mono text-xs"
            placeholder="WH2"
          />
          {code.length > 0 && !codeValid && (
            <span className="text-[11px] text-red-600">
              Use only A-Z and 0-9, up to 8 characters.
            </span>
          )}
        </label>
        <p className="rounded-md bg-gray-50 dark:bg-gray-800/50 px-3 py-2 text-[11px] text-muted-foreground">
          Location codes under this warehouse read {code || "WH2"}-A01-S02-B03.
        </p>
      </div>
      <DialogFooter
        confirmLabel="Create warehouse"
        onConfirm={() =>
          create.mutate({ name: name.trim(), code }, { onSuccess: () => onClose() })
        }
        onClose={onClose}
        pending={create.isPending}
        confirmDisabled={!valid}
      />
    </ModalShell>
  );
}

function EditWarehouseDialog({
  warehouse: w,
  onClose,
}: {
  warehouse: Warehouse;
  onClose: () => void;
}) {
  const [name, setName] = useState(w.name);
  const update = useUpdateWarehouseMutation();
  const isShopify = !!w.shopifyLocationId;

  return (
    <ModalShell title="Edit warehouse" subtitle={`${w.name} · ${w.code}`} onClose={onClose}>
      <div className="space-y-4 px-6 py-4 text-xs">
        <label className="block space-y-1">
          <span className="font-medium text-gray-700 dark:text-gray-300">Name</span>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-8 text-xs"
            autoFocus
          />
        </label>

        {isShopify && (
          <p className="rounded-md bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
            This warehouse mirrors Shopify location {w.shopifyLocationId}. Its active
            state follows that location on every sync, so deactivate it in Shopify
            rather than here.
          </p>
        )}

        {!w.isDefault && (
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              className="accent-[#CEF17B]"
              checked={!w.isActive}
              onChange={(e) =>
                update.mutate({ id: w.id, data: { isActive: !e.target.checked } })
              }
            />
            <span className="text-gray-700 dark:text-gray-300">
              Inactive — hidden from stock operations, history kept
            </span>
          </label>
        )}
        {w.isDefault && (
          <p className="text-[11px] text-muted-foreground">
            The default warehouse cannot be deactivated. Make another one default first.
          </p>
        )}
      </div>
      <DialogFooter
        confirmLabel="Save"
        onConfirm={() =>
          update.mutate(
            { id: w.id, data: { name: name.trim() } },
            { onSuccess: () => onClose() },
          )
        }
        onClose={onClose}
        pending={update.isPending}
        confirmDisabled={name.trim().length === 0}
      />
    </ModalShell>
  );
}

function LocationGridDialog({
  warehouse: w,
  onClose,
}: {
  warehouse: Warehouse;
  onClose: () => void;
}) {
  const [racks, setRacks] = useState("5");
  const [shelves, setShelves] = useState("4");
  const [bins, setBins] = useState("6");
  const [letterRacks, setLetterRacks] = useState(true);
  const existing = useWarehouseLocations(w.id);
  const bulk = useBulkCreateLocationsMutation();

  const n = (v: string) => parseInt(v, 10);
  // Bounds mirror BulkLocationsDto (racks 1-50, shelves 1-20, bins 1-50).
  const valid =
    n(racks) >= 1 && n(racks) <= 50 &&
    n(shelves) >= 1 && n(shelves) <= 20 &&
    n(bins) >= 1 && n(bins) <= 50;
  const total = valid ? n(racks) + n(racks) * n(shelves) * (1 + n(bins)) : 0;
  const rackCode = letterRacks ? "A01" : "R01";

  return (
    <ModalShell
      title="Generate locations"
      subtitle={`${w.name} · ${existing.data?.length ?? 0} existing`}
      onClose={onClose}
    >
      <div className="space-y-4 px-6 py-4 text-xs">
        <div className="grid grid-cols-3 gap-3">
          <label className="space-y-1">
            <span className="font-medium text-gray-700 dark:text-gray-300">Racks</span>
            <Input type="number" min={1} max={50} value={racks}
              onChange={(e) => setRacks(e.target.value)} className="h-8 text-xs" />
          </label>
          <label className="space-y-1">
            <span className="font-medium text-gray-700 dark:text-gray-300">Shelves / rack</span>
            <Input type="number" min={1} max={20} value={shelves}
              onChange={(e) => setShelves(e.target.value)} className="h-8 text-xs" />
          </label>
          <label className="space-y-1">
            <span className="font-medium text-gray-700 dark:text-gray-300">Bins / shelf</span>
            <Input type="number" min={1} max={50} value={bins}
              onChange={(e) => setBins(e.target.value)} className="h-8 text-xs" />
          </label>
        </div>

        <label className="flex items-center gap-2">
          <input type="checkbox" className="accent-[#CEF17B]" checked={letterRacks}
            onChange={(e) => setLetterRacks(e.target.checked)} />
          <span className="text-gray-700 dark:text-gray-300">
            Letter the racks (A01, B01…) instead of numbering them (R01, R02…)
          </span>
        </label>

        <p className="rounded-md bg-gray-50 dark:bg-gray-800/50 px-3 py-2 text-[11px] text-muted-foreground">
          {valid ? (
            <>
              Creates <strong>{total}</strong> locations, from{" "}
              <span className="font-mono">{w.code}-{rackCode}-S01-B01</span> onward.
            </>
          ) : (
            "Racks 1-50, shelves 1-20 per rack, bins 1-50 per shelf."
          )}
        </p>

        {(existing.data?.length ?? 0) > 0 && (
          <p className="rounded-md bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
            This warehouse already has locations. Generating a grid whose codes
            overlap the existing ones is rejected outright rather than merged —
            clear them first if you are re-sizing.
          </p>
        )}
      </div>
      <DialogFooter
        confirmLabel={valid ? `Create ${total} locations` : "Create locations"}
        onConfirm={() =>
          bulk.mutate(
            {
              id: w.id,
              data: {
                racks: n(racks),
                shelvesPerRack: n(shelves),
                binsPerShelf: n(bins),
                letterRacks,
              },
            },
            { onSuccess: () => onClose() },
          )
        }
        onClose={onClose}
        pending={bulk.isPending}
        confirmDisabled={!valid}
      />
    </ModalShell>
  );
}
