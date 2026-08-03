import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { ConfigService } from '@nestjs/config';

import { AppModule } from './app.module';

/// Express defaults to 100kb, which a Shopify order webhook for a large cart
/// exceeds — and the 413 is raised BEFORE HMAC verification, so the handler
/// never runs and we cannot even log the miss. Shopify counts those as failed
/// deliveries and eventually DELETES the subscription, silently stopping sync.
const REQUEST_BODY_LIMIT = '2mb';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
  });
  const config = app.get(ConfigService);

  // Security
  app.use(helmet({
    contentSecurityPolicy: false, // Vite build injects inline scripts/styles
  }));
  app.use(cookieParser());

  // Must precede route handling. `rawBody: true` above still captures the
  // untouched buffer the Shopify HMAC check needs — up to this same limit.
  app.useBodyParser('json', { limit: REQUEST_BODY_LIMIT });
  app.useBodyParser('urlencoded', { limit: REQUEST_BODY_LIMIT, extended: true });

  // CORS — pixel ingest must accept any storefront origin; everything else
  // stays locked to the CRM frontend.
  app.enableCors((req, cb) => {
    if (req.url?.startsWith('/api/v1/analytics/pixel')) {
      cb(null, { origin: true, credentials: false, methods: ['POST', 'OPTIONS'], maxAge: 86400 });
    } else {
      cb(null, {
        origin: config.get<string>('frontendUrl'),
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      });
    }
  });

  // API versioning
  app.setGlobalPrefix('api/v1');

  // Global validation — strips unknown props, rejects non-whitelisted, auto-transforms
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Graceful shutdown
  app.enableShutdownHooks();

  const port = config.get<number>('port')!;
  await app.listen(port);
}

bootstrap();