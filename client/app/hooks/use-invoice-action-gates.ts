import { useCurrentRole } from "~/hooks/use-current-role";

/**
 * Which invoice actions the current user may see.
 *
 * Issuing and cancelling a GST invoice are both `@Roles(...ORG_MANAGERS)` on
 * the server (`server/src/invoice/invoice.controller.ts`). Mirror that here so
 * a VIEWER or AGENT isn't shown a button that can only answer 403 — the server
 * remains the actual boundary, this only stops the UI lying about it.
 *
 * The C10 role pass decorated 35 mutating routes but deliberately stopped short
 * of the invoice UI; this is that follow-up.
 *
 * Same three-tier shape as `useOrderActionGates` in
 * `components/app/order-actions.tsx`. Keep both in step with
 * `server/src/auth/decorators/roles.decorator.ts` — a tier that drifts wider
 * than the server's shows a button that can only 403, and one that drifts
 * narrower silently removes an action the user is allowed.
 */
export function useInvoiceActionGates(): {
  canIssue: boolean;
  canCancel: boolean;
} {
  const { role } = useCurrentRole();
  const canManage = role === "OWNER" || role === "ADMIN" || role === "MANAGER"; // ORG_MANAGERS

  return { canIssue: canManage, canCancel: canManage };
}
