import { MoreHorizontal, Package } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { cn } from "~/lib/utils";
import type { Order, OrderStatus } from "~/lib/placeholder-data";

const STATUS_CLASSES: Record<OrderStatus, string> = {
  COMPLETED: "bg-[#cdff8c]/30 text-[#4d7a00]",
  IN_PROGRESS: "bg-blue-100 text-blue-700",
  WAITING: "bg-orange-100 text-orange-600",
  CANCELLED: "bg-red-100 text-red-600",
};

const STATUS_LABELS: Record<OrderStatus, string> = {
  COMPLETED: "Completed",
  IN_PROGRESS: "In Progress",
  WAITING: "Waiting",
  CANCELLED: "Cancelled",
};

interface OrdersTableProps {
  orders: Order[];
  showCustomerName?: boolean;
}

/** Renders a data table of orders with status badges, product info, and row-level actions. */
export function OrdersTable({ orders, showCustomerName = false }: OrdersTableProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className="w-8">
            <input type="checkbox" className="rounded border-border" />
          </TableHead>
          <TableHead>Order ID</TableHead>
          <TableHead>Product Name</TableHead>
          {showCustomerName && <TableHead>Customer Name</TableHead>}
          <TableHead>Date</TableHead>
          <TableHead>Payment</TableHead>
          <TableHead>Amount</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="w-10">Action</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {orders.map((order) => (
          <TableRow key={order.id}>
            <TableCell>
              <input type="checkbox" className="rounded border-border" />
            </TableCell>
            <TableCell className="font-medium text-gray-900 dark:text-gray-100">
              {order.status === "COMPLETED" && (
                <span className="mr-1.5 inline-block size-4 rounded-full bg-[#cdff8c]/30 text-[#4d7a00] text-center text-[10px] leading-4">✓</span>
              )}
              {order.id}
            </TableCell>
            <TableCell>
              <div className="flex items-center gap-2">
                <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-gray-100 dark:bg-gray-800">
                  <Package className="size-4 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100 leading-tight">
                    {order.productName}
                  </p>
                  {order.variantCount > 0 && (
                    <p className="text-xs text-muted-foreground">
                      +{order.variantCount} other product{order.variantCount > 1 ? "s" : ""}
                    </p>
                  )}
                </div>
              </div>
            </TableCell>
            {showCustomerName && (
              <TableCell className="text-sm">{order.customerName}</TableCell>
            )}
            <TableCell className="text-sm text-muted-foreground">{order.date}</TableCell>
            <TableCell className="text-sm text-muted-foreground">{order.payment}</TableCell>
            <TableCell className="text-sm font-medium">
              ${order.amount.toFixed(2)}
            </TableCell>
            <TableCell>
              <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", STATUS_CLASSES[order.status])}>
                {STATUS_LABELS[order.status]}
              </span>
            </TableCell>
            <TableCell>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="flex size-7 items-center justify-center rounded-md hover:bg-gray-100 dark:hover:bg-gray-800">
                    <MoreHorizontal className="size-4 text-muted-foreground" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem>View details</DropdownMenuItem>
                  <DropdownMenuItem>Edit order</DropdownMenuItem>
                  <DropdownMenuItem variant="destructive">Cancel order</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
