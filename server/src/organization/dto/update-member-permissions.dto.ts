import { IsArray, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { PERMISSION_KEYS, PermissionKey } from '../../auth/permissions';

/**
 * Body for PATCH :memberId/permissions. Replaces the member's grant set
 * wholesale (the team UI always sends the complete list — presets are applied
 * client-side by copying their grants in).
 */
export class UpdateMemberPermissionsDto {
  @IsArray()
  @IsIn(PERMISSION_KEYS as readonly string[], { each: true })
  grants: PermissionKey[];

  // Display-only: which preset this grant set came from, if any.
  @IsOptional()
  @IsString()
  @MaxLength(50)
  preset?: string;
}
