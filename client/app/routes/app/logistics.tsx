import {
  Truck, PackageCheck, Clock, Timer, MapPin, ExternalLink,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { StatCard } from "~/components/app/stat-card";
import { PreviewNotice } from "~/components/app/preview-notice";
import { cn } from "~/lib/utils";

export function meta() {
  return [{ title: "Logistics | Collabo CRM" }];
}

/* ─── Static data ─────────────────────────────────────────────────
   Sample values only. This page has no backend: there is no shipment
   model and no carrier integration anywhere in the app. The closest
   real data is the per-order tracking fields on OrderFulfillment,
   already surfaced on the order detail screen. Wire this up before
   treating any figure below as real.
   ──────────────────────────────────────────────────────────────── */

const LOGISTICS_STATS = [
  { label: "In transit", value: "128", change: 12, changeLabel: "vs last week", icon: <Truck className="size-4" /> },
  { label: "Delivered this month", value: "1,046", change: 8, changeLabel: "vs last month", icon: <PackageCheck className="size-4" /> },
  { label: "Awaiting pickup", value: "37", change: -15, changeLabel: "vs last week", icon: <Clock className="size-4" /> },
  { label: "Avg delivery time", value: "3.2 days", change: -6, changeLabel: "vs last month", icon: <Timer className="size-4" /> },
];

type ShipmentStatus = "IN_TRANSIT" | "OUT_FOR_DELIVERY" | "DELIVERED" | "PENDING" | "EXCEPTION";

const SHIPMENTS: Array<{
  id: string;
  order: string;
  customer: string;
  carrier: string;
  awb: string;
  destination: string;
  status: ShipmentStatus;
  updated: string;
}> = [
  { id: "1", order: "#302012", customer: "Cameron Williamson", carrier: "Shiprocket", awb: "SR4820193772", destination: "Kochi, KL", status: "IN_TRANSIT", updated: "2h ago" },
  { id: "2", order: "#301997", customer: "Brooklyn Simmons", carrier: "Delhivery", awb: "DL9927481003", destination: "Bengaluru, KA", status: "OUT_FOR_DELIVERY", updated: "40m ago" },
  { id: "3", order: "#301962", customer: "Darlene Robertson", carrier: "Blue Dart", awb: "BD1120459983", destination: "Mumbai, MH", status: "DELIVERED", updated: "Yesterday" },
  { id: "4", order: "#301944", customer: "Courtney Henry", carrier: "Shiprocket", awb: "SR4820188120", destination: "Chennai, TN", status: "EXCEPTION", updated: "5h ago" },
  { id: "5", order: "#301899", customer: "Kathryn Murphy", carrier: "DTDC", awb: "DT7781002934", destination: "Hyderabad, TS", status: "PENDING", updated: "1d ago" },
  { id: "6", order: "#301877", customer: "Ronald Richards", carrier: "Delhivery", awb: "DL9927470551", destination: "Pune, MH", status: "DELIVERED", updated: "2d ago" },
];

const CARRIER_PERFORMANCE = [
  { name: "Shiprocket", delivered: 412, delayed: 24 },
  { name: "Delhivery", delivered: 388, delayed: 17 },
  { name: "Blue Dart", delivered: 194, delayed: 6 },
  { name: "DTDC", delivered: 52, delayed: 9 },
];

const STATUS_CONFIG: Record<ShipmentStatus, { label: string; className: string }> = {
  PENDING: { label: "Awaiting pickup", className: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400" },
  IN_TRANSIT: { label: "In transit", className: "bg-blue-100 text-blue-700" },
  OUT_FOR_DELIVERY: { label: "Out for delivery", className: "bg-amber-100 text-amber-700" },
  DELIVERED: { label: "Delivered", className: "bg-[#CEF17B]/40 text-[#084734]" },
  EXCEPTION: { label: "Exception", className: "bg-red-100 text-red-700" },
};

export default function LogisticsPage() {
  return (
    <div className="space-y-6">

      <PreviewNotice>
        Preview — these shipments are sample data, not your account. No carrier is
        connected; real tracking numbers live on each fulfillment inside an order.
      </PreviewNotice>

      {/* Page header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Logistics</h1>
          <p className="text-sm text-muted-foreground">
            Track shipments, carriers, and delivery performance in one place.
          </p>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {LOGISTICS_STATS.map((stat) => (
          <StatCard
            key={stat.label}
            label={stat.label}
            value={stat.value}
            change={stat.change}
            changeLabel={stat.changeLabel}
            icon={stat.icon}
          />
        ))}
      </div>

      {/* Carrier performance */}
      <div className="rounded-xl bg-white dark:bg-gray-900 p-5 shadow-sm ring-1 ring-border">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          Carrier performance
        </h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Delivered against delayed shipments, last 30 days.
        </p>
        <div className="mt-4 h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={CARRIER_PERFORMANCE}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border" />
              <XAxis dataKey="name" tickLine={false} axisLine={false} className="text-[10px]" />
              <YAxis tickLine={false} axisLine={false} className="text-[10px]" />
              <Tooltip cursor={{ fill: "rgba(0,0,0,0.04)" }} />
              <Bar dataKey="delivered" fill="#CEF17B" radius={[4, 4, 0, 0]} />
              <Bar dataKey="delayed" fill="#F5A3A3" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Shipments table */}
      <div className="overflow-x-auto rounded-xl bg-white dark:bg-gray-900 shadow-sm ring-1 ring-border">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b text-muted-foreground">
              <th className="px-4 py-2.5 font-medium">Order</th>
              <th className="px-4 py-2.5 font-medium">Customer</th>
              <th className="px-4 py-2.5 font-medium">Carrier</th>
              <th className="px-4 py-2.5 font-medium">AWB</th>
              <th className="px-4 py-2.5 font-medium">Destination</th>
              <th className="px-4 py-2.5 font-medium">Status</th>
              <th className="px-4 py-2.5 font-medium">Updated</th>
            </tr>
          </thead>
          <tbody>
            {SHIPMENTS.map((shipment) => {
              const status = STATUS_CONFIG[shipment.status];
              return (
                <tr key={shipment.id} className="border-b last:border-0">
                  <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100">{shipment.order}</td>
                  <td className="px-4 py-3">{shipment.customer}</td>
                  <td className="px-4 py-3">{shipment.carrier}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1 font-mono text-[11px] text-muted-foreground">
                      {shipment.awb}
                      <ExternalLink className="size-3" />
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1 text-muted-foreground">
                      <MapPin className="size-3" />
                      {shipment.destination}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium", status.className)}>
                      {status.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{shipment.updated}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

    </div>
  );
}
