import { Outlet, Navigate, useLocation, useMatches } from "react-router";
import { Navbar } from "~/components/app/navbar";
import { ImpersonationBanner } from "~/components/app/impersonation-banner";
import { AuthGuard } from "~/components/guards/auth-guard";
import { useCurrentRole } from "~/hooks/use-current-role";
import { showPreviewModules, isPreviewPath } from "~/lib/feature-flags";
import { cn } from "~/lib/utils";

// Vendors may only reach these sections (the server enforces the real boundary;
// this is UX so a vendor never lands on a forbidden, empty/403 page).
const VENDOR_ALLOWED_PREFIXES = ["/orders", "/products", "/profile"];

// Section sub-pages that are NOT vendor-facing. Checked before the allow list,
// which is a prefix match and would otherwise sweep these in now that Drafts /
// Customers / Invoices live under /orders/* and Inventory under /products/*.
// The inventory entry matters: the API denies vendors every stock endpoint
// (no @AllowVendor), so without this they would reach pages that only 403.
const VENDOR_DENIED_PREFIXES = [
  "/orders/drafts",
  "/orders/customers",
  "/orders/invoices",
  "/products/inventory",
];

/** Prefix match on a segment boundary, so /orders never matches /ordersomething. */
function isUnder(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

// Routes that fill the window height and scroll their own panes instead of the
// page. The inbox needs this so its composer stays pinned and each column
// scrolls independently. It does NOT change the content width — these pages sit
// in the same container as every other page; only the order detail page opts
// out of the shared width (see FULL_WIDTH_ROUTE_IDS below).
//
// A flex column rather than h-[calc(100vh-Npx)] in the route, because the
// chrome above it is not a fixed height — the navbar is 72px, a sub-nav row
// appears for sections that have children, and ImpersonationBanner adds 40px
// when a super admin is impersonating. Any calc() is wrong in at least one of
// those states; the flex column is exact in all of them with no magic number.
const FULL_HEIGHT_PREFIXES = ["/conversation"];

// Routes that drop the shared page width. The order detail page flanks its
// line-items table with two fixed-width rails (200px + 240px), which leaves the
// table cramped once the container caps the row at 1280px.
//
// Matched by route id rather than pathname prefix: "/orders/<x>" is also
// /orders/new, /orders/drafts, /orders/customers and /orders/invoices, so a
// pathname test would need an exclusion list that silently rots as sibling
// routes are added. The id is the route file path minus its extension — see
// routes.ts, where only files reused across several routes declare their own.
//
// The navbar keeps its own max-w-screen-xl, so on a wide viewport this page is
// deliberately wider than the chrome above it.
const FULL_WIDTH_ROUTE_IDS = ["routes/app/orders/$id"];

export default function AppLayout() {
  const { isVendor } = useCurrentRole();
  const location = useLocation();
  // Read before the print-route early return below, so the hook order is the
  // same on every route.
  const matches = useMatches();

  const vendorBlocked =
    isVendor &&
    (VENDOR_DENIED_PREFIXES.some((p) => isUnder(location.pathname, p)) ||
      !VENDOR_ALLOWED_PREFIXES.some((p) => isUnder(location.pathname, p)));

  // Chat / Campaigns / Logistics are UI-only previews running on mock data.
  // The navbar already hides their pills outside dev; this stops a typed or
  // bookmarked URL from rendering placeholder data in a production build.
  const previewBlocked = !showPreviewModules && isPreviewPath(location.pathname);

  // Vendors bounce to /orders (their home), everyone else to /dashboard. Vendor
  // first on purpose: a vendor on /logistics is already outside the allow list
  // and should keep landing where every other blocked vendor route sends them.
  const redirectTo = vendorBlocked ? "/orders" : previewBlocked ? "/dashboard" : null;

  // Print/document routes render bare (no navbar/sidebar) so the app chrome
  // never bleeds into the printed PDF. AuthGuard still gates them.
  const isPrintRoute = /\/(packing-slip|pick-slip|print)$/.test(location.pathname);
  if (isPrintRoute) {
    return (
      <AuthGuard>
        {redirectTo ? <Navigate to={redirectTo} replace /> : <Outlet />}
      </AuthGuard>
    );
  }

  const isFullHeight = FULL_HEIGHT_PREFIXES.some((p) =>
    isUnder(location.pathname, p),
  );

  const isFullWidth = matches.some((m) => FULL_WIDTH_ROUTE_IDS.includes(m.id));

  return (
    <AuthGuard>
      <div
        className={cn(
          "bg-surface-sunken",
          isFullHeight ? "flex h-dvh flex-col overflow-hidden" : "min-h-screen",
        )}
      >
        <ImpersonationBanner />
        <Navbar />
        {/* Same container on every route except a full-width one — otherwise
            only the vertical behaviour differs. */}
        <main
          className={cn(
            // Identical padding on every route, and an identical container on
            // every route but a full-width one, so the inbox lines up with
            // Orders and Products rather than sitting flush against the navbar.
            "mx-auto w-full px-4 py-6 lg:px-6",
            !isFullWidth && "max-w-screen-xl",
            isFullHeight && "min-h-0 flex-1 overflow-hidden",
          )}
        >
          {redirectTo ? <Navigate to={redirectTo} replace /> : <Outlet />}
        </main>
      </div>
    </AuthGuard>
  );
}
