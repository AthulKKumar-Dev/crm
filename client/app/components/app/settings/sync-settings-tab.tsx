import { Loader2 } from "lucide-react";
import {
  useOrganizationSettings,
} from "~/hooks/use-settings-queries";
import {
  useUpdateProductSettingsMutation,
  useUpdateOrderSettingsMutation,
} from "~/hooks/use-settings-mutations";

/**
 * Combined "Products" and "Orders" settings panes. Each domain has one toggle
 * today (auto-sync to Shopify); the layout is built to absorb additional rows
 * cleanly as we add more per-domain settings (default GST rate, default
 * status, etc.). Two distinct tabs renders this same component with a
 * `domain` prop so the surface area stays small.
 */
export function ProductSettingsTab() {
  const { data, isLoading } = useOrganizationSettings();
  const mutation = useUpdateProductSettingsMutation();

  if (isLoading || !data) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const settings = data.productSettings;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-bold text-gray-900 dark:text-gray-100">
          Product settings
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Control how products created in the CRM behave when a Shopify channel is connected.
        </p>
      </div>

      <SettingsCard>
        <SettingsToggleRow
          label="Auto-sync new products to Shopify"
          help="When ON, every product created in the CRM is pushed to your connected Shopify store immediately. When OFF (default), products stay local until you sync them manually from the product page or via the channels-page Sync button."
          checked={settings.autoSyncToShopify}
          disabled={mutation.isPending}
          onChange={(checked) => mutation.mutate({ autoSyncToShopify: checked })}
        />
      </SettingsCard>
    </div>
  );
}

export function OrderSettingsTab() {
  const { data, isLoading } = useOrganizationSettings();
  const mutation = useUpdateOrderSettingsMutation();

  if (isLoading || !data) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const settings = data.orderSettings;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-bold text-gray-900 dark:text-gray-100">
          Order settings
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Control how offline (in-store) orders and draft orders created in the CRM behave when a Shopify channel is connected.
        </p>
      </div>

      <SettingsCard>
        <SettingsToggleRow
          label="Auto-sync new offline orders and drafts to Shopify"
          help="When ON, every offline order and draft order created in the CRM is pushed to your connected Shopify store immediately. When OFF (default), they stay local until you sync them manually or via the channels-page Sync button."
          checked={settings.autoSyncToShopify}
          disabled={mutation.isPending}
          onChange={(checked) => mutation.mutate({ autoSyncToShopify: checked })}
        />
      </SettingsCard>
    </div>
  );
}

function SettingsCard({ children }: { children: React.ReactNode }) {
  return (
    <section className="rounded-xl bg-white dark:bg-gray-900 shadow-sm ring-1 ring-border divide-y">
      {children}
    </section>
  );
}

/**
 * One labeled toggle row. Designed to repeat — drop more `<SettingsToggleRow>`
 * inside a `<SettingsCard>` as new settings get added to a domain.
 */
function SettingsToggleRow({
  label,
  help,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  help?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 px-5 py-4">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
          {label}
        </p>
        {help && (
          <p className="mt-1 text-[11px] text-muted-foreground leading-relaxed">
            {help}
          </p>
        )}
      </div>
      <ToggleSwitch
        checked={checked}
        disabled={disabled}
        onChange={onChange}
      />
    </div>
  );
}

function ToggleSwitch({
  checked,
  disabled,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#cdff8c] disabled:cursor-not-allowed disabled:opacity-50 ${
        checked ? "bg-[#cdff8c]" : "bg-gray-200 dark:bg-gray-700"
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition-transform ${
          checked ? "translate-x-4" : "translate-x-0"
        }`}
      />
    </button>
  );
}
