import { IsEmail, IsEnum } from 'class-validator';
import { UserRole } from '@prisma/client';

export class SendInviteDto {
    @IsEmail()
    email: string;

    // Which role the invited person will have when they join
    // Cannot be OWNER — validated in the service layer
    @IsEnum(UserRole)
    role: UserRole;
}