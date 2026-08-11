import type { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { ApiExceptionFilter } from './common/api-exception.filter';

/**
 * Configuration commune de l'application HTTP, partagée entre `main.ts`
 * et les tests e2e afin de tester exactement la même configuration.
 */
export function setupApp(app: INestApplication): INestApplication {
  app.setGlobalPrefix('api');
  app.use(cookieParser());
  app.enableCors({
    origin: process.env.APP_URL ?? 'http://localhost:3000',
    credentials: true,
  });
  app.useGlobalFilters(new ApiExceptionFilter());
  return app;
}
