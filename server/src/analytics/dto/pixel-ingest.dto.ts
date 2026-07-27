import { Type } from 'class-transformer';
import {
    ArrayMaxSize, IsArray, IsIn, IsISO8601, IsObject, IsOptional,
    IsString, Length, ValidateNested,
} from 'class-validator';

export const PIXEL_EVENT_NAMES = [
    'page_viewed',
    'product_viewed',
    'collection_viewed',
    'search_submitted',
    'cart_viewed',
    'product_added_to_cart',
    'checkout_started',
    'checkout_completed',
] as const;
export type PixelEventName = (typeof PIXEL_EVENT_NAMES)[number];

export class PixelEventDto {
    @IsString() @Length(1, 64)
    id!: string;

    @IsIn(PIXEL_EVENT_NAMES as unknown as string[])
    name!: PixelEventName;

    @IsISO8601()
    timestamp!: string;

    @IsOptional() @IsObject()
    data?: Record<string, unknown>;
}

export class PixelIngestDto {
    @IsString() @Length(20, 128)
    token!: string;

    @IsString() @Length(1, 128)
    clientId!: string;

    @IsArray() @ArrayMaxSize(20)
    @ValidateNested({ each: true })
    @Type(() => PixelEventDto)
    events!: PixelEventDto[];
}