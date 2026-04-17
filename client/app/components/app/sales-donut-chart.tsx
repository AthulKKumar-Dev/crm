import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { Loader2 } from "lucide-react";
import { useSalesByCategory } from "~/hooks/use-dashboard-queries";
import { formatCurrency } from "~/lib/utils";

/** Donut chart card showing sales breakdown by product type from real API data. */
export function SalesDonutChart({ currency }: { currency: string }) {
  const { data: salesData, isLoading } = useSalesByCategory();

  const chartData = salesData?.data ?? [];
  const total = salesData?.total ?? 0;

  return (
    <div className="rounded-xl bg-white dark:bg-gray-900 p-5 shadow-sm ring-1 ring-border">
      <div className="mb-4 flex items-start justify-between">
        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Sales by Category</p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : chartData.length === 0 ? (
        <div className="flex items-center justify-center py-16 text-xs text-muted-foreground">
          No sales data available yet
        </div>
      ) : (
        <div className="flex items-center gap-6">
          <div className="relative shrink-0">
            <ResponsiveContainer width={160} height={160}>
              <PieChart>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="50%"
                  innerRadius={52}
                  outerRadius={76}
                  paddingAngle={3}
                  dataKey="value"
                  startAngle={90}
                  endAngle={-270}
                >
                  {chartData.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => [formatCurrency(Number(value), currency), ""]} />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
              <p className="text-base font-bold text-gray-900 dark:text-gray-100 leading-tight">
                {formatCurrency(total, currency, { minimumFractionDigits: 0 })}
              </p>
              <p className="text-[10px] text-muted-foreground leading-tight">Total Sales</p>
            </div>
          </div>

          <div className="flex flex-1 flex-col gap-3">
            <div>
              <p className="text-[10px] text-muted-foreground">Total Sales</p>
              <p className="text-lg font-bold text-gray-900 dark:text-gray-100">
                {formatCurrency(total, currency)}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
              {chartData.map((entry) => (
                <div key={entry.name}>
                  <div className="flex items-center gap-1.5">
                    <span className="inline-block size-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
                    <span className="text-xs text-muted-foreground">{entry.name}</span>
                  </div>
                  <p className="mt-0.5 pl-4 text-xs font-semibold text-gray-900 dark:text-gray-100">
                    {formatCurrency(entry.value, currency, { minimumFractionDigits: 0 })}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
