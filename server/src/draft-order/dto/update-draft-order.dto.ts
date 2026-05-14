import { PartialType } from '@nestjs/mapped-types';
import { CreateDraftOrderDto } from './create-draft-order.dto';

/**
 * Edit a draft. All fields optional — only sent ones update. `lineItems`,
 * when present, REPLACES the entire line-item list (we don't try to diff;
 * draft edits are typically wholesale "rebuild the cart" actions).
 */
export class UpdateDraftOrderDto extends PartialType(CreateDraftOrderDto) {}
