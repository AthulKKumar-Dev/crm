import {
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * Upgrade a PERSONAL workspace to an ORGANIZATION type. Same shape as the
 * onboarding "create organization" form (minus the billing fields, which
 * stay attached to the existing workspace row — no plan change happens
 * during an upgrade).
 */
export class UpgradeToOrganizationDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name: string;

  @IsOptional()
  @IsUrl()
  logo?: string;

  @IsOptional()
  @IsString()
  industry?: string;

  @IsOptional()
  @IsUrl()
  website?: string;

  @IsOptional()
  @IsString()
  timezone?: string;
}
