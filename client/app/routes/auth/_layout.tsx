import { Outlet } from "react-router";
import { Leaf, ShoppingCart, Users, BarChart3, MessageSquare } from "lucide-react";

const FEATURES = [
  { icon: ShoppingCart, text: "Manage orders across every channel" },
  { icon: Users,        text: "Unified customer profiles & history" },
  { icon: BarChart3,    text: "Real-time analytics & reports" },
  { icon: MessageSquare,text: "Centralised conversation inbox" },
];

/**
 * Shared layout for all authentication pages (login, signup, verify, etc.).
 * Renders a split-screen with a brand panel on the left and a form area on the right.
 */
export default function AuthLayout() {
  return (
    <div className="flex min-h-svh bg-[#f1f7fa]">

      {/* ── Left brand panel ─────────────────────────────────── */}
      <div className="hidden lg:flex lg:w-[45%] flex-col justify-between bg-gray-950 p-12 relative overflow-hidden">

        {/* Background accent blob */}
        <div className="pointer-events-none absolute -top-32 -left-32 size-96 rounded-full bg-[#cdff8c]/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -right-16 size-72 rounded-full bg-[#cdff8c]/8 blur-3xl" />

        {/* Logo */}
        <div className="relative flex items-center gap-2.5">
          <div className="flex size-9 items-center justify-center rounded-xl bg-[#cdff8c]">
            <Leaf className="size-4 text-gray-900" />
          </div>
          <span className="text-lg font-bold text-white">Collabo</span>
        </div>

        {/* Centre copy */}
        <div className="relative space-y-8">
          <div>
            <h1 className="text-3xl font-bold leading-tight text-white">
              Unified Commerce,<br />
              <span className="text-[#cdff8c]">Simplified.</span>
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-gray-400">
              One platform for orders, customers, marketing, and conversations —
              across every channel you sell on.
            </p>
          </div>

          {/* Feature list */}
          <ul className="space-y-3">
            {FEATURES.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3">
                <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-[#cdff8c]/15">
                  <Icon className="size-3.5 text-[#cdff8c]" />
                </div>
                <span className="text-sm text-gray-300">{text}</span>
              </li>
            ))}
          </ul>

          {/* Testimonial */}
          <div className="rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
            <p className="text-sm italic text-gray-300">
              "Collabo cut our order processing time in half and gave us a single
              view of every customer across Shopify and Amazon."
            </p>
            <div className="mt-3 flex items-center gap-2.5">
              <div className="flex size-7 items-center justify-center rounded-full bg-[#cdff8c] text-[10px] font-bold text-gray-900">
                JT
              </div>
              <div>
                <p className="text-xs font-semibold text-white">Jessica Thompson</p>
                <p className="text-[10px] text-gray-500">Head of Ops, NovaBrand</p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <p className="relative text-[11px] text-gray-600">
          &copy; {new Date().getFullYear()} Collabo Digital Network. All rights reserved.
        </p>
      </div>

      {/* ── Right form panel ─────────────────────────────────── */}
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-12">
        {/* Mobile logo */}
        <div className="mb-8 flex items-center gap-2 lg:hidden">
          <div className="flex size-8 items-center justify-center rounded-xl bg-[#cdff8c]">
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
  );
}
