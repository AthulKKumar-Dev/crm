import { useState } from "react";
import { Search, UserPlus } from "lucide-react";
import { StatCard } from "~/components/app/stat-card";
import { CUSTOMER_STATS, SAMPLE_CUSTOMERS, type CustomerStatus } from "~/lib/placeholder-data";

export function meta() {
  return [{ title: "Customers | Collabo CRM" }];
}

/* ─── Status display configuration ─────────────────────────────── */

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

/** Ordered list of filter options shown in the status pill bar. */
const STATUS_FILTERS: Array<"All" | CustomerStatus> = ["All", "ACTIVE", "VIP", "AT_RISK", "INACTIVE"];

/** Derive two-letter initials from first and last name. */
function getInitials(first: string, last: string) {
  return `${first[0]}${last[0]}`.toUpperCase();
}

/** Rotating palette for customer avatar backgrounds. */
const AVATAR_COLORS = [
  "bg-blue-100 text-blue-700",
  "bg-purple-100 text-purple-700",
  "bg-[#cdff8c]/30 text-[#4d7a00]",
  "bg-orange-100 text-orange-700",
  "bg-pink-100 text-pink-700",
  "bg-indigo-100 text-indigo-700",
];

/**
 * Customers page — displays customer statistics, status filters,
 * and a searchable table of all customers with avatar initials.
 */
export default function CustomersPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"All" | CustomerStatus>("All");

  /** Filter customers by name/email/location and selected status. */
  const filteredCustomers = SAMPLE_CUSTOMERS.filter((customer) => {
    const fullName = `${customer.firstName} ${customer.lastName}`.toLowerCase();
    const matchesSearch =
      fullName.includes(searchQuery.toLowerCase()) ||
      customer.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      customer.location.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === "All" || customer.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Customers</h1>
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

      {/* Search input and status filter pills */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search by name, email, or location…"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            className="h-8 w-full rounded-lg border border-input bg-white dark:bg-gray-900 pl-8 pr-3 text-xs focus:outline-none focus:ring-2 focus:ring-[#cdff8c]/50"
          />
        </div>
        <div className="flex items-center gap-1.5">
          {STATUS_FILTERS.map((filterValue) => (
            <button
              key={filterValue}
              onClick={() => setStatusFilter(filterValue)}
              className={`h-7 rounded-full px-3 text-xs font-medium transition-colors ${
                statusFilter === filterValue
                  ? "bg-[#cdff8c]/30 text-[#4d7a00]"
                  : "bg-white dark:bg-gray-900 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 border border-input"
              }`}
            >
              {filterValue === "All" ? "All" : STATUS_LABEL[filterValue]}
            </button>
          ))}
        </div>
      </div>

      {/* Customers table */}
      <div className="rounded-xl bg-white dark:bg-gray-900 shadow-sm ring-1 ring-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50/60 dark:bg-gray-800/60 text-left">
                <th className="px-4 py-3 text-xs font-semibold text-muted-foreground">Customer</th>
                <th className="px-4 py-3 text-xs font-semibold text-muted-foreground">Location</th>
                <th className="px-4 py-3 text-xs font-semibold text-muted-foreground text-right">Orders</th>
                <th className="px-4 py-3 text-xs font-semibold text-muted-foreground text-right">Total Spent</th>
                <th className="px-4 py-3 text-xs font-semibold text-muted-foreground">Last Order</th>
                <th className="px-4 py-3 text-xs font-semibold text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredCustomers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-xs text-muted-foreground">
                    No customers match your search.
                  </td>
                </tr>
              ) : (
                filteredCustomers.map((customer, rowIndex) => {
                  const initials = getInitials(customer.firstName, customer.lastName);
                  const avatarColor = AVATAR_COLORS[rowIndex % AVATAR_COLORS.length];
                  return (
                    <tr key={customer.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className={`flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${avatarColor}`}>
                            {initials}
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-medium text-gray-900 dark:text-gray-100">
                              {customer.firstName} {customer.lastName}
                            </p>
                            <p className="text-xs text-muted-foreground">{customer.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{customer.location}</td>
                      <td className="px-4 py-3 text-xs font-medium text-gray-900 dark:text-gray-100 text-right">
                        {customer.orders}
                      </td>
                      <td className="px-4 py-3 text-xs font-semibold text-gray-900 dark:text-gray-100 text-right">
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

        {/* Pagination footer */}
        <div className="flex items-center justify-between border-t px-4 py-3">
          <p className="text-xs text-muted-foreground">
            Showing {filteredCustomers.length} of {SAMPLE_CUSTOMERS.length} customers
          </p>
          <div className="flex items-center gap-1">
            <button className="h-7 rounded-md border border-input bg-white dark:bg-gray-900 px-3 text-xs text-muted-foreground hover:text-gray-900 dark:hover:text-gray-100 disabled:opacity-40" disabled>
              Previous
            </button>
            <button className="h-7 rounded-md border border-input bg-white dark:bg-gray-900 px-3 text-xs text-muted-foreground hover:text-gray-900 dark:hover:text-gray-100 disabled:opacity-40" disabled>
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
