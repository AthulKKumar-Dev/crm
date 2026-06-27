import { IsEmail, IsEnum, IsOptional, IsString } from 'class-validator';
import { UserRole } from '@prisma/client';

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
}