import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { TrendingUp, TrendingDown, MoreHorizontal, Loader2 } from "lucide-react";
import { useMonthlySales } from "~/hooks/use-dashboard-queries";
import { cn, formatCurrency } from "~/lib/utils";

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ value: number; name: string }>;
  label?: string;
  currency: string;
}

function CustomTooltip({ active, payload, label, currency }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-caption shadow-md">
      <p className="mb-1 font-medium text-popover-foreground">{label}</p>
      {payload.map((entry) => (
        <p key={entry.name} className="text-muted-foreground">
          {entry.name === "profit" ? "Profit" : "Revenue"}:{" "}
          <span className="font-semibold text-popover-foreground">
            {formatCurrency(entry.value, currency)}
          </span>
        </p>
      ))}
    </div>
  );
}

/** Bar chart card showing monthly revenue vs. profit from real API data. */
export function ProfitBarChart({ currency }: { currency: string }) {
  const { data: monthlySales, isLoading } = useMonthlySales();

  const chartData = monthlySales?.data ?? [];
  const totalProfit = monthlySales?.totalProfit ?? 0;

  // Last 30 days against the 30 before it. This used to show the profit margin
  // (profit ÷ revenue) inside a trending-up pill, which could essentially never
  // point down and so always read as growth. `previous === 0` means there is no
  // comparison period yet — the API reports that as a nominal 100% up, so the
  // badge is hidden rather than presenting growth-from-nothing as a trend.
  const trend = monthlySales?.profitTrend;
  const showTrend =
    trend !== undefined && trend.previous !== 0 && trend.change.direction !== "same";
  const isUp = trend?.change.direction === "up";

  return (
    <div className="flex h-full flex-col rounded-xl bg-card p-5 shadow-sm ring-1 ring-border">
      <div className="mb-1 flex items-start justify-between">
        <p className="text-body font-semibold text-foreground">Total Profit Overview</p>
        <button className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-muted">
          <MoreHorizontal className="size-4" />
        </button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          <div className="mb-3 flex items-center gap-2">
            <p className="text-stat text-foreground">
              {formatCurrency(totalProfit, currency)}
            </p>
            {showTrend && (
              <>
                <span
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-caption font-semibold",
                    isUp ? "bg-ink text-brand" : "bg-danger-subtle text-danger"
                  )}
                >
                  {isUp ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
                  {trend.change.percentage}%
                </span>
                {/* The figure beside it is the 12-month total that the bars add
                    up to, so the badge has to say which period it covers. */}
                <span className="text-caption text-muted-foreground">vs. previous 30 days</span>
              </>
            )}
          </div>

          <div className="mb-3 flex items-center gap-4 text-caption text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="inline-block size-2 rounded-full bg-border" />
              Total Revenue
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block size-2 rounded-full bg-brand" />
              Total Profit
            </span>
          </div>

          {chartData.length > 0 ? (
            <div className="min-h-40 flex-1">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} barGap={3} barCategoryGap="35%">
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis
                    dataKey="month"
                    tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis hide />
                  <Tooltip content={<CustomTooltip currency={currency} />} cursor={{ fill: "rgba(0,0,0,0.04)" }} />
                  <Bar dataKey="revenue" fill="var(--border)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="profit" fill="var(--brand)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="flex items-center justify-center py-8 text-caption text-muted-foreground">
              No sales data available yet
            </div>
          )}
        </>
      )}
    </div>
  );
}
