import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

/** Validated query string for `GET /admin/users`. */
export class QueryUsersDto {
    @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number = 1;
    @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number = 20;

    /** Case-insensitive substring search across email + first/last name. */
    @IsOptional() @IsString() search?: string;
}
