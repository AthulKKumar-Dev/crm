import { IsOptional, IsString } from 'class-validator';

/** Body for `POST /admin/users/:userId/impersonate`. */
export class ImpersonateDto {
    /**
     * Target organization to enter on behalf of the user. If omitted, the
     * user's first active membership is used. If the user has no active
     * memberships, an org-less session is issued.
     */
    @IsOptional() @IsString() orgId?: string;
}
