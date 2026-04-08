import {
  IsOptional,
  IsString,
  Length,
  Matches,
} from 'class-validator';
import { GSTIN_REGEX } from '../../gst/constants/gst-rates';

export class CreateInvoiceDto {
  @IsString()
  orderId: string;

  @IsOptional()
  @IsString()
  sellerGstinId?: string;

  @IsOptional()
  @IsString()
  @Matches(GSTIN_REGEX, {
    message: 'Buyer GSTIN must be a valid 15-character GST Identification Number',
  })
  buyerGstin?: string;

  @IsOptional()
  @IsString()
  @Length(2, 2, { message: 'Place of supply code must be exactly 2 digits' })
  placeOfSupplyCode?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
