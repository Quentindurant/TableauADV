import type { INestApplication } from '@nestjs/common';
import { authCookieOptions } from './auth/cookie';
import { setupApp } from './app.setup';

interface Recorder {
  prefix: string | null;
  middlewares: number;
  cors: unknown[];
  filters: unknown[];
  expressSettings: Record<string, unknown>;
}

/**
 * Faux INestApplication : on n'a besoin que d'enregistrer ce que `setupApp`
 * appelle. Aucun serveur HTTP n'est démarré (pas de test réseau).
 */
function fakeApp(): { app: INestApplication; rec: Recorder } {
  const rec: Recorder = {
    prefix: null,
    middlewares: 0,
    cors: [],
    filters: [],
    expressSettings: {},
  };

  const expressInstance = {
    set(key: string, value: unknown): void {
      rec.expressSettings[key] = value;
    },
  };

  const app = {
    setGlobalPrefix(prefix: string): void {
      rec.prefix = prefix;
    },
    use(): void {
      rec.middlewares += 1;
    },
    enableCors(options: unknown): void {
      rec.cors.push(options);
    },
    useGlobalFilters(filter: unknown): void {
      rec.filters.push(filter);
    },
    getHttpAdapter(): { getInstance: () => typeof expressInstance } {
      return { getInstance: () => expressInstance };
    },
  } as unknown as INestApplication;

  return { app, rec };
}

function withEnv(env: Record<string, string | undefined>, run: () => void): void {
  const previous: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(env)) {
    previous[key] = process.env[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  try {
    run();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

describe('setupApp — configuration de production', () => {
  it("conserve le préfixe global /api, cookie-parser et le filtre d'erreurs", () => {
    const { app, rec } = fakeApp();

    setupApp(app);

    expect(rec.prefix).toBe('api');
    expect(rec.middlewares).toBe(1);
    expect(rec.filters).toHaveLength(1);
  });

  it('fait confiance au premier proxy (Apache) pour lire X-Forwarded-Proto', () => {
    const { app, rec } = fakeApp();

    setupApp(app);

    expect(rec.expressSettings['trust proxy']).toBe(1);
  });

  it('active le CORS crédentialisé vers APP_URL hors production (dev : web:3000 -> api:3001)', () => {
    const { app, rec } = fakeApp();

    withEnv({ NODE_ENV: 'development', APP_URL: 'http://localhost:3000' }, () => {
      setupApp(app);
    });

    expect(rec.cors).toEqual([{ origin: 'http://localhost:3000', credentials: true }]);
  });

  it("n'active PAS le CORS en production (web et API sur la même origine derrière Apache)", () => {
    const { app, rec } = fakeApp();

    withEnv({ NODE_ENV: 'production', APP_URL: 'https://suivi.exemple.fr' }, () => {
      setupApp(app);
    });

    expect(rec.cors).toEqual([]);
  });
});

describe('cookie JWT en production', () => {
  it('pose le drapeau secure uniquement en production', () => {
    withEnv({ NODE_ENV: 'production' }, () => {
      expect(authCookieOptions().secure).toBe(true);
    });

    withEnv({ NODE_ENV: 'test' }, () => {
      expect(authCookieOptions().secure).toBe(false);
    });
  });
});
