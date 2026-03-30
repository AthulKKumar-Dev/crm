import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';
export class UpdateChannelDto {
    @IsOptional() @IsString() @MaxLength(100) name?: string;
    @IsOptional() @IsBoolean() isEnabled?: boolean;
}