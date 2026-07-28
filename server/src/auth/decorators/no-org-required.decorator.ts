import { SetMetadata } from '@nestjs/common';

export const NO_ORG_REQUIRED_KEY = 'noOrgRequired';

/**
 * Opt out of OrgRequiredGuard's deny-by-default orgId check.
 * Use for authenticated routes that are intentionally pre-org
 * (onboarding, profile, billing checkout, admin, create-org).
 */
export const NoOrgRequired = () => SetMetadata(NO_ORG_REQUIRED_KEY, true);
