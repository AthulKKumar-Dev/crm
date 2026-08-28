/**
 * Preview modules — Chat, Campaigns and Logistics ship as UI only. Each runs on a
 * mock store or placeholder data (conversation.service.ts, logistics.service.ts,
 * campaigns-placeholder-data.ts); the server has no Conversation, Shipment or
 * Campaign model at all. Visible while we build them, hidden in anything deployed.
 *
 * Defaults to import.meta.env.DEV: on under `npm run dev`, off in every build.
 * VITE_SHOW_PREVIEW_MODULES=true forces them on for a staging deploy, and "false"
 * forces them off under the dev server, which is how the hidden state is testable
 * without a full production build. Vite bakes VITE_* in at build time, so the var
 * must be set on the BUILD, not on the server running the output.
 */
const override = import.meta.env.VITE_SHOW_PREVIEW_MODULES;

export const showPreviewModules =
  override === "true"
    ? true
    : override === "false"
      ? false
      : import.meta.env.DEV;

/** Route prefixes owned by the preview modules. Chat lives at /conversation. */
const PREVIEW_MODULE_PREFIXES = ["/conversation", "/campaigns", "/logistics"];

/** Prefix match on a segment boundary, so /logistics never matches /logisticsx. */
export function isPreviewPath(pathname: string) {
  return PREVIEW_MODULE_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}
