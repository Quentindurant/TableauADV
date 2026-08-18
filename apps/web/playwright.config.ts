import { defineConfig, devices } from '@playwright/test';

/**
 * Harnais e2e du front. Les deux serveurs de dev sont démarrés par Playwright
 * (réutilisés s'ils tournent déjà). `cwd: '../..'` : les commandes pnpm sont
 * lancées depuis la racine du monorepo. La base doit être migrée ;
 * `globalSetup` rejoue le seed idempotent pour garantir l'utilisateur initial.
 */
const WEB_URL = process.env.E2E_WEB_URL ?? 'http://localhost:3000';
const API_URL = process.env.E2E_API_URL ?? 'http://localhost:3001';

const config = defineConfig({
  testDir: './e2e',
  // `api-client.spec.ts` simule `fetch` : il vérifie le comportement de
  // PRODUCTION (URL relatives, même origine derrière Apache) et n'a besoin
  // d'aucun serveur. Les scénarios navigateur, eux, tournent sans reverse
  // proxy et exigent `NEXT_PUBLIC_API_URL`. Les deux sont donc exécutés
  // séparément : E2E_NAVIGATEUR=1 exclut le premier.
  testIgnore: process.env.E2E_NAVIGATEUR === '1' ? ['**/api-client.spec.ts'] : [],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: WEB_URL,
    locale: 'fr-FR',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});

// Démarrage optionnel des serveurs et du globalSetup si souhaité
if (process.env.PLAYWRIGHT_NO_SERVERS !== '1') {
  config.globalSetup = './e2e/global-setup.ts';
  config.webServer = [
    {
      command: 'pnpm --filter @suivi/api dev',
      url: `${API_URL}/api/health`,
      cwd: '../..',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: 'pnpm --filter @suivi/web dev',
      url: WEB_URL,
      cwd: '../..',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ];
}

export default config;
