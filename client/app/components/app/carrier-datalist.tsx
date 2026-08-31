import { CARRIER_SUGGESTIONS } from "~/lib/order-status";

/**
 * The `<datalist>` backing every carrier input on the order detail page.
 *
 * Rendered next to each input rather than once at the page root so a component
 * stays self-contained wherever it is mounted (the vendor view reuses
 * `OrderItemsFulfillment` outside this page). Duplicate ids across two open
 * forms are harmless — both resolve to the same option list — but each caller
 * passes its own `id` so the association is explicit.
 */
export function CarrierDatalist({ id }: { id: string }) {
  return (
    <datalist id={id}>
      {CARRIER_SUGGESTIONS.map((c) => (
        <option key={c} value={c} />
      ))}
    </datalist>
  );
}
