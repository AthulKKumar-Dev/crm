import { Outlet } from "react-router";
import { Navbar } from "~/components/app/navbar";

export default function AppLayout() {
  return (
    <div className="min-h-screen bg-[#f1f7fa]">
      <Navbar />
      <main className="mx-auto max-w-screen-xl px-4 py-6 lg:px-6">
        <Outlet />
      </main>
    </div>
  );
}
