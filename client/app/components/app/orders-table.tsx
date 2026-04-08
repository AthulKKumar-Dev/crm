import { MoreHorizontal, Package, Receipt } from "lucide-react";
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { cn } from "~/lib/utils";
import type { Order, FinancialStatus, FulfillmentStatus } from "~/types/api";

const FINANCIAL_CLASSES: Record<FinancialStatus, string> = {
  PAID: "bg-[#CEF17B]/30 text-[#084734]",
  PARTIALLY_PAID: "bg-blue-100 text-blue-700",
  PENDING: "bg-orange-100 text-orange-600",
  AUTHORIZED: "bg-blue-100 text-blue-700",
  PARTIALLY_REFUNDED: "bg-yellow-100 text-yellow-700",
  REFUNDED: "bg-gray-100 text-gray-600",
  VOIDED: "bg-red-100 text-red-600",
};

const FINANCIAL_LABELS: Record<FinancialStatus, string> = {
  PAID: "Paid",
  PARTIALLY_PAID: "Partial",
  PENDING: "Pending",
  AUTHORIZED: "Authorized",
  PARTIALLY_REFUNDED: "Partial Refund",
  REFUNDED: "Refunded",
  VOIDED: "Voided",
};

const FULFILLMENT_CLASSES: Record<FulfillmentStatus, string> = {
  FULFILLED: "bg-[#CEF17B]/30 text-[#084734]",
  PARTIAL: "bg-blue-100 text-blue-700",
  UNFULFILLED: "bg-orange-100 text-orange-600",
  RESTOCKED: "bg-gray-100 text-gray-600",
};

const FULFILLMENT_LABELS: Record<FulfillmentStatus, string> = {
  FULFILLED: "Fulfilled",
  PARTIAL: "Partial",
  UNFULFILLED: "Unfulfilled",
  RESTOCKED: "Restocked",
};

type OrderRow = Pick<Order, "id" | "name" | "financialStatus" | "fulfillmentStatus" | "currency" | "totalPrice" | "itemCount" | "createdAt" | "customer">;

interface OrdersTableProps {
  orders: OrderRow[];
  showCustomerName?: boolean;
  onViewDetail?: (orderId: string) => void;
  onGenerateInvoice?: (orderId: string) => void;
  gstEnabled?: boolean;
}

/** Renders a data table of orders with financial/fulfillment status badges and row-level actions. */
export function OrdersTable({ orders, showCustomerName = false, onViewDetail, onGenerateInvoice, gstEnabled = false }: OrdersTableProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className="w-8">
            <input type="checkbox" className="rounded border-border" />
          </TableHead>
          <TableHead>Order</TableHead>
          <TableHead>Items</TableHead>
          {showCustomerName && <TableHead>Customer</TableHead>}
          <TableHead>Date</TableHead>
          <TableHead>Amount</TableHead>
          <TableHead>Payment</TableHead>
          <TableHead>Fulfillment</TableHead>
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
              {order.financialStatus === "PAID" && (
                <span className="mr-1.5 inline-block size-4 rounded-full bg-[#CEF17B]/30 text-[#084734] text-center text-[10px] leading-4">✓</span>
              )}
              {order.name}
            </TableCell>
            <TableCell>
              <div className="flex items-center gap-2">
                <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-gray-100 dark:bg-gray-800">
                  <Package className="size-4 text-muted-foreground" />
                </div>
                <span className="text-sm text-muted-foreground">
                  {order.itemCount} item{order.itemCount !== 1 ? "s" : ""}
                </span>
              </div>
            </TableCell>
            {showCustomerName && (
              <TableCell className="text-sm">
                {order.customer.firstName} {order.customer.lastName}
              </TableCell>
            )}
            <TableCell className="text-sm text-muted-foreground">
              {new Date(order.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
            </TableCell>
            <TableCell className="text-sm font-medium">
              {order.currency} {Number(order.totalPrice).toFixed(2)}
            </TableCell>
            <TableCell>
              <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", FINANCIAL_CLASSES[order.financialStatus])}>
                {FINANCIAL_LABELS[order.financialStatus]}
              </span>
            </TableCell>
            <TableCell>
              <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", FULFILLMENT_CLASSES[order.fulfillmentStatus])}>
                {FULFILLMENT_LABELS[order.fulfillmentStatus]}
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
                  <DropdownMenuItem onClick={() => onViewDetail?.(order.id)}>View details</DropdownMenuItem>
                  <DropdownMenuItem>Edit order</DropdownMenuItem>
                  {gstEnabled && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => onGenerateInvoice?.(order.id)}>
                        <Receipt className="mr-1.5 size-3.5" />
                        Generate GST Invoice
                      </DropdownMenuItem>
                    </>
                  )}
                  <DropdownMenuSeparator />
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
