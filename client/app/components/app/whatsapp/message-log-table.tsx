import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { EmptyState } from "~/components/app/empty-state";
import { MessageSquare } from "lucide-react";
import type { WhatsAppMessageLogSample } from "~/lib/campaigns-placeholder-data";
import { WA_STATUS_CLASSES, WA_STATUS_LABELS } from "~/lib/whatsapp-status";
import { formatDateTime } from "~/lib/format-date";
import { cn } from "~/lib/utils";

interface MessageLogTableProps {
  rows: WhatsAppMessageLogSample[];
  emptyDescription?: string;
}

/**
 * Keeps the last four digits and the country code, masks the rest. Delivery
 * logs are routinely read over a shared screen, and a full list of customer
 * numbers is the most sensitive thing on this page.
 */
function maskPhone(phone: string): string {
  if (phone.length <= 7) return phone;
  return `${phone.slice(0, 3)}${"•".repeat(phone.length - 7)}${phone.slice(-4)}`;
}

/**
 * Renders `WhatsAppMessageLog` rows directly.
 *
 * This table is the piece that makes the later backend swap mechanical: the
 * columns are the model's own fields, so pointing it at a real query means
 * changing where `rows` comes from and nothing else.
 */
export function MessageLogTable({ rows, emptyDescription }: MessageLogTableProps) {
  if (rows.length === 0) {
    return (
      <div className="p-8">
        <EmptyState
          icon={MessageSquare}
          title="No messages yet"
          description={
            emptyDescription ??
            "Rows appear here once the send worker starts processing."
          }
        />
      </div>
    );
  }

  const hasErrors = rows.some((row) => row.errorCode);

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>To</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Sent</TableHead>
            <TableHead>Delivered</TableHead>
            <TableHead>Read</TableHead>
            {hasErrors && <TableHead>Error</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id}>
              <TableCell>
                <p className="text-body tabular-nums text-foreground">
                  {maskPhone(row.toPhone)}
                </p>
                {row.externalId && (
                  <p className="text-micro text-muted-foreground">
                    {row.externalId}
                  </p>
                )}
              </TableCell>
              <TableCell>
                <span
                  className={cn(
                    "inline-flex rounded-full px-2 py-0.5 text-caption font-semibold",
                    WA_STATUS_CLASSES[row.status],
                  )}
                >
                  {WA_STATUS_LABELS[row.status]}
                </span>
              </TableCell>
              <TableCell className="text-caption text-muted-foreground">
                {formatDateTime(row.sentAt)}
              </TableCell>
              <TableCell className="text-caption text-muted-foreground">
                {formatDateTime(row.deliveredAt)}
              </TableCell>
              <TableCell className="text-caption text-muted-foreground">
                {formatDateTime(row.readAt)}
              </TableCell>
              {hasErrors && (
                <TableCell>
                  {row.errorCode ? (
                    <div className="max-w-xs">
                      <p className="text-caption font-medium text-danger">
                        {row.errorCode}
                      </p>
                      <p className="text-micro text-muted-foreground">
                        {row.errorMessage}
                      </p>
                    </div>
                  ) : (
                    <span className="text-caption text-muted-foreground">—</span>
                  )}
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
