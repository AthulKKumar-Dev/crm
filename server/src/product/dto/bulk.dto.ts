import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsString,
} from 'class-validator';
import { ProductStatus } from '@prisma/client';

const MAX_BULK = 250;

export class BulkProductIdsDto {
  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_BULK)
  productIds: string[];
}

export class BulkSetStatusDto extends BulkProductIdsDto {
  @IsEnum(ProductStatus)
  status: ProductStatus;
}

export class BulkTagsDto extends BulkProductIdsDto {
  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  tags: string[];
}
