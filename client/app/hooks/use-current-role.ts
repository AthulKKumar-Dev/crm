import { useAuthStore } from "~/stores/auth.store";
import type { UserRole } from "~/types/api";

// Stable identity for "no grants", so hooks keyed on `grants` don't re-run.
const NO_GRANTS: string[] = [];

/**
 * The current user's role, vendor scope and grants in the active organization.
 * Centralizes the `organizations.find(currentOrgId)` lookup used across the app.
 */
export function useCurrentRole(): {
  role: UserRole | undefined;
  vendorScope: string | null | undefined;
  isVendor: boolean;
  /** Fine-grained grants (`section.*`, `inventory.*`) for AGENT / VIEWER. */
  grants: string[];
} {
  const organizations = useAuthStore((s) => s.organizations);
  const currentOrgId = useAuthStore((s) => s.currentOrgId);
  const membership = organizations.find((m) => m.organization.id === currentOrgId);
  return {
    role: membership?.role,
    vendorScope: membership?.vendorScope,
    isVendor: membership?.role === "VENDOR",
    grants: membership?.permissions ?? NO_GRANTS,
  };
}
