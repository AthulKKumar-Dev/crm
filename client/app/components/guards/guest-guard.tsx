import { Navigate } from "react-router";
import { useAuthStore } from "~/stores/auth.store";

/**
 * Protects /auth/* routes from authenticated users.
 *
 * - Authenticated with orgs → /dashboard
 * - Authenticated without orgs → /onboarding/account-type
 * - Not authenticated → render children (show auth pages)
 */
export function GuestGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, organizations } = useAuthStore();

  if (isAuthenticated && organizations.length > 0) {
    return <Navigate to="/dashboard" replace />;
  }

  if (isAuthenticated && organizations.length === 0) {
    return <Navigate to="/onboarding/account-type" replace />;
  }

  return <>{children}</>;
}
