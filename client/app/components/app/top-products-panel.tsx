import { LineChart, Line, ResponsiveContainer } from "recharts";
import { Package } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";
import { TOP_PRODUCTS } from "~/lib/placeholder-data";

/** Panel listing the top-selling products with sparkline charts and sales counts. */
export function TopProductsPanel() {
  return (
    <div className="rounded-xl bg-white dark:bg-gray-900 p-5 shadow-sm ring-1 ring-border">
      <div className="mb-4 flex items-start justify-between">
        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Top Selling Products</p>
        <Select defaultValue="weekly">
          <SelectTrigger className="h-7 w-[90px] rounded-md border border-input bg-transparent dark:bg-gray-900 px-2 text-xs text-muted-foreground shadow-none focus:ring-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="weekly">Weekly</SelectItem>
            <SelectItem value="monthly">Monthly</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-4">
        {TOP_PRODUCTS.map((product) => (
          <div key={product.id} className="flex items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-gray-100 dark:bg-gray-800">
              <Package className="size-5 text-muted-foreground" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-gray-900 dark:text-gray-100 leading-tight">
                {product.name}
              </p>
              <p className="text-[11px] text-muted-foreground">
                Brand: <span className="font-medium">{product.brand}</span>
              </p>
              <p className="text-xs font-semibold text-gray-900 dark:text-gray-100">
                ${product.price.toFixed(2)}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <ResponsiveContainer width={60} height={30}>
                <LineChart data={product.sparkline.map((value, pointIndex) => ({ i: pointIndex, v: value }))}>
                  <Line
                    type="monotone"
                    dataKey="v"
                    stroke="#cdff8c"
                    strokeWidth={1.5}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
              <p className="text-[10px] font-semibold text-[#4d7a00]">
                {product.sold.toLocaleString()} sold
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
