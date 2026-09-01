-- Record, on the invoice, how the tax it DECLARES compares with the tax the
-- sales channel actually COLLECTED.
--
-- Stored on the invoice rather than derived by joining `orders`, for the same
-- reason `invoices.shipping_charge` was: the invoice is a statutory snapshot
-- and the order can be edited afterwards. A join would silently re-answer a
-- question that was settled at issue time.
--
-- `charged_tax` IS NULL means "never compared" — an offline order with no
-- channel figure, or an invoice issued before this existed. It does NOT mean
-- "compared and equal". No backfill, deliberately.

ALTER TABLE "invoices"
  ADD COLUMN IF NOT EXISTS "charged_tax"        DECIMAL(12,2),
  ADD COLUMN IF NOT EXISTS "tax_mismatch_delta" DECIMAL(12,2),
  ADD COLUMN IF NOT EXISTS "tax_mismatch"       BOOLEAN NOT NULL DEFAULT false;

-- `tax_mismatch` is derivable from the two columns above, but is stored and
-- partially indexed so the filing tab's warning count is one index scan rather
-- than a full table scan with arithmetic.
CREATE INDEX IF NOT EXISTS "invoices_org_tax_mismatch_idx"
  ON "invoices" ("organization_id") WHERE "tax_mismatch";
