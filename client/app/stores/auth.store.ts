import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { User, OrganizationMembership, AuthOrganization } from "~/types/api";

interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  organizations: OrganizationMembership[];
  currentOrgId: string | null;
}

interface AuthActions {
  setAuth: (
    user: Partial<User> & { id: string; email: string; firstName: string; lastName: string },
    accessToken: string,
    refreshToken: string,
    organizations?: OrganizationMembership[] | AuthOrganization[]
  ) => void;
  setTokens: (accessToken: string, refreshToken: string) => void;
  setOrganizations: (organizations: OrganizationMembership[]) => void;
  setCurrentOrg: (orgId: string) => void;
  logout: () => void;
}

const initialState: AuthState = {
  user: null,
  accessToken: null,
  refreshToken: null,
  isAuthenticated: false,
  organizations: [],
  currentOrgId: null,
};

/**
 * Normalize organizations from backend flat shape to the nested
 * OrganizationMembership shape used throughout the frontend.
 *
 * Backend returns: { id, name, slug, type, role }
 * Frontend needs:  { id, organizationId, role, isActive, organization: { id, name, slug, ... } }
 */
function normalizeOrganizations(
  orgs: OrganizationMembership[] | AuthOrganization[]
): OrganizationMembership[] {
  if (!orgs || orgs.length === 0) return [];

  // Check if it's already in the nested format
  const first = orgs[0] as unknown as Record<string, unknown>;
  if ("organization" in first && typeof first.organization === "object") {
    return orgs as OrganizationMembership[];
  }

  // Convert flat backend shape → nested frontend shape
  return (orgs as AuthOrganization[]).map((o) => ({
    id: crypto.randomUUID(),
    organizationId: o.id,
    role: o.role,
    isActive: true,
    organization: {
      id: o.id,
      name: o.name,
      slug: o.slug,
      type: o.type,
      logo: null,
      timezone: "UTC",
      currency: "USD",
      industry: null,
      website: null,
      billingPlan: "FREE" as const,
      onboardingStatus: "COMPLETED" as const,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  }));
}

/**
 * Fill in missing User fields so the store always has a full User object.
 */
function normalizeUser(
  partial: Partial<User> & { id: string; email: string; firstName: string; lastName: string }
): User {
  return {
    avatarUrl: null,
    emailVerified: false,
    twoFactorEnabled: false,
    lastLoginAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...partial,
  };
}

export const useAuthStore = create<AuthState & AuthActions>()(
  persist(
    (set) => ({
      ...initialState,

      setAuth: (user, accessToken, refreshToken, organizations = []) =>
        set({
          user: normalizeUser(user),
          accessToken,
          refreshToken,
          isAuthenticated: true,
          organizations: normalizeOrganizations(organizations),
        }),

      setTokens: (accessToken, refreshToken) =>
        set({ accessToken, refreshToken }),

      setOrganizations: (organizations) => set({ organizations }),

      setCurrentOrg: (orgId) => set({ currentOrgId: orgId }),

      logout: () => set(initialState),
    }),
    {
      name: "crm-auth",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        isAuthenticated: state.isAuthenticated,
        organizations: state.organizations,
        currentOrgId: state.currentOrgId,
      }),
    }
  )
);
