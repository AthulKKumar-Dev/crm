import { Type } from 'class-transformer';
import {
  IsOptional,
  IsString,
  Length,
  MaxLength,
  ValidateNested,
} from 'class-validator';

/** Postal fields of the buyer block, stored as the invoice's `buyerAddress` JSON. */
export class InvoiceBuyerAddressDto {
  @IsOptional() @IsString() @MaxLength(200) address1?: string;
  @IsOptional() @IsString() @MaxLength(200) address2?: string;
  @IsOptional() @IsString() @MaxLength(100) city?: string;
  @IsOptional() @IsString() @MaxLength(100) province?: string;
  @IsOptional() @IsString() @MaxLength(20) zip?: string;
  @IsOptional() @IsString() @MaxLength(100) country?: string;
}

/**
 * The fields of an ISSUED invoice that may be corrected in place.
 *
 * Deliberately nothing that moves tax: no amounts, lines, dates, number,
 * place of supply or seller. Those corrections are a credit note or a
 * cancel-and-reissue, which leave a trail. A buyer's name or address typed
 * wrong is a clerical fix the return does not see; a buyer GSTIN decides
 * B2B/B2C, so it is allowed only while the period is still open.
 */
export class UpdateInvoiceDto {
  @IsOptional()
  @IsString()
  @Length(1, 200)
  buyerName?: string;

  /** Empty string or null clears it (the invoice becomes B2C). */
  @IsOptional()
  @IsString()
  @MaxLength(15)
  buyerGstin?: string | null;

  @IsOptional()
  @ValidateNested()
  @Type(() => InvoiceBuyerAddressDto)
  buyerAddress?: InvoiceBuyerAddressDto | null;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string | null;
}
