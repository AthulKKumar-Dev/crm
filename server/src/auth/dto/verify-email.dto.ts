import { IsString, Length } from 'class-validator';

export class VerifyEmailDto {
    @IsString()
    userId: string;

    @IsString()
    @Length(6, 6)
    code: string;
}