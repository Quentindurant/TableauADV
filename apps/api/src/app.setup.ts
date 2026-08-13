import type { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { ApiExceptionFilter } from './common/api-exception.filter';

/** Instance Express sous-jacente — seul `set` nous intéresse ici. */
interface ExpressLike {
  set(setting: string, value: unknown): void;
}

/**
 * Configuration commune de l'application HTTP, partagée entre `main.ts`
 * et les tests e2e afin de tester exactement la même configuration.
 */
export function setupApp(app: INestApplication): INestApplication {
  app.setGlobalPrefix('api');
  app.use(cookieParser());

  // En production, Apache est placé devant l'API (mod_proxy) et transmet
  // `X-Forwarded-Proto: https`. Sans `trust proxy`, Express considère la
  // requête comme non chiffrée : `req.secure` est faux et certains clients
  // refuseraient le cookie `secure`. `1` = faire confiance au premier proxy
  // (127.0.0.1), jamais à une chaîne de proxies inconnue.
  (app.getHttpAdapter().getInstance() as ExpressLike).set('trust proxy', 1);

  // En production, Apache sert le web (`/` -> :3000) et l'API (`/api` -> :3001)
  // sur la MÊME origine : aucune requête cross-origin, donc aucun CORS.
  // En dev en revanche, le navigateur parle à deux origines distinctes.
  if (process.env.NODE_ENV !== 'production') {
    app.enableCors({
      origin: process.env.APP_URL ?? 'http://localhost:3000',
      credentials: true,
    });
  }

  app.useGlobalFilters(new ApiExceptionFilter());
  return app;
}
