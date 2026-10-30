import axios from "axios";
import { useAuthStore } from "~/stores/auth.store";

/**
 * Where the API lives.
 *
 * VITE_API_BASE_URL wins when it is an absolute URL. A production build that
 * reaches here with nothing usable (the variable unset, blank, or relative,
 * as happens when a hosting dashboard defines it empty and so overrides
 * .env.production) must still talk to the real API: the SPA host answers
 * every /api/v1 call with index.html, which crashed the app on first load.
 * Dev keeps the relative base so the Vite proxy / local API apply.
 */
const PRODUCTION_API_BASE_URL = "https://api.collabo.store/api/v1";

function resolveApiBaseUrl(): string {
  const configured = (import.meta.env.VITE_API_BASE_URL ?? "").trim();
  const isAbsolute = configured.startsWith("http://") || configured.startsWith("https://");
  if (isAbsolute) return configured.endsWith("/") ? configured.slice(0, -1) : configured;
  return import.meta.env.PROD ? PRODUCTION_API_BASE_URL : "/api/v1";
}

export const API_BASE_URL = resolveApiBaseUrl();

/**
 * Pre-configured Axios instance for all API communication.
 *
 * - Attaches the access token to every outgoing request.
 * - Unwraps the backend `{ success, data }` envelope automatically.
 * - Performs a silent token refresh on 401 responses (once per request).
 */
export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: { "Content-Type": "application/json" },
  withCredentials: true,
  timeout: 30_000,
});

// Attach access token to every request
apiClient.interceptors.request.use((config) => {
  const { accessToken } = useAuthStore.getState();
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

/**
 * Single-flight refresh guard.
 *
 * When several requests 401 at the same time (e.g. on a page refresh after the
 * access token has expired), they must NOT each call `/auth/refresh` — the
 * server rotates refresh tokens single-use, so the first call invalidates the
 * token the others are holding and they would be logged out. Instead, the first
 * 401 starts one refresh and every other concurrent 401 awaits the same promise.
 */
let refreshPromise: Promise<string> | null = null;

/**
 * The session was replaced while a refresh was in flight — the user signed
 * out, signed in as someone else, or switched organization. The refresh result
 * belongs to the OLD session and must be dropped, not applied.
 */
class SessionChangedError extends Error {
  constructor() {
    super("Session changed during token refresh");
  }
}

/** Refresh the access token using the stored refresh token. Returns the new access token. */
async function refreshAccessToken(): Promise<string> {
  const { refreshToken, setTokens } = useAuthStore.getState();
  if (!refreshToken) {
    throw new Error("No refresh token");
  }
  const sessionChanged = () =>
    useAuthStore.getState().refreshToken !== refreshToken;

  let res;
  try {
    // Use a raw axios call to avoid interceptor loops
    res = await axios.post(`${API_BASE_URL}/auth/refresh`, { refreshToken });
  } catch (error) {
    // A failure for the old session says nothing about the new one.
    if (sessionChanged()) throw new SessionChangedError();
    throw error;
  }

  // Writing these would put the previous account's (or org's) tokens back on
  // top of the session that replaced it.
  if (sessionChanged()) throw new SessionChangedError();

  const tokens = res.data?.data ?? res.data;
  setTokens(tokens.accessToken, tokens.refreshToken);
  return tokens.accessToken;
}

// Unwrap backend response envelope: { success: true, data: T } → T
apiClient.interceptors.response.use(
  (response) => {
    if (response.data?.success && "data" in response.data) {
      response.data = response.data.data;
    }
    return response;
  },
  async (error) => {
    const originalRequest = error.config;

    // Attempt silent token refresh on 401 (only once per request)
    if (error.response?.status === 401 && !originalRequest._hasRetried) {
      originalRequest._hasRetried = true;

      try {
        // Single-flight: first 401 starts the refresh; others await the same promise.
        refreshPromise = refreshPromise ?? refreshAccessToken();
        const newAccessToken = await refreshPromise;

        originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
        return apiClient(originalRequest);
      } catch (refreshError) {
        // Only end the session the failed refresh belonged to. If it has
        // already been replaced, this request is simply abandoned.
        if (!(refreshError instanceof SessionChangedError)) {
          useAuthStore.getState().logout();
        }
        return Promise.reject(error);
      } finally {
        // Reset so the next genuine expiry can refresh again.
        refreshPromise = null;
      }
    }

    // The server refused a section the UI still showed as open — an admin
    // changed this member's access. Re-sync it (see useMembershipSync) so the
    // nav locks and the layout redirects without waiting for the next poll.
    const message = error.response?.data?.message;
    if (
      error.response?.status === 403 &&
      typeof message === "string" &&
      message.startsWith("Section access denied") &&
      typeof window !== "undefined"
    ) {
      window.dispatchEvent(new Event("crm:access-changed"));
    }

    return Promise.reject(error);
  }
);
