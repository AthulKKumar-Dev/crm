import { Outlet, Navigate, useLocation } from "react-router";
import { Navbar } from "~/components/app/navbar";
import { ImpersonationBanner } from "~/components/app/impersonation-banner";
import { AuthGuard } from "~/components/guards/auth-guard";
import { useCurrentRole } from "~/hooks/use-current-role";

// Vendors may only reach these sections (the server enforces the real boundary;
// this is UX so a vendor never lands on a forbidden, empty/403 page).
const VENDOR_ALLOWED_PREFIXES = ["/orders", "/products", "/profile"];

export default function AppLayout() {
  const { isVendor } = useCurrentRole();
  const location = useLocation();

  const vendorBlocked =
    isVendor && !VENDOR_ALLOWED_PREFIXES.some((p) => location.pathname.startsWith(p));

  return (
    <AuthGuard>
      <div className="min-h-screen bg-[#f1f7fa] dark:bg-gray-950">
        <ImpersonationBanner />
        <Navbar />
        <main className="mx-auto max-w-screen-xl px-4 py-6 lg:px-6">
          {vendorBlocked ? <Navigate to="/orders" replace /> : <Outlet />}
        </main>
      </div>
    </AuthGuard>
  );
}
