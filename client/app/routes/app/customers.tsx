import { useState } from "react";
import { Search, UserPlus, ChevronLeft, ChevronRight, Users, UserCheck, UserRoundPlus, DollarSign } from "lucide-react";
import { StatCard } from "~/components/app/stat-card";
import { TableSkeleton } from "~/components/app/table-skeleton";
import { EmptyState } from "~/components/app/empty-state";
import { Skeleton } from "~/components/ui/skeleton";
import { useCustomers, useCustomerStats } from "~/hooks/use-customer-queries";
import type { VipLevel, CustomerListParams } from "~/types/api";

export function meta() {
  return [{ title: "Customers | Collabo CRM" }];
}

const VIP_LABEL: Record<VipLevel, string> = {
  NONE: "Regular",
  BRONZE: "Bronze",
  SILVER: "Silver",
  GOLD: "Gold",
  PLATINUM: "Platinum",
};

const VIP_CLASS: Record<VipLevel, string> = {
  NONE: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  BRONZE: "bg-amber-100 text-amber-700",
  SILVER: "bg-slate-100 text-slate-600",
  GOLD: "bg-yellow-100 text-yellow-700",
  PLATINUM: "bg-purple-100 text-purple-700",
};

const VIP_FILTERS: Array<"All" | VipLevel> = ["All", "NONE", "BRONZE", "SILVER", "GOLD", "PLATINUM"];

function getInitials(first: string, last: string) {
  return `${first[0] ?? ""}${last[0] ?? ""}`.toUpperCase();
}

const AVATAR_COLORS = [
  "bg-blue-100 text-blue-700",
  "bg-purple-100 text-purple-700",
  "bg-[#CEF17B]/30 text-[#084734]",
  "bg-orange-100 text-orange-700",
  "bg-pink-100 text-pink-700",
  "bg-indigo-100 text-indigo-700",
];

const PAGE_SIZE = 12;

