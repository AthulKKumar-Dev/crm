import { IsString } from 'class-validator';

export class ResendVerificationDto {
    @IsString()
    userId: string;
}