import { Navigate, useLocation } from "react-router";
import { useAuthStore } from "~/stores/auth.store";

/**
 * Protects /onboarding/* routes.
 *
 * - Not authenticated → /auth/login
 * - Already has organizations AND not on invite-team page → /dashboard
 * - Otherwise → render children
 *
 * The invite-team page is allowed even with orgs because the user
 * just created their org and is completing the final onboarding step.
 */
export function OnboardingGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, organizations } = useAuthStore();
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/auth/login" replace />;
  }

  // Allow invite-team page even if orgs exist (user just created one)
  const isInvitePage = location.pathname.includes("invite-team");

  if (organizations.length > 0 && !isInvitePage) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}
