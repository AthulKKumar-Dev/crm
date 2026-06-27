import { OrderSlip } from "~/components/app/order-slip";

export function meta() {
  return [{ title: "Packing Slip | Collabo CRM" }];
}

export default function PackingSlipPage() {
  return <OrderSlip variant="packing" />;
}
