import { IsOptional, IsString, MinLength } from 'class-validator';

export class ConnectShopifyDto {
    // Accepts "my-store", "my-store.myshopify.com", or a full URL —
    // ShopifyOAuthService.normalizeShopDomain() is the authoritative validator.
    @IsString()
    @MinLength(3)
    shopDomain: string;

    // Optional custom-app credentials (Partner Dashboard custom-distribution
    // apps). When provided, the OAuth flow runs with THESE as
    // client_id/client_secret instead of the platform-level env credentials,
    // and they are stored (encrypted) on the channel for webhooks/refresh.
    @IsOptional()
    @IsString()
    apiKey?: string;

    @IsOptional()
    @IsString()
    apiSecret?: string;
}
