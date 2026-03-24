import * as Joi from 'joi';

export const validationSchema = Joi.object({
    NODE_ENV: Joi.string().valid('development', 'production', 'test').required(),
    PORT: Joi.number().default(3000),
    DATABASE_URL: Joi.string().required(),
    REDIS_HOST: Joi.string().required(),
    JWT_ACCESS_SECRET: Joi.string().min(32).required(),
    JWT_REFRESH_SECRET: Joi.string().min(32).required(),
    RESEND_API_KEY: Joi.string().required(),
    SHOPIFY_CLIENT_ID: Joi.string().required(),
    SHOPIFY_CLIENT_SECRET: Joi.string().required(),
    ENCRYPTION_KEY: Joi.string().length(32).required(),
});