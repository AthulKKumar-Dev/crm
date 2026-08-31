import { Check, CircleAlert, FileText, Loader2, RefreshCw } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { Button } from "~/components/ui/button";
import { useGenerateAwbMutation } from "~/hooks/use-logistics-mutations";
import { formatAwb } from "~/lib/logistics-format";
import type { ShipmentDetail } from "~/types/api";

/**
 * AWB generation, with its four real states: idle → processing → success →
 * failed/retry.
 *
 * The failed branch matters more than the others. Courier APIs reject bookings
 * for mundane reasons — an unregistered pickup pincode, a weight over the
 * service cap — and the operator needs the courier's own message, not a generic
 * "something went wrong". The store seeds one shipment whose AWB request always
 * fails, so this path stays reachable without editing code.
 */
export function AwbPanel({ shipment }: { shipment: ShipmentDetail }) {
  const generateAwb = useGenerateAwbMutation();

  if (shipment.awb) {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-lg bg-brand/20 px-4 py-3">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-brand text-brand-foreground">
          <Check className="size-4" strokeWidth={3} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-body font-medium text-foreground">
            AWB <span className="font-mono">{formatAwb(shipment.awb)}</span>
          </p>
          <p className="text-caption text-muted-foreground">
            Issued by {shipment.courierName}.
          </p>
        </div>
      </div>
    );
  }

  if (generateAwb.isError) {
    return (
      <Alert variant="danger">
        <CircleAlert />
        <div className="min-w-0 flex-1">
          <AlertTitle>{shipment.courierName} rejected the AWB request</AlertTitle>
          <AlertDescription>
            {generateAwb.error instanceof Error
              ? generateAwb.error.message
              : "The courier did not accept this booking."}
          </AlertDescription>
          <Button
            variant="outline"
            size="sm"
            className="mt-2"
            disabled={generateAwb.isPending}
            onClick={() => generateAwb.mutate(shipment.id)}
          >
            <RefreshCw className="size-3.5" />
            Retry
          </Button>
        </div>
      </Alert>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border px-4 py-3">
      <FileText className="size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <p className="text-body font-medium text-foreground">No AWB yet</p>
        <p className="text-caption text-muted-foreground">
          {shipment.courierId
            ? `Request a tracking number from ${shipment.courierName}.`
            : "Assign a courier first."}
        </p>
      </div>
      <Button
        variant="brand"
        size="sm"
        disabled={!shipment.courierId || generateAwb.isPending}
        onClick={() => generateAwb.mutate(shipment.id)}
      >
        {generateAwb.isPending ? (
          <>
            <Loader2 className="size-3.5 animate-spin" />
            Requesting…
          </>
        ) : (
          <>
            <FileText className="size-3.5" />
            Generate AWB
          </>
        )}
      </Button>
    </div>
  );
}
