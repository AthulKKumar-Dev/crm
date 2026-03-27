import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class AcceptInviteDto {
    @IsString()
    token: string;

    @IsOptional()
    @IsString()
    @MinLength(1)
    @MaxLength(50)
    firstName?: string;

    @IsOptional()
    @IsString()
    @MinLength(1)
    @MaxLength(50)
    lastName?: string;

    @IsOptional()
    @IsString()
    @MinLength(8)
    password?: string;
}