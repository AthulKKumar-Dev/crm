import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "~/stores/auth.store";
import { useCurrentRole } from "~/hooks/use-current-role";
import { userService } from "~/services/user.service";
import { canAccessPath, firstAllowedPath, resolveAccess } from "~/lib/sections";
import type { UserRole } from "~/types/api";

/** Fired by the API client when the server refuses a section the UI thought was open. */
export const ACCESS_CHANGED_EVENT = "crm:access-changed";

/**
 * Which paths the current member may open, where they land, and why a nav
 * item is locked. See lib/sections.ts for the rules.
 */
export function useSectionAccess() {
  const { role, grants } = useCurrentRole();
  return useMemo(() => {
    const access = resolveAccess(role, grants);
    return {
      canAccess: (pathname: string) => canAccessPath(access, pathname),
      landingPath: firstAllowedPath(access),
      lockReason:
        role === "VENDOR"
          ? "Not available for vendor accounts"
          : "You don't have access — ask an admin",
    };
  }, [role, grants]);
}

interface ProfileMembership {
  id: string;
  role: UserRole;
  vendorScope?: string | null;
  permissions?: string[];
}

/**
 * Keeps the stored memberships' role and grants in step with the server, so an
 * admin changing someone's access shows up without that person signing in
 * again: re-read every minute, on window focus, and at once when the API
 * refuses a section. Mounted once, in the app layout.
 */
export function useMembershipSync() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const currentOrgId = useAuthStore((s) => s.currentOrgId);

  const { data, refetch } = useQuery({
    queryKey: ["users", "me", "memberships", currentOrgId],
    queryFn: () =>
      userService
        .getProfile()
        .then((p: { organizations?: ProfileMembership[] } | null) => p?.organizations ?? []),
    enabled: isAuthenticated && !!currentOrgId,
    staleTime: 60_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    const onChanged = () => void refetch();
    window.addEventListener(ACCESS_CHANGED_EVENT, onChanged);
    return () => window.removeEventListener(ACCESS_CHANGED_EVENT, onChanged);
  }, [refetch]);

  useEffect(() => {
    if (!data) return;
    const { organizations, setOrganizations } = useAuthStore.getState();
    let changed = false;
    const next = organizations.map((m) => {
      const fresh = data.find((o) => o.id === m.organization.id);
      if (!fresh) return m;
      const permissions = fresh.permissions ?? [];
      const vendorScope = fresh.vendorScope ?? null;
      const same =
        m.role === fresh.role &&
        (m.vendorScope ?? null) === vendorScope &&
        (m.permissions ?? []).join() === permissions.join();
      if (same) return m;
      changed = true;
      return { ...m, role: fresh.role, vendorScope, permissions };
    });
    // Only write on a real difference — a fresh array every minute would
    // re-render everything subscribed to the memberships.
    if (changed) setOrganizations(next);
  }, [data]);
}
