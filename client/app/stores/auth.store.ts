import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { User, OrganizationMembership } from "~/types/api";

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
    user: User,
    accessToken: string,
    refreshToken: string,
    organizations?: OrganizationMembership[]
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

export const useAuthStore = create<AuthState & AuthActions>()(
  persist(
    (set) => ({
      ...initialState,

      setAuth: (user, accessToken, refreshToken, organizations = []) =>
        set({
          user,
          accessToken,
          refreshToken,
          isAuthenticated: true,
          organizations,
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
