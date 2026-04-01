import { useState } from "react";
import { Search, UserPlus } from "lucide-react";
import { StatCard } from "~/components/app/stat-card";
import { CUSTOMER_STATS, SAMPLE_CUSTOMERS, type CustomerStatus } from "~/lib/placeholder-data";

export function meta() {
  return [{ title: "Customers | Collabo CRM" }];
}

const STATUS_LABEL: Record<CustomerStatus, string> = {
  ACTIVE: "Active",
  INACTIVE: "Inactive",
  VIP: "VIP",
  AT_RISK: "At Risk",
};

const STATUS_CLASS: Record<CustomerStatus, string> = {
  ACTIVE: "bg-[#cdff8c]/30 text-[#4d7a00]",
  INACTIVE: "bg-gray-100 text-gray-500",
  VIP: "bg-purple-100 text-purple-700",
  AT_RISK: "bg-red-100 text-red-700",
};

const STATUS_FILTERS: Array<"All" | CustomerStatus> = ["All", "ACTIVE", "VIP", "AT_RISK", "INACTIVE"];

function getInitials(first: string, last: string) {
  return `${first[0]}${last[0]}`.toUpperCase();
}

const AVATAR_COLORS = [
  "bg-blue-100 text-blue-700",
  "bg-purple-100 text-purple-700",
  "bg-[#cdff8c]/30 text-[#4d7a00]",
  "bg-orange-100 text-orange-700",
  "bg-pink-100 text-pink-700",
  "bg-indigo-100 text-indigo-700",
];

export default function CustomersPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"All" | CustomerStatus>("All");

  const filtered = SAMPLE_CUSTOMERS.filter((c) => {
    const fullName = `${c.firstName} ${c.lastName}`.toLowerCase();
    const matchSearch =
      fullName.includes(search.toLowerCase()) ||
      c.email.toLowerCase().includes(search.toLowerCase()) ||
      c.location.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "All" || c.status === statusFilter;
    return matchSearch && matchStatus;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Customers</h1>
          <p className="text-sm text-muted-foreground">
            View and manage your customer database, segments, and activity.
          </p>
        </div>
        <button className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#cdff8c] px-3 text-xs font-medium text-gray-900 shadow-sm hover:bg-[#b8e87a]">
          <UserPlus className="size-3.5" />
          Add Customer
        </button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {CUSTOMER_STATS.map((stat) => (
          <StatCard key={stat.label} {...stat} />
        ))}
      </div>

      {/* Search + filter row */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search by name, email, or location…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 w-full rounded-lg border border-input bg-white pl-8 pr-3 text-xs focus:outline-none focus:ring-2 focus:ring-[#cdff8c]/50"
          />
        </div>
        <div className="flex items-center gap-1.5">
          {STATUS_FILTERS.map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`h-7 rounded-full px-3 text-xs font-medium transition-colors ${
                statusFilter === s
                  ? "bg-[#cdff8c]/30 text-[#4d7a00]"
                  : "bg-white text-gray-500 hover:text-gray-900 border border-input"
              }`}
            >
              {s === "All" ? "All" : STATUS_LABEL[s]}
            </button>
          ))}
        </div>
      </div>

      {/* Customers table */}
      <div className="rounded-xl bg-white shadow-sm ring-1 ring-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50/60 text-left">
                <th className="px-4 py-3 text-xs font-semibold text-muted-foreground">Customer</th>
                <th className="px-4 py-3 text-xs font-semibold text-muted-foreground">Location</th>
                <th className="px-4 py-3 text-xs font-semibold text-muted-foreground text-right">Orders</th>
                <th className="px-4 py-3 text-xs font-semibold text-muted-foreground text-right">Total Spent</th>
                <th className="px-4 py-3 text-xs font-semibold text-muted-foreground">Last Order</th>
                <th className="px-4 py-3 text-xs font-semibold text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-xs text-muted-foreground">
                    No customers match your search.
                  </td>
                </tr>
              ) : (
                filtered.map((customer, idx) => {
                  const initials = getInitials(customer.firstName, customer.lastName);
                  const avatarColor = AVATAR_COLORS[idx % AVATAR_COLORS.length];
                  return (
                    <tr key={customer.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className={`flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${avatarColor}`}>
                            {initials}
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-medium text-gray-900">
                              {customer.firstName} {customer.lastName}
                            </p>
                            <p className="text-xs text-muted-foreground">{customer.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{customer.location}</td>
                      <td className="px-4 py-3 text-xs font-medium text-gray-900 text-right">
                        {customer.orders}
                      </td>
                      <td className="px-4 py-3 text-xs font-semibold text-gray-900 text-right">
                        ${customer.totalSpent.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{customer.lastOrderDate}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_CLASS[customer.status]}`}>
                          {STATUS_LABEL[customer.status]}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t px-4 py-3">
          <p className="text-xs text-muted-foreground">
            Showing {filtered.length} of {SAMPLE_CUSTOMERS.length} customers
          </p>
          <div className="flex items-center gap-1">
            <button className="h-7 rounded-md border border-input bg-white px-3 text-xs text-muted-foreground hover:text-gray-900 disabled:opacity-40" disabled>
              Previous
            </button>
            <button className="h-7 rounded-md border border-input bg-white px-3 text-xs text-muted-foreground hover:text-gray-900 disabled:opacity-40" disabled>
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