export default function CustomersPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [vipFilter, setVipFilter] = useState<"All" | VipLevel>("All");
  const [currentPage, setCurrentPage] = useState(1);

  const params: CustomerListParams = {
    page: currentPage,
    limit: PAGE_SIZE,
    search: searchQuery || undefined,
    vipLevel: vipFilter !== "All" ? vipFilter : undefined,
  };

  const { data, isLoading } = useCustomers(params);
  const { data: stats, isLoading: statsLoading } = useCustomerStats();
  const customers = data?.data ?? [];
  const meta = data?.meta;
  const totalPages = meta?.totalPages ?? 1;

  function handleSearchChange(event: React.ChangeEvent<HTMLInputElement>) {
    setSearchQuery(event.target.value);
    setCurrentPage(1);
  }

  function handleVipFilter(value: "All" | VipLevel) {
    setVipFilter(value);
    setCurrentPage(1);
  }

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
        <button className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#CEF17B] px-3 text-xs font-medium text-gray-900 shadow-sm hover:bg-[#BADE6F]">
          <UserPlus className="size-3.5" />
          Add Customer
        </button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statsLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-xl bg-white dark:bg-gray-900 p-5 shadow-sm ring-1 ring-border">
              <Skeleton className="h-3 w-24 mb-4" />
              <Skeleton className="h-7 w-20" />
            </div>
          ))
        ) : stats ? (
          <>
            <StatCard
              label="Total Customers"
              value={stats.totalCustomers.toLocaleString()}
              change={0}
              icon={<Users className="size-4" />}
            />
            <StatCard
              label="Active Customers"
              value={stats.activeCustomers.toLocaleString()}
              change={0}
              icon={<UserCheck className="size-4" />}
            />
            <StatCard
              label="New This Month"
              value={stats.newCustomers.current.toLocaleString()}
              change={stats.newCustomers.change.direction === "down" ? -stats.newCustomers.change.percentage : stats.newCustomers.change.percentage}
              changeLabel="vs last month"
              icon={<UserRoundPlus className="size-4" />}
            />
            <StatCard
              label="Avg. Order Value"
              value={`$${Number(stats.averageOrderValue).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
              change={0}
              icon={<DollarSign className="size-4" />}
            />
          </>
        ) : (
          <>
            <StatCard label="Total Customers" value="—" change={0} icon={<Users className="size-4" />} />
            <StatCard label="Active Customers" value="—" change={0} icon={<UserCheck className="size-4" />} />
            <StatCard label="New This Month" value="—" change={0} icon={<UserRoundPlus className="size-4" />} />
            <StatCard label="Avg. Order Value" value="—" change={0} icon={<DollarSign className="size-4" />} />
          </>
        )}
      </div>

      {/* Search input and VIP filter pills */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search by name, email, or phone…"
            value={searchQuery}
            onChange={handleSearchChange}
            className="h-8 w-full rounded-lg border border-input bg-white dark:bg-gray-900 pl-8 pr-3 text-xs focus:outline-none focus:ring-2 focus:ring-[#CEF17B]/50"
          />
        </div>
        <div className="flex items-center gap-1.5">
          {VIP_FILTERS.map((filterValue) => (
            <button
              key={filterValue}
              onClick={() => handleVipFilter(filterValue)}
              className={`h-7 rounded-full px-3 text-xs font-medium transition-colors ${
                vipFilter === filterValue
                  ? "bg-[#CEF17B]/30 text-[#084734]"
                  : "bg-white dark:bg-gray-900 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 border border-input"
              }`}
            >
              {filterValue === "All" ? "All" : VIP_LABEL[filterValue]}
            </button>
          ))}
        </div>
      </div>

      {/* Customers table */}
      {isLoading ? (
        <TableSkeleton rows={6} columns={6} />
      ) : customers.length === 0 ? (
        <EmptyState
          title="No customers found"
          description={searchQuery ? "Try adjusting your search or filters." : "Customers will appear here once synced from your channels."}
        />
      ) : (
        <div className="rounded-xl bg-white dark:bg-gray-900 shadow-sm ring-1 ring-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50/60 dark:bg-gray-800/60 text-left">
                  <th className="px-4 py-3 text-xs font-semibold text-muted-foreground">Customer</th>
                  <th className="px-4 py-3 text-xs font-semibold text-muted-foreground">Channel</th>
                  <th className="px-4 py-3 text-xs font-semibold text-muted-foreground text-right">Orders</th>
                  <th className="px-4 py-3 text-xs font-semibold text-muted-foreground text-right">Total Spent</th>
                  <th className="px-4 py-3 text-xs font-semibold text-muted-foreground">VIP Level</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {customers.map((customer, rowIndex) => {
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
                      <td className="px-4 py-3 text-xs text-muted-foreground">{customer.channel?.name ?? "—"}</td>
                      <td className="px-4 py-3 text-xs font-medium text-gray-900 dark:text-gray-100 text-right">
                        {customer.ordersCount}
                      </td>
                      <td className="px-4 py-3 text-xs font-semibold text-gray-900 dark:text-gray-100 text-right">
                        ${Number(customer.totalSpent).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${VIP_CLASS[customer.vipLevel]}`}>
                          {VIP_LABEL[customer.vipLevel]}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination footer */}
          <div className="flex items-center justify-between border-t px-4 py-3">
            <p className="text-xs text-muted-foreground">
              Showing {customers.length} of {meta?.total ?? 0} customers
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
                className="inline-flex items-center gap-1 h-7 rounded-md border border-input bg-white dark:bg-gray-900 px-3 text-xs text-muted-foreground hover:text-gray-900 dark:hover:text-gray-100 disabled:opacity-40 disabled:pointer-events-none"
              >
                <ChevronLeft className="size-3" />
                Previous
              </button>
              <button
                onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                disabled={currentPage >= totalPages}
                className="inline-flex items-center gap-1 h-7 rounded-md border border-input bg-white dark:bg-gray-900 px-3 text-xs text-muted-foreground hover:text-gray-900 dark:hover:text-gray-100 disabled:opacity-40 disabled:pointer-events-none"
              >
                Next
                <ChevronRight className="size-3" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
