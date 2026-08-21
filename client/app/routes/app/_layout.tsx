import { Outlet, Navigate, useLocation } from "react-router";
import { Navbar } from "~/components/app/navbar";
import { ImpersonationBanner } from "~/components/app/impersonation-banner";
import { AuthGuard } from "~/components/guards/auth-guard";
import { useCurrentRole } from "~/hooks/use-current-role";

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

  return (
    <AuthGuard>
      <div className="min-h-screen bg-surface-sunken">
        <ImpersonationBanner />
        <Navbar />
        <main className="mx-auto max-w-screen-xl px-4 py-6 lg:px-6">
          {vendorBlocked ? <Navigate to="/orders" replace /> : <Outlet />}
        </main>
      </div>
    </AuthGuard>
  );
}
