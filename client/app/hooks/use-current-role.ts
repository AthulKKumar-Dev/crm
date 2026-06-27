import { useAuthStore } from "~/stores/auth.store";
import type { UserRole } from "~/types/api";

/**
 * The current user's role + vendor scope in the active organization.
 * Centralizes the `organizations.find(currentOrgId)` lookup used across the app.
 */
export function useCurrentRole(): {
  role: UserRole | undefined;
  vendorScope: string | null | undefined;
  isVendor: boolean;
} {
  const organizations = useAuthStore((s) => s.organizations);
  const currentOrgId = useAuthStore((s) => s.currentOrgId);
  const membership = organizations.find((m) => m.organization.id === currentOrgId);
  return {
    role: membership?.role,
    vendorScope: membership?.vendorScope,
    isVendor: membership?.role === "VENDOR",
  };
}
