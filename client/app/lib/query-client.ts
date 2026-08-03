import { QueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";

/**
 * Should a failed query be retried?
 *
 * Previously the answer was a flat `false`, so a single dropped packet put the
 * page into a failure state with no second attempt — and because a failure was
 * rendered as an empty result, that read to the user as "your store is fine and
 * has no data".
 *
 * Retrying is only worth it when the failure could plausibly resolve itself:
 *   - no response at all (offline, DNS, connection reset) — the classic blip
 *   - 5xx — the server had a moment
 * A 4xx never gets a retry: 401/403/404/409/422 are all statements about the
 * request, not the network, and re-sending wastes the user's time and can
 * compound a rate limit.
 *
 * Exported so it can be exercised directly — the logic is easy to get subtly
 * wrong and it governs every query in the app.
 */
export function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  if (failureCount >= MAX_QUERY_RETRIES) return false;
  if (!isAxiosError(error)) return false;

  const status = error.response?.status;
  if (status === undefined) return true; // never reached the server
  return status >= 500;
}

const MAX_QUERY_RETRIES = 2;

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: shouldRetryQuery,
        retryDelay: (attempt) => Math.min(500 * 2 ** attempt, 4_000),
        refetchOnWindowFocus: false,
      },
    },
  });
}
