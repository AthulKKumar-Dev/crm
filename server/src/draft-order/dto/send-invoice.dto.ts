import { IsArray, IsEmail, IsOptional, IsString } from 'class-validator';

/**
 * Send a Shopify-hosted invoice email to the customer. SHOPIFY-only —
 * rejected for MANUAL-channel drafts. Maps directly to Shopify's
 * `draftOrderInvoiceSend` mutation input.
 */
export class SendDraftInvoiceDto {
  /** Override the recipient. Defaults to the draft's customer email. */
  @IsOptional() @IsEmail() to?: string;

  @IsOptional() @IsString() subject?: string;
  @IsOptional() @IsString() customMessage?: string;

  @IsOptional()
  @IsArray()
  @IsEmail({}, { each: true })
  bcc?: string[];
}
