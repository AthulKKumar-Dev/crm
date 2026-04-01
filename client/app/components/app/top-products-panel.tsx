import { LineChart, Line, ResponsiveContainer } from "recharts";
import { Package } from "lucide-react";
import { TOP_PRODUCTS } from "~/lib/placeholder-data";

export function TopProductsPanel() {
  return (
    <div className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-border">
      <div className="mb-4 flex items-start justify-between">
        <p className="text-sm font-semibold text-gray-900">Top Selling Products</p>
        <select className="rounded-md border border-input bg-transparent px-2 py-0.5 text-xs text-muted-foreground focus:outline-none">
          <option>Weekly</option>
          <option>Monthly</option>
        </select>
      </div>

      <div className="space-y-4">
        {TOP_PRODUCTS.map((product) => (
          <div key={product.id} className="flex items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-gray-100">
              <Package className="size-5 text-muted-foreground" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-gray-900 leading-tight">
                {product.name}
              </p>
              <p className="text-[11px] text-muted-foreground">
                Brand: <span className="font-medium">{product.brand}</span>
              </p>
              <p className="text-xs font-semibold text-gray-900">
                ${product.price.toFixed(2)}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <ResponsiveContainer width={60} height={30}>
                <LineChart data={product.sparkline.map((v, i) => ({ i, v }))}>
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
