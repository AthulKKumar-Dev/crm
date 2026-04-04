export default () => ({
    port: parseInt(process.env.PORT ?? '5000', 10),
    nodeEnv: process.env.NODE_ENV,
    appUrl: process.env.APP_URL,
    frontendUrl: process.env.FRONTEND_URL,
    database: { url: process.env.DATABASE_URL },
    redis: {
        host: process.env.REDIS_HOST,
        port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
        password: process.env.REDIS_PASSWORD || undefined,
    },
    jwt: {
        accessSecret: process.env.JWT_ACCESS_SECRET,
        refreshSecret: process.env.JWT_REFRESH_SECRET,
        accessExpires: process.env.JWT_ACCESS_EXPIRES,
        refreshExpires: process.env.JWT_REFRESH_EXPIRES,
    },
    resend: {
        apiKey: process.env.RESEND_API_KEY,
        fromEmail: process.env.FROM_EMAIL || 'noreply@yourcrm.com',
        fromName: process.env.FROM_NAME || 'YourCRM',
    },
    shopify: {
        clientId: process.env.SHOPIFY_CLIENT_ID,
        clientSecret: process.env.SHOPIFY_CLIENT_SECRET,
        webhookSecret: process.env.SHOPIFY_WEBHOOK_SECRET || undefined,
    },
    instagram: {
        appId: process.env.META_APP_ID,
        appSecret: process.env.META_APP_SECRET,
        webhookVerifyToken: process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN,
    },
    encryptionKey: process.env.ENCRYPTION_KEY || undefined,
});