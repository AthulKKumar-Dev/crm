import { IsString, MinLength } from 'class-validator';

export class ConnectShopifyDto {
    // Accepts "my-store", "my-store.myshopify.com", or a full URL —
    // ShopifyOAuthService.normalizeShopDomain() is the authoritative validator.
    @IsString()
    @MinLength(3)
    shopDomain: string;
}
