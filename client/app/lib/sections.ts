import { showPreviewModules } from "~/lib/feature-flags";
import { useAuthStore } from "~/stores/auth.store";
import type { UserRole } from "~/types/api";

/**
 * App sections a member can be given access to — the single source of truth
 * for the navbar's locked pills, the layout's route redirect, the post-login
 * landing page and the invite form's checkboxes.
 *
 * Mirrors `SECTION_KEYS` in server/src/auth/permissions.ts: a member's grant
 * list carries `section.<id>` for each section they may open. The server
 * enforces the same rule on each section's API; this file is the UX half, so
 * nobody lands on a page that would only 403.
 */
export type SectionId =
  | "dashboard"
  | "orders"
  | "customers"
  | "invoices"
  | "products"
  | "chat"
  | "campaigns"
  | "logistics"
  | "analytics";

interface SectionDef {
  id: SectionId;
  label: string;
  /** Route prefix the section owns. Customers and Invoices sit under /orders. */
  prefix: string;
  /** Preview module — absent from builds without them (see feature-flags.ts). */
  preview?: boolean;
}

/** Nav order: also the order the landing page is picked in. */
const SECTIONS: SectionDef[] = [
  { id: "dashboard", label: "Dashboard", prefix: "/dashboard" },
  { id: "orders", label: "Orders", prefix: "/orders" },
  { id: "customers", label: "Customers", prefix: "/orders/customers" },
  { id: "invoices", label: "Invoices", prefix: "/orders/invoices" },
  { id: "products", label: "Products", prefix: "/products" },
  { id: "chat", label: "Chat", prefix: "/conversation", preview: true },
  { id: "campaigns", label: "Campaigns", prefix: "/campaigns", preview: true },
  { id: "logistics", label: "Logistics", prefix: "/logistics", preview: true },
  { id: "analytics", label: "Analytics", prefix: "/analytics" },
];

/** The sections this build actually has. */
export const AVAILABLE_SECTIONS: SectionDef[] = showPreviewModules
  ? SECTIONS
  : SECTIONS.filter((s) => !s.preview);

const SECTION_PREFIX = "section.";

export const sectionKey = (id: SectionId) => `${SECTION_PREFIX}${id}`;

/** Section ids named in a grant list (other grant families are ignored). */
export function sectionsInGrants(grants: readonly string[]): SectionId[] {
  return grants
    .filter((g) => g.startsWith(SECTION_PREFIX))
    .map((g) => g.slice(SECTION_PREFIX.length) as SectionId);
}

/** Roles whose section access is chosen per member. Everyone else: by role. */
export function isSectionScopedRole(role: UserRole | undefined): boolean {
  return role === "AGENT" || role === "VIEWER";
}

/** Prefix match on a segment boundary, so /orders never matches /ordersomething. */
function isUnder(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/**
 * The section owning `pathname`, longest prefix first — /orders/customers/1 is
 * Customers, /orders/drafts is Orders. Undefined for paths outside every
 * section (/settings, /profile, /admin).
 */
export function sectionForPath(pathname: string): SectionId | undefined {
  return SECTIONS.filter((s) => isUnder(pathname, s.prefix)).sort(
    (a, b) => b.prefix.length - a.prefix.length,
  )[0]?.id;
}

// Vendors may only reach these (the server enforces the real boundary).
const VENDOR_ALLOWED_PREFIXES = ["/orders", "/products", "/profile"];

// Section sub-pages that are NOT vendor-facing. Checked before the allow list,
// which is a prefix match and would otherwise sweep these in. The API denies
// vendors every stock endpoint and /orders/slips/data (a package slip prints
// the customer's full postal address), so these pages would only 403.
const VENDOR_DENIED_PREFIXES = [
  "/orders/drafts",
  "/orders/customers",
  "/orders/invoices",
  "/orders/slips",
  "/products/inventory",
];

export interface SectionAccess {
  role: UserRole | undefined;
  /** `"all"`, or exactly the sections granted. */
  sections: "all" | Set<SectionId>;
  grants: readonly string[];
}

/**
 * OWNER / ADMIN / MANAGER open everything. An AGENT / VIEWER opens what their
 * grants name — and everything when they name no section at all, which is
 * every member who joined before section access existed.
 */
export function resolveAccess(
  role: UserRole | undefined,
  grants: readonly string[],
): SectionAccess {
  const sections = isSectionScopedRole(role) ? sectionsInGrants(grants) : [];
  return {
    role,
    sections: sections.length === 0 ? "all" : new Set(sections),
    grants,
  };
}

export function canAccessPath(access: SectionAccess, pathname: string): boolean {
  if (access.role === "VENDOR") {
    return (
      !VENDOR_DENIED_PREFIXES.some((p) => isUnder(pathname, p)) &&
      VENDOR_ALLOWED_PREFIXES.some((p) => isUnder(pathname, p))
    );
  }

  const section = sectionForPath(pathname);
  if (!section) return true;
  if (access.sections !== "all" && !access.sections.has(section)) return false;

  // Inventory sits inside Products but keeps its own key: the stock API
  // refuses an AGENT / VIEWER without `inventory.view` whatever their sections.
  if (
    isUnder(pathname, "/products/inventory") &&
    isSectionScopedRole(access.role) &&
    !access.grants.includes("inventory.view")
  ) {
    return false;
  }
  return true;
}

/** Where a member lands: their first open section, in nav order. */
export function firstAllowedPath(access: SectionAccess): string {
  return (
    AVAILABLE_SECTIONS.find((s) => canAccessPath(access, s.prefix))?.prefix ??
    "/profile"
  );
}

/** Landing path for the signed-in member, for callers outside React. */
export function getLandingPath(): string {
  const { organizations, currentOrgId } = useAuthStore.getState();
  const membership =
    organizations.find((m) => m.organization.id === currentOrgId) ??
    organizations[0];
  return firstAllowedPath(
    resolveAccess(membership?.role, membership?.permissions ?? []),
  );
}
