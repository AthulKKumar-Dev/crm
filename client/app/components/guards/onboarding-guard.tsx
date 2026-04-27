import { Navigate, useLocation } from "react-router";
import { useAuthStore } from "~/stores/auth.store";

/**
 * Protects /onboarding/* routes.
 *
 * - Not authenticated → /auth/login
 * - Already has organizations AND not on invite-team page → /dashboard
 * - On account-type or create-organization without a pending plan → /onboarding/choose-plan
 * - Otherwise → render children
 *
 * The invite-team page is allowed even with orgs because the user just
 * created their org and is completing the final onboarding step.
 */
export function OnboardingGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, organizations, pendingPlan } = useAuthStore();
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/auth/login" replace />;
  }

  const { pathname } = location;
  const isInvitePage = pathname.includes("invite-team");

  if (organizations.length > 0 && !isInvitePage) {
    return <Navigate to="/dashboard" replace />;
  }

  // A user can only progress past plan selection once pendingPlan is set.
  // Exception: the choose-plan page itself and the invite-team page (org
  // already created, so plan is locked in).
  const requiresPlan =
    pathname.includes("account-type") || pathname.includes("create-organization");

  if (requiresPlan && !pendingPlan) {
    return <Navigate to="/onboarding/choose-plan" replace />;
  }

  return <>{children}</>;
}
