-- Persist the GST place of supply the ORDER was actually taxed with.
--
-- The order and the invoice each derived place-of-supply independently and
-- could disagree, because the order's chain never consulted the shipping /
-- billing address while the invoice's preferred it. Two live divergences:
--
--   * seller in 27 (MH), customer billing state 27, shipping address in KA
--     → order charged CGST+SGST at the MH rate, invoice computed IGST at the
--       KA rate: different tax head AND different amount.
--   * walk-in with no address, no GSTIN, no billing state
--     → order fell back to the seller's state and charged full rate, while the
--       invoice fell to '00', matched no StateTaxRate row, and computed 0%.
--
-- Storing the resolved code (and the resulting CGST_SGST/IGST split) makes the
-- invoice report what was charged rather than recomputing it from data that may
-- have changed since. Nullable: pre-existing orders have no recorded value and
-- the invoice falls back to the shared resolver for those.

ALTER TABLE "orders"
  ADD COLUMN IF NOT EXISTS "place_of_supply_code" TEXT,
  ADD COLUMN IF NOT EXISTS "gst_type" "GstType";
