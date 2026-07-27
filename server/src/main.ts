import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { ConfigService } from '@nestjs/config';

import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    rawBody: true,
  });
  const config = app.get(ConfigService);

  // Security
  app.use(helmet({
    contentSecurityPolicy: false, // Vite build injects inline scripts/styles
  }));
  app.use(cookieParser());

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