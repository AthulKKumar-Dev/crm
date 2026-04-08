import { IsOptional, IsString, IsEnum } from 'class-validator';

export enum GstReturnType {
  GSTR1 = 'GSTR1',
  GSTR3B = 'GSTR3B',
}

export class QueryGstReturnDto {
  @IsString()
  financialYear: string; // e.g. "2025-26"

  @IsString()
  period: string; // e.g. "04" for April, "Q1" for quarter

  @IsOptional()
  @IsEnum(GstReturnType)
  returnType?: GstReturnType = GstReturnType.GSTR1;

  @IsOptional()
  @IsString()
  sellerGstinId?: string; // Filter by specific GSTIN for multi-state
}
