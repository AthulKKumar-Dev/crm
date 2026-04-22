import { Outlet } from "react-router";
import { Navbar } from "~/components/app/navbar";
import { ImpersonationBanner } from "~/components/app/impersonation-banner";
import { AuthGuard } from "~/components/guards/auth-guard";

export default function AppLayout() {
  return (
    <AuthGuard>
      <div className="min-h-screen bg-[#f1f7fa] dark:bg-gray-950">
        <ImpersonationBanner />
        <Navbar />
        <main className="mx-auto max-w-screen-xl px-4 py-6 lg:px-6">
          <Outlet />
        </main>
      </div>
    </AuthGuard>
  );
}
