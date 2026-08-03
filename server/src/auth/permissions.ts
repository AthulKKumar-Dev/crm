import { UserRole } from '@prisma/client';

/**
 * Fine-grained capability keys stored in `OrganizationMember.permissions`
 * (JSONB, shape: `{ grants: PermissionKey[], preset?: string }`).
 *
 * Design: warehouse-floor "roles" (Receiver, Picker, Packer, Dispatch,
 * Accounts) are NOT UserRole enum values — they are capability sets granted to
 * existing roles, surfaced in the team UI as named presets. A Picker is an
 * AGENT holding only `inventory.pick`. This avoids a Postgres enum migration,
 * keeps the RolesGuard→VendorAccessGuard ordering intact, and lets merchants
 * tweak per-user capabilities without new roles.
 *
 * Resolution rules (enforced by PermissionsGuard):
 *   - OWNER / ADMIN / MANAGER implicitly hold EVERY key.
 *   - AGENT and VIEWER hold exactly what their `grants` array contains.
 *   - VENDOR holds none — vendor floor access is a V2 question.
 */
export const PERMISSION_KEYS = [
  'inventory.view',
  'inventory.receive',
  'inventory.adjust',
  'inventory.pick',
  'inventory.pack',
  'inventory.dispatch',
  'inventory.labels',
  'inventory.reports',
  'reports.finance',
] as const;

export type PermissionKey = (typeof PERMISSION_KEYS)[number];

/** Shape of the OrganizationMember.permissions JSONB column. */
export interface MemberPermissions {
  grants: PermissionKey[];
  /** Name of the preset this grant-set was created from (display only). */
  preset?: string;
}

/**
 * Named grant bundles for the team UI. Purely templates — assigning one copies
 * its grants onto the member; nothing references the preset afterwards, so
 * merchants can tweak individual grants freely.
 */
export const PERMISSION_PRESETS: Record<
  string,
  { label: string; role: UserRole; grants: PermissionKey[] }
> = {
  warehouse_manager: {
    label: 'Warehouse Manager',
    role: UserRole.MANAGER,
    grants: [
      'inventory.view',
      'inventory.receive',
      'inventory.adjust',
      'inventory.pick',
      'inventory.pack',
      'inventory.dispatch',
      'inventory.labels',
      'inventory.reports',
    ],
  },
  receiver: {
    label: 'Receiver',
    role: UserRole.AGENT,
    grants: ['inventory.view', 'inventory.receive', 'inventory.labels'],
  },
  picker: {
    label: 'Picker',
    role: UserRole.AGENT,
    grants: ['inventory.view', 'inventory.pick'],
  },
  packer: {
    label: 'Packer',
    role: UserRole.AGENT,
    grants: ['inventory.view', 'inventory.pack'],
  },
  dispatch: {
    label: 'Dispatch',
    role: UserRole.AGENT,
    grants: ['inventory.view', 'inventory.dispatch'],
  },
  accounts: {
    label: 'Accounts',
    role: UserRole.VIEWER,
    grants: ['inventory.reports', 'reports.finance'],
  },
};

/**
 * Parse the raw JSONB column into a validated grant list. Tolerant of legacy /
 * malformed content: anything that isn't a known key is dropped.
 */
export function extractGrants(raw: unknown): PermissionKey[] {
  if (!raw || typeof raw !== 'object') return [];
  const grants = (raw as { grants?: unknown }).grants;
  if (!Array.isArray(grants)) return [];
  const known = new Set<string>(PERMISSION_KEYS);
  return grants.filter((g): g is PermissionKey => typeof g === 'string' && known.has(g));
}

/** Roles that implicitly hold every permission key. */
export const IMPLICIT_ALL_ROLES: UserRole[] = [
  UserRole.OWNER,
  UserRole.ADMIN,
  UserRole.MANAGER,
];
