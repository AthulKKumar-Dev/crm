import { IsEmail, IsOptional, IsString, IsUrl, MaxLength, MinLength } from 'class-validator';

export class SignupDto {
    @IsString()
    @MinLength(1)
    @MaxLength(50)
    firstName: string;

    @IsString()
    @MinLength(1)
    @MaxLength(50)
    lastName: string;

    @IsEmail() email: string;

    @IsString()
    @MinLength(8)
    password: string;

    @IsOptional()
    @IsUrl()
    avatarUrl?: string;
}