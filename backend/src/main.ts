import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { Env } from './config/env.validation';
import { RealtimeAdapter } from './realtime/realtime.adapter';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const config = app.get<ConfigService<Env, true>>(ConfigService);

  app.setGlobalPrefix('api');
  const origins = config
    .get('CORS_ORIGIN', { infer: true })
    .split(',')
    .map((origin) => origin.trim());
  app.enableCors({
    origin: origins,
    credentials: true,
  });
  app.useWebSocketAdapter(new RealtimeAdapter(app, origins));
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());

  const port = config.get('PORT', { infer: true });
  app.enableShutdownHooks();
  await app.listen(port);

  Logger.log(`Backend running at http://localhost:${port}/api`, 'Bootstrap');
}

void bootstrap();
