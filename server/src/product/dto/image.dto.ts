import {
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsString,
  ValidateIf,
} from 'class-validator';

export class UpdateImageDto {
  @IsOptional()
  @IsString()
  alt?: string;
}

export class ReorderImagesDto {
  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(1)
  imageIds: string[];
}

export class SetVariantImageDto {
  // imageId may be null to clear the link.
  @ValidateIf((o) => o.imageId !== null)
  @IsString()
  imageId: string | null;
}
