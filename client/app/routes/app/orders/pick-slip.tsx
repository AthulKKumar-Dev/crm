import { OrderSlip } from "~/components/app/order-slip";

export function meta() {
  return [{ title: "Pick Slip | Collabo CRM" }];
}

export default function PickSlipPage() {
  return <OrderSlip variant="pick" />;
}
