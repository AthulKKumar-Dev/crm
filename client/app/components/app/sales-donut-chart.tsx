import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { TrendingUp } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";
import { SALES_CHART_DATA } from "~/lib/placeholder-data";

const TOTAL = SALES_CHART_DATA.reduce((sum, entry) => sum + entry.value, 0);

/** Donut chart card showing sales breakdown by category with a legend and totals. */
export function SalesDonutChart() {
  return (
    <div className="rounded-xl bg-white dark:bg-gray-900 p-5 shadow-sm ring-1 ring-border">
      <div className="mb-4 flex items-start justify-between">
        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Total Sales Statistics</p>
        <Select defaultValue="monthly">
          <SelectTrigger className="h-7 w-[95px] rounded-md border border-input bg-transparent dark:bg-gray-900 px-2 text-xs text-muted-foreground shadow-none focus:ring-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="monthly">Monthly</SelectItem>
            <SelectItem value="weekly">Weekly</SelectItem>
            <SelectItem value="yearly">Yearly</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-6">
        <div className="relative shrink-0">
          <ResponsiveContainer width={160} height={160}>
            <PieChart>
              <Pie
                data={SALES_CHART_DATA}
                cx="50%"
                cy="50%"
                innerRadius={52}
                outerRadius={76}
                paddingAngle={3}
                dataKey="value"
                startAngle={90}
                endAngle={-270}
              >
                {SALES_CHART_DATA.map((entry) => (
                  <Cell key={entry.name} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip formatter={(value) => [`$${Number(value).toLocaleString()}`, ""]} />
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
            <p className="text-base font-bold text-gray-900 dark:text-gray-100 leading-tight">
              {TOTAL.toLocaleString()}
            </p>
            <p className="text-[10px] text-muted-foreground leading-tight">Weekly Visits</p>
            <span className="mt-1 inline-flex items-center gap-0.5 rounded-full bg-[#CEF17B]/30 px-1.5 py-0.5 text-[10px] font-semibold text-[#084734]">
              <TrendingUp className="size-2.5" /> 54%
            </span>
          </div>
        </div>

        <div className="flex flex-1 flex-col gap-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] text-muted-foreground">Total Number of Sales</p>
              <p className="text-lg font-bold text-gray-900 dark:text-gray-100">
                ${SALES_CHART_DATA[0].value.toLocaleString()}
              </p>
            </div>
            <div className="flex size-8 items-center justify-center rounded-full border border-gray-100 dark:border-gray-700 text-xs font-bold text-gray-500 dark:text-gray-400">
              S
            </div>
          </div>

          <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
            {SALES_CHART_DATA.map((entry) => (
              <div key={entry.name}>
                <div className="flex items-center gap-1.5">
                  <span className="inline-block size-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
                  <span className="text-xs text-muted-foreground">{entry.name}</span>
                </div>
                <p className="mt-0.5 pl-4 text-xs font-semibold text-gray-900 dark:text-gray-100">
                  ${entry.value.toLocaleString()}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
