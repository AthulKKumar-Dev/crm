import { IsArray, IsEmail, IsEnum, IsIn, IsOptional, IsString } from 'class-validator';
import { UserRole } from '@prisma/client';
import { PERMISSION_KEYS, PermissionKey } from '../../auth/permissions';

export class SendInviteDto {
    @IsEmail()
    email: string;

    // Which role the invited person will have when they join
    // Cannot be OWNER — validated in the service layer
    @IsEnum(UserRole)
    role: UserRole;

    // For VENDOR invites only: the Product.vendor value to scope the member to.
    // Required + validated against a real vendor in the service layer.
    @IsOptional()
    @IsString()
    vendorScope?: string;

    // For AGENT / VIEWER invites: the sections (and any other grants) the
    // member starts with. Omitted = not configured, i.e. full section access.
    @IsOptional()
    @IsArray()
    @IsIn(PERMISSION_KEYS as readonly string[], { each: true })
    grants?: PermissionKey[];
}