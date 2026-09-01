import { IsNumber, IsOptional, IsPositive, IsString, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateCreditNoteDto {
  /**
   * Why the credit note was raised — goods returned, deficiency in service,
   * price revised. Printed on the document and reported with it.
   */
  @IsString()
  @MaxLength(500)
  reason: string;

  /**
   * Amount to credit, inclusive of tax. Omit for a FULL reversal of whatever
   * remains uncredited.
   *
   * A partial credit is apportioned pro-rata across the original lines by
   * value, so every line keeps its own GST rate. Which specific items came back
   * is not knowable from an amount alone, and guessing would put the reversal
   * against the wrong rate.
   */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  amount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
