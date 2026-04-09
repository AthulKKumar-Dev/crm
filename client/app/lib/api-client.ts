import axios from "axios";
import { useAuthStore } from "~/stores/auth.store";

/**
 * Pre-configured Axios instance for all API communication.
 *
 * - Attaches the access token to every outgoing request.
 * - Unwraps the backend `{ success, data }` envelope automatically.
 * - Performs a silent token refresh on 401 responses (once per request).
 */
export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || "/api/v1",
  headers: { "Content-Type": "application/json" },
  withCredentials: true,
});

// Attach access token to every request
apiClient.interceptors.request.use((config) => {
  const { accessToken } = useAuthStore.getState();
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

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
    if (
      error.response?.status === 401 &&
      !originalRequest._hasRetried
    ) {
      originalRequest._hasRetried = true;

      const { refreshToken, setTokens, logout } = useAuthStore.getState();

      if (refreshToken) {
        try {
          const baseURL =
            import.meta.env.VITE_API_BASE_URL ||
            "/api/v1";

          // Use a raw axios call to avoid interceptor loops
          const res = await axios.post(`${baseURL}/auth/refresh`, {
            refreshToken,
          });

          const tokens = res.data?.data ?? res.data;
          setTokens(tokens.accessToken, tokens.refreshToken);

          originalRequest.headers.Authorization = `Bearer ${tokens.accessToken}`;
          return apiClient(originalRequest);
        } catch {
          logout();
        }
      } else {
        logout();
      }
    }

    return Promise.reject(error);
  }
);
