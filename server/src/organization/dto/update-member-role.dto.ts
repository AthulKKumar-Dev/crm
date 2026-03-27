import { IsEnum } from 'class-validator';
import { UserRole } from '@prisma/client';

export class UpdateMemberRoleDto {
    // New role for the member. Cannot be OWNER — validated in service.
    @IsEnum(UserRole)
    role: UserRole;
}