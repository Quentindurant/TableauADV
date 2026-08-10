import type { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';

/**
 * Configuration commune de l'application HTTP, partagée entre `main.ts`
 * et les tests e2e afin de tester exactement la même configuration.
 */
export function setupApp(app: INestApplication): INestApplication {
  app.setGlobalPrefix('api');
  app.use(cookieParser());
  return app;
}
