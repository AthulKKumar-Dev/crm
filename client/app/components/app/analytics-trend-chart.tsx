import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import type { DashboardTrendPoint } from "~/services/analytics.service";

/**
 * Rendered height. The page's loading skeleton is `h-[260px]` to match — it
 * can't import this constant without statically pulling recharts back in.
 */
const ANALYTICS_TREND_CHART_HEIGHT = 260;

/**
 * Cart / checkout / orders trend lines for the analytics page.
 *
 * Lives in its own file so the page can lazy-load it: recharts is the largest
 * chunk in the app, and the page shell and its data request should not wait
 * for it.
 */
export function AnalyticsTrendChart({ trend }: { trend: DashboardTrendPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={ANALYTICS_TREND_CHART_HEIGHT}>
      <LineChart data={trend} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 11, fill: "#6b7280" }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fontSize: 11, fill: "#6b7280" }}
          axisLine={false}
          tickLine={false}
          allowDecimals={false}
        />
        <Tooltip
          contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Line
          type="monotone"
          dataKey="addToCart"
          name="Add to Cart"
          stroke="#CEF17B"
          strokeWidth={2}
          dot={false}
          animationDuration={300}
        />
        <Line
          type="monotone"
          dataKey="reachedCheckout"
          name="Reached Checkout"
          stroke="#6366f1"
          strokeWidth={2}
          dot={false}
          animationDuration={300}
        />
        <Line
          type="monotone"
          dataKey="completedOrders"
          name="Completed Orders"
          stroke="#f59e0b"
          strokeWidth={2}
          dot={false}
          animationDuration={300}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
