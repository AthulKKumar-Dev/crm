import { IsBoolean, IsInt, IsOptional, IsString, IsUrl, MaxLength, Min, MinLength } from 'class-validator';

// Same fields as create, but all optional (partial update)
// Plus lowStockThreshold which is a settings field, not a creation field
export class UpdateOrganizationDto {
    @IsOptional() @IsString() @MinLength(2) @MaxLength(100) name?: string;
    @IsOptional() @IsUrl() logo?: string;
    @IsOptional() @IsString() timezone?: string;
    @IsOptional() @IsString() currency?: string;
    @IsOptional() @IsString() industry?: string;
    @IsOptional() @IsUrl() website?: string;

    // Global low stock threshold — products without their own threshold use this
    // Min 1 because 0 would mean "never alert" which should be a separate toggle
    @IsOptional()
    @IsInt()
    @Min(1)
    lowStockThreshold?: number;

    // GST toggle — enables GST features for the organization
    @IsOptional()
    @IsBoolean()
    gstEnabled?: boolean;
}