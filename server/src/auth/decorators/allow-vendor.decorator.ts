import { SetMetadata } from '@nestjs/common';

/**
 * Marks a route (or whole controller) as reachable by the VENDOR role.
 *
 * The VENDOR role is deny-by-default (see `VendorAccessGuard`): a vendor is
 * blocked from every endpoint UNLESS it carries `@AllowVendor()`. Apply this only
 * to the minimal set of routes a vendor genuinely needs (scoped product/order
 * reads, their fulfilment actions, the slip endpoints, and the small amount of
 * profile/org context the vendor UI loads).
 */
export const ALLOW_VENDOR_KEY = 'allowVendor';
export const AllowVendor = () => SetMetadata(ALLOW_VENDOR_KEY, true);
