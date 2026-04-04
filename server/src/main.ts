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
  app.use(helmet());
  app.use(cookieParser());

  // CORS
  app.enableCors({
    origin: config.get<string>('frontendUrl'),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
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