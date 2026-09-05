import { useMemo } from "react";
import { useCurrentOrg } from "~/hooks/use-org-queries";
import { useOrganizationSettings } from "~/hooks/use-settings-queries";
import { useGstins } from "~/hooks/use-gst-queries";
import { readAddress } from "~/lib/address";
import type { PackageSlipStore } from "~/components/app/package-slip";

/**
 * Resolve the merchant's identity for a package slip's "From" block.
 *
 * ONE source of truth for both print routes, so a slip printed singly and one
 * printed 4-up carry the same return address. Every field falls back
 * independently — a merchant who has filled in only a phone number still gets
 * their org name and website from `Organization`.
 *
 * Address chain: Store Profile → the default GSTIN's registered address.
 * The GSTIN address is the declared principal place of business, which is the
 * right thing to print as a return address before anyone fills in the profile.
 *
 * Deliberately NOT per-order: the order's `dispatchWarehouse` is where the
 * goods physically left from, which the GST invoice already prints as
 * "Dispatch From". A parcel's From block is the RETURN address, and it must be
 * the same on every slip in a batch — varying it per order would send returns
 * to whichever warehouse happened to pick that order.
 *
 * `useGstins` is only called when GST is on: without it the endpoint is a
 * guaranteed empty read for non-GST orgs.
 */
export function useSlipStore(): { store: PackageSlipStore; isLoading: boolean } {
  const { data: org, isLoading: orgLoading } = useCurrentOrg();
  const {
    data: settings,
    isLoading: settingsLoading,
    isError: settingsFailed,
  } = useOrganizationSettings();
  const gstEnabled = org?.gstEnabled ?? false;
  const { data: gstins } = useGstins();

  const profile = settings?.storeProfileSettings;

  const store = useMemo<PackageSlipStore>(() => {
    // Only reached when the profile has no address of its own.
    const defaultGstin =
      gstEnabled && gstins?.length
        ? (gstins.find((g) => g.isDefault) ?? gstins[0])
        : undefined;

    const profileLines = readAddress({
      address1: profile?.address1,
      address2: profile?.address2,
      city: profile?.city,
      province: profile?.province,
      zip: profile?.zip,
      country: profile?.country,
    }).lines;

    const addressLines = profileLines.length
      ? profileLines
      : readAddress(
          defaultGstin?.address as Record<string, unknown> | undefined,
        ).lines;

    return {
      name: profile?.storeName?.trim() || org?.name || "",
      addressLines,
      phone: profile?.supportPhone ?? "",
      whatsapp: profile?.whatsappPhone ?? "",
      email: profile?.supportEmail ?? "",
      website: profile?.website?.trim() || org?.website || "",
      logoUrl: profile?.logoUrl?.trim() || org?.logo || "",
    };
  }, [profile, org, gstins, gstEnabled]);

  // A failing settings read must NOT block the print. Every field it supplies
  // has an `Organization` or GSTIN fallback, so the worst case is a slip
  // without the custom contact row — far better than a packer stuck on a
  // spinner because one endpoint is down (or because a VIEWER got a 403, which
  // React Query would otherwise retry through before giving up).
  return {
    store,
    isLoading: orgLoading || (settingsLoading && !settingsFailed),
  };
}
