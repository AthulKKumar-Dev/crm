import { ArrayNotEmpty, IsArray, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class SetItemsStatusDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  lineItemIds: string[];

  // The working status a vendor sets on their own items. 'fulfilled' goes through
  // the fulfilment endpoint instead (it creates a real shipment). 'released'
  // clears a hold.
  @IsIn(['in_progress', 'on_hold', 'released'])
  status: 'in_progress' | 'on_hold' | 'released';

  // Optional hold reason (becomes the Shopify hold note) — used for 'on_hold'.
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
