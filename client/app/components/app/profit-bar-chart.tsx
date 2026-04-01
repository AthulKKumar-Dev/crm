import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { TrendingUp, MoreHorizontal } from "lucide-react";
import { PROFIT_CHART_DATA } from "~/lib/placeholder-data";

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ value: number; name: string }>;
  label?: string;
}

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-medium text-popover-foreground">{label}</p>
      {payload.map((entry) => (
        <p key={entry.name} className="text-muted-foreground">
          {entry.name === "profit" ? "Profit" : "Revenue"}:{" "}
          <span className="font-semibold text-popover-foreground">
            ${entry.value.toLocaleString()}
          </span>
        </p>
      ))}
    </div>
  );
}

export function ProfitBarChart() {
  return (
    <div className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-border">
      <div className="mb-1 flex items-start justify-between">
        <p className="text-sm font-semibold text-gray-900">Total Profit Overview</p>
        <button className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-gray-100">
          <MoreHorizontal className="size-4" />
        </button>
      </div>

      <div className="mb-3 flex items-center gap-2">
        <p className="text-2xl font-bold text-gray-900">$96,715.28</p>
        <span className="inline-flex items-center gap-1 rounded-full bg-[#cdff8c]/30 px-2 py-0.5 text-xs font-semibold text-[#4d7a00]">
          <TrendingUp className="size-3" />
          54%
        </span>
      </div>

      <div className="mb-3 flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="inline-block size-2 rounded-full bg-gray-300" />
          Total Revenue
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block size-2 rounded-full bg-orange-400" />
          Total Profit
        </span>
      </div>

      <ResponsiveContainer width="100%" height={160}>
        <BarChart data={PROFIT_CHART_DATA} barGap={3} barCategoryGap="35%">
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
          <XAxis
            dataKey="month"
            tick={{ fontSize: 10, fill: "#9ca3af" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis hide />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(0,0,0,0.04)" }} />
          <Bar dataKey="revenue" fill="#e5e7eb" radius={[4, 4, 0, 0]} />
          <Bar dataKey="profit"  fill="#fb923c" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
