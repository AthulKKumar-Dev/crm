import { readTokenOrgId } from "~/lib/jwt";
import { queryClient } from "~/lib/query-client";
import { useAuthStore } from "~/stores/auth.store";

/** localStorage key the auth store persists under — see auth.store.ts. */
const AUTH_STORAGE_KEY = "crm-auth";

type SessionState = {
  user: { id: string } | null;
  accessToken: string | null;
};

/**
 * Who the cached data belongs to: the user plus the org the access token was
 * minted for. The org comes from the TOKEN, not `currentOrgId`, because the
 * server resolves the tenant from the token — that is what decides whose rows
 * a response contains.
 */
function sessionIdentity(state: SessionState): string {
  return `${state.user?.id ?? ""}|${readTokenOrgId(state.accessToken) ?? ""}`;
}

let started = false;

/**
 * Empties the query cache whenever the session identity changes.
 *
 * Query keys carry no user or org id (["orders","list",…], ["dashboard",…]),
 * and the QueryClient outlives a logout because sign-out is an in-app
 * navigation, not a reload. Without this, the next account to sign in on the
 * same tab was served the previous account's orders, customers and invoices —
 * unrefetched for the first 30s (staleTime), and painted first after that.
 *
 * Watching the store, instead of clearing at each call site, covers every way
 * the identity can change — sign out, a 401 logout, login, invite accept,
 * creating or switching organization, impersonation — including ones added
 * later.
 */
export function startSessionCacheGuard() {
  if (started || typeof window === "undefined") return;
  started = true;

  let identity = sessionIdentity(useAuthStore.getState());

  useAuthStore.subscribe((state) => {
    const next = sessionIdentity(state);
    if (next === identity) return;
    identity = next;

    // Drop responses still in flight for the old identity, so they cannot land
    // in the cache after it has been emptied.
    void queryClient.cancelQueries();

    if (state.accessToken) {
      // Signed in as someone (or some org) else: wipe every query back to its
      // empty state and refetch the mounted ones with the new token.
      void queryClient.resetQueries();
    } else {
      // Signed out. Nothing to refetch — just forget the data. Queries only:
      // a mutation may be mid-flight (delete account calls logout from its own
      // onSuccess) and must be left to finish.
      queryClient.removeQueries();
    }
  });

  // Another tab signed out, signed in as someone else or switched org. Adopt
  // that session here too. Otherwise this tab keeps the old one in memory and
  // writes it back over the new session on its next token refresh.
  window.addEventListener("storage", (event) => {
    if (event.key === AUTH_STORAGE_KEY) {
      void useAuthStore.persist.rehydrate();
    }
  });
}
