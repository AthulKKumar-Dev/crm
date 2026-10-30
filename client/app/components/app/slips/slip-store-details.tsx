/**
 * "Your store details" — what the From block and contact row will say, and the
 * per-device overrides for them. Blank means inherit; see `SlipStoreOverrides`.
 */
import { Link } from "react-router";
import type { PackageSlipStore } from "~/components/app/package-slip";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Textarea } from "~/components/ui/textarea";
import { hasOverrides, type SlipStoreOverrides } from "~/lib/slip-options";

const FIELDS: Array<{
  key: Exclude<keyof SlipStoreOverrides, "address">;
  label: string;
}> = [
  { key: "name", label: "Store name" },
  { key: "phone", label: "Phone" },
  { key: "whatsapp", label: "WhatsApp" },
  { key: "email", label: "Support email" },
  { key: "website", label: "Website" },
  { key: "logoUrl", label: "Logo image URL" },
];

export function SlipStoreDetails({
  store,
  effectiveStore,
  overrides,
  onChange,
  onReset,
  open,
  onOpenChange,
}: {
  /** The resolved store profile — what a blank field falls back to. */
  store: PackageSlipStore;
  /** Profile with overrides applied — what actually prints. */
  effectiveStore: PackageSlipStore;
  overrides: SlipStoreOverrides;
  onChange: (patch: Partial<SlipStoreOverrides>) => void;
  onReset: () => void;
  open: boolean;
  onOpenChange: (next: boolean) => void;
}) {
  const changed = hasOverrides(overrides);
  const summary = [
    effectiveStore.name,
    effectiveStore.addressLines[effectiveStore.addressLines.length - 1],
    effectiveStore.phone,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <section className="overflow-hidden rounded-lg border border-border">
      <div className="flex flex-wrap items-start justify-between gap-4 bg-muted/40 px-4 py-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-section text-foreground">Your store details</h2>
            {changed && (
              <Badge className="bg-warning-subtle text-warning-strong">
                Changed for this device
              </Badge>
            )}
          </div>
          <p className="mt-1 text-caption leading-relaxed text-muted-foreground">
            {summary || "No store details yet — add them here or in Settings."}
          </p>
        </div>
        <div className="flex flex-none items-center gap-2">
          {changed && (
            <Button variant="outline" size="xs" onClick={onReset}>
              Use store profile
            </Button>
          )}
          <button
            type="button"
            aria-expanded={open}
            onClick={() => onOpenChange(!open)}
            className="px-1 text-caption font-medium text-brand-strong hover:underline"
          >
            {open ? "Done" : "Edit"}
          </button>
        </div>
      </div>

      {open && (
        <div className="space-y-3 border-t border-border p-4">
          <p className="text-caption leading-relaxed text-muted-foreground">
            Changes here apply to slips printed on this device. Leave a field empty to use
            the value from{" "}
            <Link to="/settings/store-profile" className="text-brand-strong hover:underline">
              Settings → Store Profile
            </Link>
            .
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {FIELDS.map((f) => (
              <label key={f.key} className="grid min-w-0 gap-1">
                <span className="text-caption text-muted-foreground">{f.label}</span>
                <Input
                  value={overrides[f.key]}
                  placeholder={store[f.key]}
                  onChange={(e) => onChange({ [f.key]: e.target.value })}
                  className="h-8"
                />
              </label>
            ))}
          </div>
          <label className="grid gap-1">
            <span className="text-caption text-muted-foreground">
              Return address — one line per row
            </span>
            <Textarea
              rows={3}
              value={overrides.address}
              placeholder={store.addressLines.join("\n")}
              onChange={(e) => onChange({ address: e.target.value })}
            />
          </label>
        </div>
      )}
    </section>
  );
}
