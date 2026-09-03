import { apiClient } from "~/lib/api-client";
import type {
  InwardSuppliesResponse,
  InwardSupply,
  UpsertInwardSupplyRequest,
} from "~/types/api";

/**
 * Payment-supplier fees for a filing period, and the GST claimable on them.
 *
 * Separate from `invoiceService` on purpose: these figures sit BESIDE the
 * return, never inside it. Keeping them on their own service makes it harder
 * for a fee to drift into a return total by accident.
 */
export const inwardSupplyService = {
  /** GET /inward-supplies?financialYear=&period= */
  list: (financialYear: string, period: string) =>
    apiClient
      .get<InwardSuppliesResponse>("/inward-supplies", {
        params: { financialYear, period },
      })
      .then((res) => res.data),

  /**
   * PUT /inward-supplies — create or correct one supplier's figure.
   *
   * PUT because the server keys on (year, period, supplier): re-sending a
   * month's total corrects it rather than adding a row that would double the
   * claim.
   */
  upsert: (data: UpsertInwardSupplyRequest) =>
    apiClient.put<InwardSupply>("/inward-supplies", data).then((res) => res.data),

  /** DELETE /inward-supplies/:id */
  remove: (id: string) =>
    apiClient.delete<{ id: string }>(`/inward-supplies/${id}`).then((res) => res.data),
};
