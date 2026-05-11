import { Outlet } from "react-router";
import { Leaf, ShoppingCart, Users, BarChart3, MessageSquare } from "lucide-react";
import { GuestGuard } from "~/components/guards/guest-guard";
import { BrandCarousel } from "~/components/app/auth/brand-carousel";

const FEATURES = [
  { icon: ShoppingCart, text: "Manage orders across every channel" },
  { icon: Users, text: "Unified customer profiles & history" },
  { icon: BarChart3, text: "Real-time analytics & reports" },
  { icon: MessageSquare, text: "Centralised conversation inbox" },
];

/**
 * Shared layout for all authentication pages (login, signup, verify, etc.).
 * Renders a split-screen with a brand panel on the left and a form area on the right.
 */
export default function AuthLayout() {
  return (
    <GuestGuard>
      <div className="flex min-h-svh bg-[#f1f7fa] p-6">

        {/* ── Left brand panel ─────────────────────────────────── */}
        <div className="hidden lg:flex lg:w-[50%] flex-col justify-between rounded-4xl bg-[linear-gradient(215deg,_#000000_46%,_#94E802_100%)] p-12 relative overflow-hidden">
          <BrandCarousel className="h-full w-full" />

        </div>

        {/* ── Right form panel ─────────────────────────────────── */}
        <div className="flex flex-1 flex-col items-center justify-center px-6 py-12">
          {/* Mobile logo */}
          <div className="mb-8 flex items-center gap-2 lg:hidden">
            <div className="flex size-8 items-center justify-center rounded-xl bg-[#CEF17B]">
              <Leaf className="size-4 text-gray-900" />
            </div>
            <span className="text-base font-bold text-gray-900">Collabo</span>
          </div>

          <div className="w-full max-w-[400px]">
            <Outlet />
          </div>

          <p className="mt-8 text-center text-xs text-gray-400">
            &copy; {new Date().getFullYear()} Collabo Digital Network
          </p>
        </div>
      </div>
    </GuestGuard>
  );
}
