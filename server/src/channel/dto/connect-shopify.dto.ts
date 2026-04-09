import { IsString, Matches, MinLength } from 'class-validator';

export class ConnectShopifyDto {
    @IsString()
    @Matches(/^[a-zA-Z0-9-]+\.myshopify\.com$/, {
        message: 'shopDomain must be a valid Shopify domain (e.g., my-store.myshopify.com)',
    })
    shopDomain: string;

    @IsString()
    @MinLength(1, { message: 'API key is required' })
    apiKey: string;

    @IsString()
    @MinLength(1, { message: 'API secret is required' })
    apiSecret: string;
}
