-- Carry the invite form's access choices on the invite itself.
--
-- Inviting an AGENT / VIEWER now picks which app sections they may open
-- (`section.*` grants, see src/auth/permissions.ts). The choice has to survive
-- until the invite is accepted, so it is stored here in the same
-- `{ "grants": [...] }` shape as `organization_members.permissions` and copied
-- across on accept.
--
-- Nullable with no backfill: a pending invite without it is accepted with no
-- grants, which resolves to full section access — the same as every member
-- who joined before section access existed.
--
-- Guarded with IF NOT EXISTS: this schema has known drift from its migration
-- history, so migrations here must be safe to re-apply.

ALTER TABLE "team_invites"
  ADD COLUMN IF NOT EXISTS "permissions" JSONB;
