import { Navigate } from "react-router";
import { useAuthStore } from "~/stores/auth.store";

/**
 * Protects /app/* routes.
 *
 * - Not authenticated → /auth/login
 * - No organizations → /onboarding/account-type
 * - No currentOrgId → auto-set first org
 * - All checks pass → render children
 */
export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, accessToken, organizations, currentOrgId, setCurrentOrg } =
    useAuthStore();

  if (!isAuthenticated || !accessToken) {
    return <Navigate to="/auth/login" replace />;
  }

  if (organizations.length === 0) {
    return <Navigate to="/onboarding/account-type" replace />;
  }

  // Auto-set currentOrgId if not set
  if (!currentOrgId && organizations.length > 0) {
    setCurrentOrg(organizations[0].organization.id);
  }

  return <>{children}</>;
}
