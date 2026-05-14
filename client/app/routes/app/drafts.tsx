import { useState } from "react";
import { Link, useNavigate } from "react-router";
import {
  FileText,
  Plus,
  Search,
  ChevronLeft,
  ChevronRight,
  Loader2,
} from "lucide-react";
import { useDraftOrders } from "~/hooks/use-draft-order-queries";
import { useCurrentOrg } from "~/hooks/use-org-queries";
import { useDeleteDraftOrderMutation } from "~/hooks/use-draft-order-mutations";
import { EmptyState } from "~/components/app/empty-state";
import { TableSkeleton } from "~/components/app/table-skeleton";
import { formatCurrency, cn } from "~/lib/utils";
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
  DropdownMenuSeparator,
} from "~/components/ui/dropdown-menu";
import { MoreHorizontal } from "lucide-react";
import type { DraftOrder, DraftOrderListParams, DraftOrderStatus } from "~/types/api";

export function meta() {
  return [{ title: "Drafts | Collabo CRM" }];
}

const PAGE_SIZE = 15;

const STATUS_LABEL: Record<DraftOrderStatus, string> = {
  OPEN: "Open",
  INVOICE_SENT: "Invoice sent",
  COMPLETED: "Completed",
};

const STATUS_CLASS: Record<DraftOrderStatus, string> = {
  OPEN: "bg-blue-100 text-blue-700",
  INVOICE_SENT: "bg-amber-100 text-amber-700",
  COMPLETED: "bg-[#CEF17B]/30 text-[#084734]",
};

export default function DraftsPage() {
  const navigate = useNavigate();
  const { data: org } = useCurrentOrg();
  const currency = org?.currency ?? "INR";

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<DraftOrderStatus | "all">("all");

  const params: DraftOrderListParams = {
    page,
    limit: PAGE_SIZE,
    search: search || undefined,
    status: status === "all" ? undefined : status,
  };

  const { data, isLoading } = useDraftOrders(params);
  const deleteDraft = useDeleteDraftOrderMutation();
  const drafts = data?.data ?? [];
  const meta = data?.meta;
  const totalPages = meta?.totalPages ?? 1;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">
            Drafts
          </h1>
          <p className="text-sm text-muted-foreground">
            In-progress orders and quotes. Edit them anytime, then complete to
            convert into a finalized order.
          </p>
        </div>
        <Link
          to="/drafts/new"
          className="inline-flex items-center gap-1.5 rounded-lg bg-[#CEF17B] px-3 py-2 text-xs font-semibold text-gray-900 hover:bg-[#BADE6F]"
        >
          <Plus className="size-3.5" />
          New draft
        </Link>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search drafts by customer name or email"
            className="h-9 w-full rounded-lg border border-input bg-transparent pl-8 pr-3 text-xs focus:outline-none focus:ring-1 focus:ring-[#CEF17B]/60"
          />
        </div>
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as DraftOrderStatus | "all");
            setPage(1);
          }}
          className="h-9 rounded-lg border border-input bg-white dark:bg-gray-900 px-2 text-xs focus:outline-none focus:ring-1 focus:ring-[#CEF17B]/60"
        >
          <option value="all">All statuses</option>
          <option value="OPEN">Open</option>
          <option value="INVOICE_SENT">Invoice sent</option>
          <option value="COMPLETED">Completed</option>
        </select>
      </div>

      {/* List */}
      {isLoading ? (
        <TableSkeleton rows={6} />
      ) : drafts.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No drafts yet"
          description="Save an order as a draft from the order create page, or start a fresh one from here."
          action={
            <Link
              to="/drafts/new"
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#CEF17B] px-3 py-2 text-xs font-semibold text-gray-900 hover:bg-[#BADE6F]"
            >
              <Plus className="size-3.5" />
              Create draft
            </Link>
          }
        />
      ) : (
        <div className="rounded-xl bg-white dark:bg-gray-900 shadow-sm ring-1 ring-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Draft</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Items</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Updated</TableHead>
                <TableHead className="w-10">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {drafts.map((d) => (
                <DraftRow
                  key={d.id}
                  draft={d}
                  currency={currency}
                  onOpen={() => navigate(`/drafts/${d.id}`)}
                  onDelete={() => deleteDraft.mutate(d.id)}
                  deleting={deleteDraft.isPending && deleteDraft.variables === d.id}
                />
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-xs">
          <p className="text-muted-foreground">
            Page {page} of {totalPages} • {meta?.total ?? 0} drafts
          </p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="inline-flex items-center gap-1 rounded-md border bg-white dark:bg-gray-900 px-2.5 py-1 disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              <ChevronLeft className="size-3" />
              Prev
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="inline-flex items-center gap-1 rounded-md border bg-white dark:bg-gray-900 px-2.5 py-1 disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              Next
              <ChevronRight className="size-3" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function DraftRow({
  draft,
  currency,
  onOpen,
  onDelete,
  deleting,
}: {
  draft: DraftOrder;
  currency: string;
  onOpen: () => void;
  onDelete: () => void;
  deleting: boolean;
}) {
  const customerName = draft.customer
    ? `${draft.customer.firstName ?? ""} ${draft.customer.lastName ?? ""}`.trim() ||
      draft.customer.email ||
      "Unnamed"
    : draft.customerEmail ?? "Anonymous";
  const isCompleted = draft.status === "COMPLETED";

  return (
    <TableRow className="cursor-pointer" onClick={onOpen}>
      <TableCell className="font-medium text-gray-900 dark:text-gray-100">
        {draft.name ?? `Draft ${draft.id.slice(-6)}`}
      </TableCell>
      <TableCell className="text-sm">
        {draft.customer ? (
          customerName
        ) : (
          <span className="text-muted-foreground italic">{customerName}</span>
        )}
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">
        {draft.itemCount} item{draft.itemCount !== 1 ? "s" : ""}
      </TableCell>
      <TableCell className="text-sm font-medium tabular-nums">
        {formatCurrency(draft.totalPrice, currency)}
      </TableCell>
      <TableCell>
        <span
          className={cn(
            "inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium",
            STATUS_CLASS[draft.status],
          )}
        >
          {STATUS_LABEL[draft.status]}
        </span>
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">
        {new Date(draft.updatedAt).toLocaleDateString("en-IN", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        })}
      </TableCell>
      <TableCell onClick={(e) => e.stopPropagation()}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              disabled={deleting}
              className="flex size-7 items-center justify-center rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50"
            >
              {deleting ? (
                <Loader2 className="size-4 animate-spin text-muted-foreground" />
              ) : (
                <MoreHorizontal className="size-4 text-muted-foreground" />
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onOpen}>
              {isCompleted ? "View" : "Open"}
            </DropdownMenuItem>
            {!isCompleted && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete();
                  }}
                >
                  Delete
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
}
