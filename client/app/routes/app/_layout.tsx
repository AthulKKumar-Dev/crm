import { Outlet, Navigate, useLocation } from "react-router";
import { Navbar } from "~/components/app/navbar";
import { ImpersonationBanner } from "~/components/app/impersonation-banner";
import { AuthGuard } from "~/components/guards/auth-guard";
import { useCurrentRole } from "~/hooks/use-current-role";
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
// in the same max-w-screen-xl container as every other page.
//
// A flex column rather than h-[calc(100vh-Npx)] in the route, because the
// chrome above it is not a fixed height — the navbar is 72px, a sub-nav row
// appears for sections that have children, and ImpersonationBanner adds 40px
// when a super admin is impersonating. Any calc() is wrong in at least one of
// those states; the flex column is exact in all of them with no magic number.
const FULL_HEIGHT_PREFIXES = ["/conversation"];

export default function AppLayout() {
  const { isVendor } = useCurrentRole();
  const location = useLocation();

  const vendorBlocked =
    isVendor &&
    (VENDOR_DENIED_PREFIXES.some((p) => isUnder(location.pathname, p)) ||
      !VENDOR_ALLOWED_PREFIXES.some((p) => isUnder(location.pathname, p)));

  // Print/document routes render bare (no navbar/sidebar) so the app chrome
  // never bleeds into the printed PDF. AuthGuard still gates them.
  const isPrintRoute = /\/(packing-slip|pick-slip|print)$/.test(location.pathname);
  if (isPrintRoute) {
    return (
      <AuthGuard>
        {vendorBlocked ? <Navigate to="/orders" replace /> : <Outlet />}
      </AuthGuard>
    );
  }

  const isFullHeight = FULL_HEIGHT_PREFIXES.some((p) =>
    isUnder(location.pathname, p),
  );

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
        {/* Same container on every route — only the vertical behaviour differs. */}
        <main
          className={cn(
            // Identical container and padding on every route, so the inbox
            // lines up with Orders and Products rather than sitting flush
            // against the navbar.
            "mx-auto w-full max-w-screen-xl px-4 py-6 lg:px-6",
            isFullHeight && "min-h-0 flex-1 overflow-hidden",
          )}
        >
          {vendorBlocked ? <Navigate to="/orders" replace /> : <Outlet />}
        </main>
      </div>
    </AuthGuard>
  );
}
