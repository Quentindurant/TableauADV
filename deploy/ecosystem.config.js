/*
 * PM2 — deux process : l'API NestJS et le serveur Next.js.
 *
 * Lancement (TOUJOURS depuis la racine du dépôt, les `cwd` sont relatifs) :
 *   cd /home/suivi/suivi-commandes
 *   pm2 start deploy/ecosystem.config.js
 *   pm2 save
 *
 * Pourquoi `cwd` est obligatoire :
 *  - suivi-api : `apps/api/src/main.ts` fait `import 'dotenv/config'`, qui lit
 *    le fichier `.env` du répertoire courant. Sans cwd = apps/api, ni
 *    DATABASE_URL ni JWT_SECRET ne seraient chargés.
 *  - suivi-web : `next start` cherche le dossier `.next/` du répertoire courant.
 *
 * Les variables ci-dessous sont le strict minimum. Les secrets
 * (DATABASE_URL, JWT_SECRET, APP_URL) restent dans apps/api/.env, jamais ici :
 * ce fichier est versionné dans git.
 */
module.exports = {
  apps: [
    {
      name: 'suivi-api',
      cwd: './apps/api',
      script: 'dist/main.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_restarts: 10,
      restart_delay: 2000,
      max_memory_restart: '400M',
      env: {
        NODE_ENV: 'production',
        PORT: '3001',
      },
      error_file: '/var/log/pm2/suivi-api.error.log',
      out_file: '/var/log/pm2/suivi-api.out.log',
      merge_logs: true,
      time: true,
    },
    {
      name: 'suivi-web',
      cwd: './apps/web',
      // `pnpm start` = `next start --port 3000` (script du package @suivi/web).
      script: 'pnpm',
      args: 'start',
      interpreter: 'none',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_restarts: 10,
      restart_delay: 2000,
      max_memory_restart: '600M',
      env: {
        NODE_ENV: 'production',
        PORT: '3000',
        // Appels serveur -> API des Server Components (URL absolue obligatoire).
        // NEXT_PUBLIC_API_URL reste vide en production (meme origine) et est lu
        // au build depuis apps/web/.env.
        API_INTERNAL_URL: 'http://127.0.0.1:3001',
      },
      error_file: '/var/log/pm2/suivi-web.error.log',
      out_file: '/var/log/pm2/suivi-web.out.log',
      merge_logs: true,
      time: true,
    },
  ],
};
