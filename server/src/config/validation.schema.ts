import * as Joi from 'joi';

export const validationSchema = Joi.object({
    NODE_ENV: Joi.string().valid('development', 'production', 'test').required(),
    PORT: Joi.number().default(5000),
    DATABASE_URL: Joi.string().required(),
    REDIS_URL: Joi.string().required(),
    JWT_ACCESS_SECRET: Joi.string().min(32).required(),
    JWT_REFRESH_SECRET: Joi.string().min(32).required(),
    RESEND_API_KEY: Joi.string().optional(),
    SHOPIFY_CLIENT_ID: Joi.string().optional(),
    SHOPIFY_CLIENT_SECRET: Joi.string().optional(),
    SHOPIFY_SCOPES: Joi.string().optional(),
    ENCRYPTION_KEY: Joi.string().length(32).optional(),
    META_APP_ID: Joi.string().optional(),
    META_APP_SECRET: Joi.string().optional(),
    INSTAGRAM_WEBHOOK_VERIFY_TOKEN: Joi.string().optional(),
    WHATSAPP_WEBHOOK_VERIFY_TOKEN: Joi.string().optional(),
    WHATSAPP_CONFIG_ID: Joi.string().optional(),
    SUPER_ADMIN_EMAILS: Joi.string().allow('').optional(),
    RAZORPAY_KEY_ID: Joi.string().optional(),
    RAZORPAY_KEY_SECRET: Joi.string().optional(),
    RAZORPAY_WEBHOOK_SECRET: Joi.string().optional(),
});
