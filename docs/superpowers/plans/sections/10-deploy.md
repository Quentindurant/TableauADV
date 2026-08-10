# Section 10 — Déploiement VPS

> Références obligatoires : `docs/superpowers/specs/2026-08-10-suivi-commandes-design.md`
> (§9 Déploiement) et `docs/superpowers/plans/sections/_contracts.md`. Aucun nom
> (package, route, port, fichier) ne doit dévier des contrats.

## Feature 10 — Déploiement VPS (branche `feature/deploy-config`)

**But:** livrer tout ce qu'il faut pour mettre l'application en production sur un VPS Debian 13 derrière Apache 2.4 — VirtualHost HTTPS avec proxy REST + WebSocket, configuration PM2 des deux process, procédure d'installation pas à pas, sauvegarde PostgreSQL quotidienne — et durcir le code applicatif pour qu'il fonctionne correctement derrière un reverse proxy.

**Dépend de:** toutes les features précédentes (0 à 9), et en particulier :

- Feature 0 (socle monorepo) : `apps/api/src/app.setup.ts` (`setupApp(app)`), `apps/api/src/main.ts` (`import 'dotenv/config'` en première ligne, `app.listen(process.env.PORT ?? 3001)`), scripts `@suivi/api` (`build` → `dist/main.js`, `start`, `test:unit`, `test:e2e`) et `@suivi/web` (`build`, `start` → `next start --port 3000`), `apps/web/next.config.ts`, `GET /api/health`.
- Feature 1 (schéma + seed) : `apps/api/prisma/schema.prisma`, migrations Prisma, commande `prisma db seed`.
- Feature 2 (auth) : `apps/api/src/auth/cookie.ts` (`authCookieOptions()` avec `secure: process.env.NODE_ENV === 'production'`), `ApiExceptionFilter` branché dans `setupApp`, variable d'env `JWT_SECRET`.
- Feature 5 (temps réel) : gateway Socket.IO monté sur le même process API (port 3001, path `/socket.io`).
- Feature d'import XLSX : script `import:xlsx` du package `@suivi/api`.

**Décisions actées pour cette feature (aucune n'est à rediscuter) :**

| Sujet | Décision |
|---|---|
| Serveur Next.js | `next build` + `next start` (script `start` existant). **Pas** de `output: 'standalone'` : PM2 lance `pnpm start` dans `apps/web`, les `node_modules` du workspace sont présents sur le VPS, le mode standalone n'apporterait qu'un gain de taille d'image inutile ici. |
| CORS en production | Désactivé : Apache sert le web et l'API sur la **même origine** (`https://suivi.exemple.fr/` → :3000, `/api` → :3001). Le CORS reste actif hors production pour le dev local (web :3000 → api :3001, deux origines). |
| Cookie `secure` | Déjà conditionné à `NODE_ENV === 'production'` (Feature 2). Cette feature ajoute le `trust proxy` Express sans lequel Express ne voit pas `X-Forwarded-Proto` et considère la requête comme non chiffrée. |
| Domaine | Toutes les configurations utilisent le nom de remplacement `suivi.exemple.fr` et le chemin `/home/suivi/suivi-commandes`. Ils sont à substituer par les valeurs réelles au moment de l'installation ; chaque fichier livré le rappelle en commentaire. |

**Codes d'erreur (`ErrorCode`) du périmètre :** aucun. Cette feature ne crée ni route REST ni événement Socket.IO ; elle ne peut donc produire aucun code de la liste des contrats (`AUTH_INVALID`, `AUTH_REQUIRED`, `VALIDATION_FAILED`, `NOT_FOUND`, `VERSION_CONFLICT`, `COLUMN_HAS_DATA`, `CHOICE_IN_USE`, `LOCKED`). Les vérifications de cette feature portent sur des **artefacts de configuration**, testés par un harnais de vérification statique (`deploy/check-deploy.sh`) écrit en TDD comme le reste du plan : la vérification est écrite d'abord, elle échoue, l'artefact la fait passer.

**Tests du périmètre :**

1. `pnpm --filter @suivi/api test:unit -- app.setup.spec` (trust proxy, CORS conditionnelle, cookie `secure`) ;
2. `./deploy/check-deploy.sh all` (conformité des quatre livrables `deploy/`) ;
3. `pnpm --filter @suivi/api build` et `pnpm --filter @suivi/web build` (les deux builds de production sortent en code 0) ;
4. `shellcheck deploy/backup.sh deploy/check-deploy.sh` (aucun avertissement) ;
5. aucun test réseau (pas de requête vers un VPS, pas de test HTTPS) : les vérifications HTTP réelles sont des **étapes documentées** dans `deploy/install.md`, exécutées par l'opérateur sur le serveur.

---

### Task 10.1: Durcissement production de l'API (trust proxy, CORS, cookie secure)

**Files:**
- Modify: `apps/api/src/app.setup.ts`, `apps/web/next.config.ts`
- Test: `apps/api/src/app.setup.spec.ts` (create)

**Interfaces:**
- Consomme :
  - `export function setupApp(app: INestApplication): INestApplication` (`apps/api/src/app.setup.ts`, Features 0 et 2) ;
  - `export function authCookieOptions(): CookieOptions` (`apps/api/src/auth/cookie.ts`, Feature 2) ;
  - `export class ApiExceptionFilter implements ExceptionFilter` (`apps/api/src/common/api-exception.filter.ts`, Feature 2) ;
  - env des contrats : `APP_URL`, `PORT`, `NODE_ENV`.
- Produit :
  - `setupApp(app)` pose désormais `set('trust proxy', 1)` sur l'instance Express sous-jacente et **n'appelle plus** `app.enableCors()` quand `NODE_ENV === 'production'` (même origine derrière Apache). Signature inchangée : toutes les suites e2e existantes continuent de l'utiliser telle quelle.
  - `apps/web/next.config.ts` documente la décision « pas de `output: 'standalone'` » (aucun changement fonctionnel, `transpilePackages: ['@suivi/shared']` conservé).

- [ ] **Étape 1: créer la branche de feature**

  ```bash
  git checkout develop && git pull && git checkout -b feature/deploy-config
  ```

  Résultat attendu : `Switched to a new branch 'feature/deploy-config'`.

- [ ] **Étape 2: écrire le test qui échoue**

  Créer `apps/api/src/app.setup.spec.ts` :

  ```ts
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
    it('conserve le préfixe global /api, cookie-parser et le filtre d\'erreurs', () => {
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
  ```

  Note : le dernier `describe` recoupe volontairement un test de la Feature 2. Il est
  conservé ici comme garde-fou de mise en production : si quelqu'un retire la
  condition sur `NODE_ENV`, la suite de déploiement casse, pas seulement celle de l'auth.

- [ ] **Étape 3: lancer le test (FAIL)**

  ```bash
  pnpm --filter @suivi/api test:unit -- app.setup.spec
  ```

  Résultat attendu : **FAIL** — 2 tests rouges sur 5 :
  `expect(rec.expressSettings['trust proxy']).toBe(1)` reçoit `undefined`, et le test
  « n'active PAS le CORS en production » reçoit
  `[{ origin: 'https://suivi.exemple.fr', credentials: true }]` au lieu de `[]`.

- [ ] **Étape 4: implémentation minimale**

  Remplacer intégralement `apps/api/src/app.setup.ts` par :

  ```ts
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
  ```

- [ ] **Étape 5: relancer le test (PASS)**

  ```bash
  pnpm --filter @suivi/api test:unit -- app.setup.spec
  ```

  Résultat attendu : **PASS** — `Tests: 5 passed, 5 total`.

- [ ] **Étape 6: vérifier la non-régression des suites e2e existantes**

  ```bash
  pnpm --filter @suivi/api test:e2e
  ```

  Résultat attendu : **PASS** intégral. Les tests e2e tournent avec `NODE_ENV=test`
  (posé par jest) : la branche CORS est donc identique à avant, et `getHttpAdapter()`
  renvoie bien l'instance Express réelle de `@nestjs/platform-express`.

- [ ] **Étape 7: documenter la décision « pas de standalone » dans next.config.ts**

  Remplacer intégralement `apps/web/next.config.ts` par :

  ```ts
  import type { NextConfig } from 'next';

  const nextConfig: NextConfig = {
    // @suivi/shared est publié en source TypeScript (main: src/index.ts) :
    // Next.js doit le transpiler lui-même. Ne jamais retirer cette ligne.
    transpilePackages: ['@suivi/shared'],

    // Déploiement (Feature 10) : PAS de `output: 'standalone'`.
    // Le VPS héberge le monorepo complet avec ses node_modules ; PM2 lance
    // `pnpm start` (= `next start --port 3000`) dans apps/web. Le mode
    // standalone n'apporterait qu'un gain de taille de bundle inutile ici
    // et compliquerait la résolution des dépendances du workspace pnpm.
  };

  export default nextConfig;
  ```

- [ ] **Étape 8: commit**

  ```bash
  git add apps/api/src/app.setup.ts apps/api/src/app.setup.spec.ts apps/web/next.config.ts
  git commit -m "feat: durcissement production de l'API (trust proxy, CORS desactive en prod)"
  ```

> À vérifier à l'exécution : que `app.getHttpAdapter().getInstance()` renvoie bien l'application Express (c'est le cas avec `@nestjs/platform-express`, adaptateur par défaut de `NestFactory.create`). Si un jour l'adaptateur Fastify était utilisé, remplacer la ligne `trust proxy` par l'option `{ trustProxy: 1 }` passée au constructeur `FastifyAdapter`.

---

### Task 10.2: Harnais de vérification des livrables + configuration PM2

**Files:**
- Create: `deploy/check-deploy.sh`, `deploy/ecosystem.config.js`
- Test: `deploy/check-deploy.sh` (le harnais **est** le test de cette feature ; il est lui-même vérifié par shellcheck en Task 10.4)

**Interfaces:**
- Consomme :
  - scripts npm des contrats : `@suivi/api` `build` → `apps/api/dist/main.js`, `start` → `node dist/main.js` ; `@suivi/web` `start` → `next start --port 3000` ;
  - ports des contrats : web 3000, api 3001 ;
  - `apps/api/.env` chargé par `import 'dotenv/config'` en tête de `main.ts` (Feature 2) — donc le process API **doit** être lancé avec `cwd = apps/api`.
- Produit :
  - `deploy/check-deploy.sh [check…|all]` — vérificateur statique des livrables de déploiement, exit 0 si tout passe, exit 1 sinon. Vérifications reconnues : `ecosystem` (cette tâche), `vhost` (10.3), `backup` (10.4), `install` (10.5) ;
  - fonctions réutilisables du harnais : `ok`, `fail`, `expect_file`, `expect_exec`, `expect_grep` ;
  - `deploy/ecosystem.config.js` — fichier PM2 exportant `{ apps: [suivi-api, suivi-web] }`.

- [ ] **Étape 1: écrire le test qui échoue (harnais + vérification `ecosystem`)**

  Créer `deploy/check-deploy.sh` :

  ```bash
  #!/usr/bin/env bash
  # Vérification statique des livrables de déploiement (dossier deploy/).
  # Usage : ./deploy/check-deploy.sh [ecosystem|vhost|backup|install|all]
  # Sans argument : équivalent à "all".
  # Aucun accès réseau, aucun service démarré : uniquement de la lecture de fichiers.
  set -euo pipefail

  ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
  ALL_CHECKS=(ecosystem vhost backup install)
  failures=0

  ok() {
    printf 'OK   : %s\n' "$1"
  }

  fail() {
    printf 'ECHEC: %s\n' "$1" >&2
    failures=$((failures + 1))
  }

  # Le fichier existe.
  expect_file() {
    if [ -f "$ROOT/$1" ]; then
      ok "fichier présent : $1"
    else
      fail "fichier manquant : $1"
    fi
  }

  # Le fichier existe et porte le bit exécutable.
  expect_exec() {
    if [ -x "$ROOT/$1" ]; then
      ok "fichier exécutable : $1"
    else
      fail "fichier non exécutable (chmod +x manquant ?) : $1"
    fi
  }

  # Le fichier contient un motif ERE.
  expect_grep() {
    local file="$1"
    local pattern="$2"
    local label="$3"
    if [ -f "$ROOT/$file" ] && grep -Eq -- "$pattern" "$ROOT/$file"; then
      ok "$label"
    else
      fail "$label — motif « $pattern » absent de $file"
    fi
  }

  check_ecosystem() {
    expect_file "deploy/ecosystem.config.js"
    if node -e '
      const assert = require("assert");
      const cfg = require(process.argv[1] + "/deploy/ecosystem.config.js");
      assert.ok(Array.isArray(cfg.apps), "cfg.apps doit être un tableau");
      assert.strictEqual(cfg.apps.length, 2, "il faut exactement 2 process PM2");
      const api = cfg.apps.find((a) => a.name === "suivi-api");
      const web = cfg.apps.find((a) => a.name === "suivi-web");
      assert.ok(api, "process suivi-api manquant");
      assert.ok(web, "process suivi-web manquant");
      assert.strictEqual(api.cwd, "./apps/api", "suivi-api doit tourner dans apps/api (dotenv y lit .env)");
      assert.strictEqual(api.script, "dist/main.js");
      assert.strictEqual(api.env.NODE_ENV, "production");
      assert.strictEqual(String(api.env.PORT), "3001");
      assert.strictEqual(web.cwd, "./apps/web");
      assert.strictEqual(web.script, "pnpm");
      assert.strictEqual(web.args, "start");
      assert.strictEqual(web.interpreter, "none", "pnpm est un exécutable, pas un script node");
      assert.strictEqual(web.env.NODE_ENV, "production");
      assert.strictEqual(String(web.env.PORT), "3000");
      assert.ok(web.env.API_INTERNAL_URL, "suivi-web doit exposer API_INTERNAL_URL (appels serveur -> API)");
    ' "$ROOT"; then
      ok "ecosystem.config.js : suivi-api (:3001) et suivi-web (:3000) conformes"
    else
      fail "ecosystem.config.js : configuration PM2 non conforme (voir l'erreur node ci-dessus)"
    fi
  }

  run_check() {
    local name="$1"
    printf '\n--- %s ---\n' "$name"
    if declare -F "check_$name" >/dev/null; then
      "check_$name"
    else
      fail "vérification « $name » non implémentée (fonction check_$name absente)"
    fi
  }

  main() {
    local checks=("$@")
    if [ "${#checks[@]}" -eq 0 ] || [ "${checks[0]}" = "all" ]; then
      checks=("${ALL_CHECKS[@]}")
    fi

    local name
    for name in "${checks[@]}"; do
      run_check "$name"
    done

    printf '\n'
    if [ "$failures" -ne 0 ]; then
      printf '%d vérification(s) en échec.\n' "$failures" >&2
      exit 1
    fi
    printf 'Toutes les vérifications de déploiement passent.\n'
  }

  main "$@"
  ```

  Rendre le script exécutable :

  ```bash
  chmod +x deploy/check-deploy.sh
  ```

- [ ] **Étape 2: lancer le test (FAIL)**

  ```bash
  ./deploy/check-deploy.sh ecosystem
  ```

  Résultat attendu : **FAIL** (exit 1) —
  `ECHEC: fichier manquant : deploy/ecosystem.config.js`, suivi d'une erreur node
  `Cannot find module '…/deploy/ecosystem.config.js'` et de
  `ECHEC: ecosystem.config.js : configuration PM2 non conforme`, puis
  `2 vérification(s) en échec.`

- [ ] **Étape 3: implémentation minimale (fichier PM2)**

  Créer `deploy/ecosystem.config.js` :

  ```js
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
  ```

- [ ] **Étape 4: relancer le test (PASS)**

  ```bash
  ./deploy/check-deploy.sh ecosystem
  ```

  Résultat attendu : **PASS** (exit 0) — deux lignes `OK` puis
  `Toutes les vérifications de déploiement passent.`

- [ ] **Étape 5: commit**

  ```bash
  git add deploy/check-deploy.sh deploy/ecosystem.config.js
  git commit -m "feat: configuration PM2 des deux process et harnais de verification deploy"
  ```

> À vérifier à l'exécution : (1) que PM2 résout bien les `cwd` relatifs par rapport au répertoire depuis lequel `pm2 start` est lancé — si ce n'est pas le cas sur la version PM2 installée, remplacer les deux `cwd` par des chemins absolus (`/home/suivi/suivi-commandes/apps/api` et `.../apps/web`) ; (2) que `pnpm` est bien dans le `PATH` du process PM2 (`pm2 env 0`) — sinon remplacer `script: 'pnpm'` par le chemin absolu donné par `which pnpm` ; (3) que `/var/log/pm2/` existe et est accessible en écriture à l'utilisateur `suivi` (`sudo install -d -o suivi -g suivi /var/log/pm2`), sinon retirer les clés `error_file`/`out_file` pour laisser PM2 écrire dans `~/.pm2/logs`.

---

### Task 10.3: VirtualHost Apache (HTTPS, proxy REST et WebSocket)

**Files:**
- Create: `deploy/apache-vhost.conf`
- Modify: `deploy/check-deploy.sh` (ajout de `check_vhost`)
- Test: `./deploy/check-deploy.sh vhost`

**Interfaces:**
- Consomme : ports des contrats (web 3000, api 3001), préfixe API `/api`, path Socket.IO `/socket.io` (contrats § Événements Socket.IO), et le `trust proxy` posé en Task 10.1 (qui rend `X-Forwarded-Proto` effectif).
- Produit : `deploy/apache-vhost.conf` — fichier à copier en `/etc/apache2/sites-available/suivi-commandes.conf` sur le VPS, contenant un VirtualHost `*:80` (redirection 301 vers HTTPS, hors challenge ACME) et un VirtualHost `*:443` (TLS + reverse proxy complet).

- [ ] **Étape 1: écrire le test qui échoue (`check_vhost`)**

  Dans `deploy/check-deploy.sh`, insérer la fonction suivante **juste avant** la ligne
  `run_check() {` :

  ```bash
  check_vhost() {
    local f="deploy/apache-vhost.conf"
    expect_file "$f"
    expect_grep "$f" '<VirtualHost \*:80>' "vhost : bloc HTTP *:80 présent"
    expect_grep "$f" '<VirtualHost \*:443>' "vhost : bloc HTTPS *:443 présent"
    expect_grep "$f" 'RewriteRule .*https://%\{SERVER_NAME\}.*\[R=301' \
      "vhost : redirection 301 du port 80 vers HTTPS"
    expect_grep "$f" 'acme-challenge' \
      "vhost : le challenge certbot HTTP-01 échappe à la redirection"
    expect_grep "$f" '^[[:space:]]*SSLEngine on' "vhost : SSLEngine activé"
    expect_grep "$f" 'SSLCertificateFile[[:space:]]+/etc/letsencrypt/live/' \
      "vhost : chemin certbot du certificat documenté"
    expect_grep "$f" 'SSLCertificateKeyFile[[:space:]]+/etc/letsencrypt/live/' \
      "vhost : chemin certbot de la clé documenté"
    expect_grep "$f" '^[[:space:]]*ProxyPreserveHost On' "vhost : ProxyPreserveHost On"
    expect_grep "$f" 'RequestHeader set X-Forwarded-Proto "https"' \
      "vhost : en-tête X-Forwarded-Proto transmis à l'API"
    expect_grep "$f" 'RewriteCond %\{HTTP:Upgrade\} =websocket' \
      "vhost : condition de bascule WebSocket"
    expect_grep "$f" 'RewriteRule .*ws://127\.0\.0\.1:3001/socket\.io/.*\[P' \
      "vhost : tunnel WebSocket vers ws://127.0.0.1:3001/socket.io/ (mod_proxy_wstunnel)"
    expect_grep "$f" 'ProxyPass[[:space:]]+/socket\.io/[[:space:]]+http://127\.0\.0\.1:3001/socket\.io/' \
      "vhost : polling HTTP Socket.IO vers :3001"
    expect_grep "$f" 'ProxyPass[[:space:]]+/api[[:space:]]+http://127\.0\.0\.1:3001/api' \
      "vhost : /api vers :3001"
    expect_grep "$f" 'ProxyPass[[:space:]]+/[[:space:]]+http://127\.0\.0\.1:3000/' \
      "vhost : / vers Next.js :3000"
    expect_grep "$f" 'ProxyPassReverse[[:space:]]+/[[:space:]]+http://127\.0\.0\.1:3000/' \
      "vhost : ProxyPassReverse sur la racine"
    expect_grep "$f" 'a2enmod .*proxy_wstunnel' \
      "vhost : commande a2enmod rappelée en commentaire"
  }
  ```

- [ ] **Étape 2: lancer le test (FAIL)**

  ```bash
  ./deploy/check-deploy.sh vhost
  ```

  Résultat attendu : **FAIL** (exit 1) — `ECHEC: fichier manquant : deploy/apache-vhost.conf`
  suivi de 16 lignes `ECHEC: … motif « … » absent de deploy/apache-vhost.conf`, puis
  `17 vérification(s) en échec.`

- [ ] **Étape 3: implémentation minimale (le VirtualHost)**

  Créer `deploy/apache-vhost.conf` :

  ```apache
  # =====================================================================
  # Suivi commandes — VirtualHost Apache 2.4 (Debian 13)
  #
  # Destination sur le VPS :
  #   /etc/apache2/sites-available/suivi-commandes.conf
  #
  # Modules requis (une seule fois) :
  #   sudo a2enmod proxy proxy_http proxy_wstunnel rewrite ssl headers
  #   sudo systemctl restart apache2
  #
  # AVANT ACTIVATION : remplacer partout suivi.exemple.fr par le vrai
  # sous-domaine (celui dont l'enregistrement DNS A pointe sur le VPS).
  #   sudo sed -i 's/suivi\.exemple\.fr/suivi.mondomaine.fr/g' \
  #     /etc/apache2/sites-available/suivi-commandes.conf
  #
  # Répartition du trafic :
  #   /socket.io  -> NestJS  127.0.0.1:3001  (WebSocket + polling long)
  #   /api        -> NestJS  127.0.0.1:3001  (REST)
  #   /           -> Next.js 127.0.0.1:3000  (interface)
  # =====================================================================

  <VirtualHost *:80>
      ServerName suivi.exemple.fr

      # Racine servie uniquement pour le challenge HTTP-01 de certbot.
      DocumentRoot /var/www/html

      RewriteEngine On
      # Tout est redirigé en HTTPS SAUF le challenge ACME (renouvellement certbot).
      RewriteCond %{REQUEST_URI} !^/\.well-known/acme-challenge/
      RewriteRule ^/?(.*)$ https://%{SERVER_NAME}/$1 [R=301,L]

      ErrorLog ${APACHE_LOG_DIR}/suivi-commandes-80-error.log
      CustomLog ${APACHE_LOG_DIR}/suivi-commandes-80-access.log combined
  </VirtualHost>

  <IfModule mod_ssl.c>
  <VirtualHost *:443>
      ServerName suivi.exemple.fr

      SSLEngine on

      # ------------------------------------------------------------------
      # Certificat : `sudo certbot --apache -d suivi.exemple.fr` écrit
      # lui-même ces trois directives. Les laisser commentées lors du
      # premier déploiement ; ne les décommenter (en ajustant le nom de
      # domaine) que si le certificat est obtenu autrement, par exemple
      # `sudo certbot certonly --webroot -w /var/www/html -d suivi.exemple.fr`.
      # ------------------------------------------------------------------
      #SSLCertificateFile    /etc/letsencrypt/live/suivi.exemple.fr/fullchain.pem
      #SSLCertificateKeyFile /etc/letsencrypt/live/suivi.exemple.fr/privkey.pem
      #Include               /etc/letsencrypt/options-ssl-apache.conf

      # ------------------------------------------------------------------
      # Reverse proxy
      # ------------------------------------------------------------------
      ProxyRequests Off
      ProxyPreserveHost On

      # L'API (Express derrière NestJS) est configurée avec `trust proxy = 1` :
      # elle lit ces en-têtes pour savoir que la requête d'origine était en HTTPS
      # (indispensable pour le cookie JWT `secure`).
      RequestHeader set X-Forwarded-Proto "https"
      RequestHeader set X-Forwarded-Port "443"

      # ---- WebSocket (Socket.IO) --------------------------------------
      # DOIT être déclaré avant les ProxyPass : mod_rewrite avec [P] passe
      # la main à mod_proxy_wstunnel pour les requêtes d'upgrade.
      RewriteEngine On
      RewriteCond %{HTTP:Upgrade} =websocket [NC]
      RewriteCond %{HTTP:Connection} upgrade [NC]
      RewriteRule ^/socket\.io/(.*)$ ws://127.0.0.1:3001/socket.io/$1 [P,L]

      # Transport de repli de Socket.IO (long polling, requêtes HTTP normales).
      ProxyPass        /socket.io/ http://127.0.0.1:3001/socket.io/
      ProxyPassReverse /socket.io/ http://127.0.0.1:3001/socket.io/

      # ---- API REST ----------------------------------------------------
      ProxyPass        /api http://127.0.0.1:3001/api
      ProxyPassReverse /api http://127.0.0.1:3001/api

      # ---- Interface Next.js (préfixe le plus large : toujours en dernier)
      ProxyPass        / http://127.0.0.1:3000/
      ProxyPassReverse / http://127.0.0.1:3000/

      # Les connexions WebSocket sont longues : ne pas les couper trop tôt.
      ProxyTimeout 300

      # ---- En-têtes de sécurité (mod_headers) --------------------------
      Header always set X-Content-Type-Options "nosniff"
      Header always set X-Frame-Options "SAMEORIGIN"
      Header always set Referrer-Policy "same-origin"

      ErrorLog ${APACHE_LOG_DIR}/suivi-commandes-error.log
      CustomLog ${APACHE_LOG_DIR}/suivi-commandes-access.log combined
  </VirtualHost>
  </IfModule>
  ```

- [ ] **Étape 4: relancer le test (PASS)**

  ```bash
  ./deploy/check-deploy.sh vhost
  ```

  Résultat attendu : **PASS** (exit 0) — 17 lignes `OK` puis
  `Toutes les vérifications de déploiement passent.`

- [ ] **Étape 5: commit**

  ```bash
  git add deploy/apache-vhost.conf deploy/check-deploy.sh
  git commit -m "feat: vhost Apache HTTPS avec proxy REST et tunnel WebSocket"
  ```

> À vérifier à l'exécution : (1) la validité syntaxique réelle du fichier, qui ne peut être testée que sur le serveur avec `sudo apachectl configtest` (attendu : `Syntax OK`) — c'est une étape de `deploy/install.md` ; (2) que `certbot --apache` insère bien ses directives dans le bloc `*:443` existant plutôt que de créer un second fichier `suivi-commandes-le-ssl.conf` — si certbot crée son propre fichier, désactiver le nôtre pour le 443 (`sudo a2dissite`) ou recopier les blocs proxy dans le fichier généré ; (3) que `ProxyPass /api http://127.0.0.1:3001/api` sans barre oblique finale conserve bien le préfixe (`/api/rows` → `http://127.0.0.1:3001/api/rows`) : le tester avec `curl -i https://suivi.exemple.fr/api/health`.

---

### Task 10.4: Sauvegarde PostgreSQL quotidienne (script + procédure)

**Files:**
- Create: `deploy/backup.sh`, `deploy/backup.md`
- Modify: `deploy/check-deploy.sh` (ajout de `check_backup`)
- Test: `./deploy/check-deploy.sh backup` puis `shellcheck deploy/backup.sh deploy/check-deploy.sh`

**Interfaces:**
- Consomme : la base PostgreSQL 16 des contrats (`DATABASE_URL` de `apps/api/.env`), nom de base `suivi_commandes`, utilisateur `suivi`.
- Produit :
  - `deploy/backup.sh` — dump `pg_dump --format=custom` vers `/var/backups/suivi-commandes/AAAA-MM-JJ.dump`, rotation à 30 jours ; paramétrable par variables d'environnement `BACKUP_DIR`, `DB_NAME`, `DB_USER`, `DB_HOST`, `DB_PORT`, `RETENTION_DAYS`, `PGPASSFILE` ;
  - `deploy/backup.md` — installation du cron (3 h 00), procédure de restauration, vérifications.

- [ ] **Étape 1: écrire le test qui échoue (`check_backup`)**

  Dans `deploy/check-deploy.sh`, insérer la fonction suivante **juste avant** la ligne
  `run_check() {` :

  ```bash
  check_backup() {
    local s="deploy/backup.sh"
    local d="deploy/backup.md"
    expect_file "$s"
    expect_exec "$s"
    expect_grep "$s" '^#!/usr/bin/env bash' "backup.sh : shebang bash"
    expect_grep "$s" '^set -euo pipefail' "backup.sh : set -euo pipefail"
    expect_grep "$s" 'BACKUP_DIR:-/var/backups/suivi-commandes' \
      "backup.sh : dossier /var/backups/suivi-commandes par défaut"
    expect_grep "$s" 'date \+%F' "backup.sh : nom de fichier daté AAAA-MM-JJ"
    expect_grep "$s" 'pg_dump' "backup.sh : utilise pg_dump"
    expect_grep "$s" '\-\-format=custom' "backup.sh : format custom (-Fc) restaurable sélectivement"
    expect_grep "$s" 'find .*-mtime .*-delete' "backup.sh : rotation par find -mtime -delete"
    expect_grep "$s" 'RETENTION_DAYS:-30' "backup.sh : rétention 30 jours par défaut"

    if bash -n "$ROOT/$s" 2>/dev/null; then
      ok "backup.sh : syntaxe bash valide (bash -n)"
    else
      fail "backup.sh : erreur de syntaxe bash"
    fi

    if command -v shellcheck >/dev/null 2>&1; then
      if shellcheck "$ROOT/deploy/backup.sh" "$ROOT/deploy/check-deploy.sh"; then
        ok "shellcheck : aucun avertissement sur backup.sh et check-deploy.sh"
      else
        fail "shellcheck : avertissements à corriger (voir ci-dessus)"
      fi
    else
      ok "shellcheck absent de la machine — relecture manuelle requise (voir Étape 6)"
    fi

    expect_file "$d"
    expect_grep "$d" 'pg_restore' "backup.md : procédure de restauration documentée"
    expect_grep "$d" '0 3 \* \* \*' "backup.md : ligne crontab à 3 h 00"
    expect_grep "$d" '/var/backups/suivi-commandes' "backup.md : emplacement des sauvegardes"
  }
  ```

- [ ] **Étape 2: lancer le test (FAIL)**

  ```bash
  ./deploy/check-deploy.sh backup
  ```

  Résultat attendu : **FAIL** (exit 1) — `ECHEC: fichier manquant : deploy/backup.sh`,
  `ECHEC: fichier non exécutable (chmod +x manquant ?) : deploy/backup.sh`, les 8
  `expect_grep` sur `backup.sh` en échec, `ECHEC: backup.sh : erreur de syntaxe bash`,
  `ECHEC: fichier manquant : deploy/backup.md` et ses 3 `expect_grep` en échec —
  soit `16 vérification(s) en échec.` si `shellcheck` est installé (il échoue lui aussi
  sur un fichier absent), `15 vérification(s) en échec.` s'il ne l'est pas.

- [ ] **Étape 3: implémentation minimale (le script de sauvegarde)**

  Créer `deploy/backup.sh` :

  ```bash
  #!/usr/bin/env bash
  # =====================================================================
  # Sauvegarde quotidienne de la base « suivi_commandes ».
  #
  # Produit /var/backups/suivi-commandes/AAAA-MM-JJ.dump au format custom
  # pg_dump (-Fc) : compressé, restaurable table par table avec pg_restore.
  # Les dumps de plus de 30 jours sont supprimés.
  #
  # Installation et restauration : voir deploy/backup.md
  # =====================================================================
  set -euo pipefail

  BACKUP_DIR="${BACKUP_DIR:-/var/backups/suivi-commandes}"
  DB_NAME="${DB_NAME:-suivi_commandes}"
  DB_USER="${DB_USER:-suivi}"
  DB_HOST="${DB_HOST:-127.0.0.1}"
  DB_PORT="${DB_PORT:-5432}"
  RETENTION_DAYS="${RETENTION_DAYS:-30}"

  # Mot de passe lu dans un fichier .pgpass (jamais sur la ligne de commande,
  # jamais dans ce fichier versionné). Format d'une ligne :
  #   127.0.0.1:5432:suivi_commandes:suivi:<mot_de_passe>
  export PGPASSFILE="${PGPASSFILE:-/etc/suivi-commandes/pgpass}"

  if [ ! -r "$PGPASSFILE" ]; then
    printf 'Fichier de mot de passe illisible : %s\n' "$PGPASSFILE" >&2
    printf 'Créez-le (chmod 600) — voir deploy/backup.md.\n' >&2
    exit 1
  fi

  stamp="$(date +%F)"                 # AAAA-MM-JJ
  target="$BACKUP_DIR/$stamp.dump"

  mkdir -p "$BACKUP_DIR"
  chmod 700 "$BACKUP_DIR"
  umask 077

  # Écriture dans un fichier temporaire puis renommage : un dump interrompu
  # ne laisse jamais un « .dump » incomplet qui passerait pour valide.
  pg_dump \
    --format=custom \
    --compress=9 \
    --no-owner \
    --no-privileges \
    --host="$DB_HOST" \
    --port="$DB_PORT" \
    --username="$DB_USER" \
    --dbname="$DB_NAME" \
    --file="$target.partiel"

  mv -f "$target.partiel" "$target"

  # Rotation : suppression des dumps de plus de RETENTION_DAYS jours.
  find "$BACKUP_DIR" -maxdepth 1 -type f -name '*.dump' -mtime "+$RETENTION_DAYS" -delete

  size="$(du -h "$target" | cut -f1)"
  printf '%s — sauvegarde terminée : %s (%s)\n' "$(date '+%F %T')" "$target" "$size"
  ```

  Rendre le script exécutable :

  ```bash
  chmod +x deploy/backup.sh
  ```

- [ ] **Étape 4: implémentation minimale (la procédure de sauvegarde)**

  Créer `deploy/backup.md` :

  ````markdown
  # Sauvegarde et restauration — suivi des commandes

  Une seule chose est irremplaçable sur ce serveur : la base PostgreSQL
  `suivi_commandes`. Le code se reclone depuis GitHub, les fichiers de
  configuration sont dans `deploy/`. Ce document décrit la sauvegarde
  quotidienne automatique et la restauration.

  ## 1. Ce qui est sauvegardé

  | Élément | Sauvegardé | Où |
  |---|---|---|
  | Base `suivi_commandes` (lignes, colonnes, choix, utilisateurs, historique) | oui, chaque nuit | `/var/backups/suivi-commandes/AAAA-MM-JJ.dump` |
  | Code de l'application | non (dépôt GitHub) | — |
  | `apps/api/.env` (JWT_SECRET, DATABASE_URL) | non | à recopier depuis votre gestionnaire de mots de passe |
  | Certificat TLS | non (regénérable par certbot) | — |

  Format : `pg_dump --format=custom` (compressé, restaurable table par table).
  Rétention : 30 jours glissants, les dumps plus anciens sont supprimés.

  > Copiez `apps/api/.env` dans votre gestionnaire de mots de passe le jour de
  > l'installation. Sans `JWT_SECRET`, toutes les sessions ouvertes sont invalidées
  > à la restauration (les membres devront se reconnecter) ; sans `DATABASE_URL`,
  > il faut recréer le mot de passe PostgreSQL.

  ## 2. Installation de la sauvegarde automatique

  ### 2.1 Fichier de mot de passe PostgreSQL

  Le script ne prend jamais le mot de passe en argument. Il lit un fichier
  `.pgpass` :

  ```bash
  sudo install -d -m 700 /etc/suivi-commandes
  sudo tee /etc/suivi-commandes/pgpass >/dev/null <<'EOF'
  127.0.0.1:5432:suivi_commandes:suivi:LE_MOT_DE_PASSE_POSTGRES
  EOF
  sudo chmod 600 /etc/suivi-commandes/pgpass
  ```

  Remplacer `LE_MOT_DE_PASSE_POSTGRES` par le mot de passe choisi à
  l'installation (celui présent dans `DATABASE_URL` de `apps/api/.env`).

  ### 2.2 Dossier de sauvegarde

  ```bash
  sudo install -d -m 700 /var/backups/suivi-commandes
  ```

  ### 2.3 Premier lancement manuel

  ```bash
  sudo /home/suivi/suivi-commandes/deploy/backup.sh
  ```

  Attendu : une ligne
  `2026-08-11 10:12:03 — sauvegarde terminée : /var/backups/suivi-commandes/2026-08-11.dump (1,2M)`
  et le fichier présent :

  ```bash
  sudo ls -lh /var/backups/suivi-commandes/
  ```

  ### 2.4 Tâche cron quotidienne (3 h 00)

  ```bash
  sudo crontab -e
  ```

  Ajouter la ligne :

  ```cron
  0 3 * * * /home/suivi/suivi-commandes/deploy/backup.sh >> /var/log/suivi-commandes-backup.log 2>&1
  ```

  Vérifier l'enregistrement :

  ```bash
  sudo crontab -l | grep backup.sh
  ```

  Le lendemain matin, contrôler :

  ```bash
  sudo tail -n 5 /var/log/suivi-commandes-backup.log
  sudo ls -lh /var/backups/suivi-commandes/
  ```

  ## 3. Vérifier qu'un dump est exploitable

  Un dump jamais relu n'est pas une sauvegarde. Une fois par trimestre :

  ```bash
  # Lister le contenu du dump sans rien restaurer
  sudo pg_restore --list /var/backups/suivi-commandes/2026-08-11.dump | head -n 30
  ```

  Attendu : la liste des tables `User`, `Column`, `Choice`, `Row`, `RowEvent`.

  Restauration à blanc dans une base jetable :

  ```bash
  sudo -u postgres createdb suivi_commandes_test
  sudo -u postgres pg_restore --no-owner --dbname=suivi_commandes_test \
    /var/backups/suivi-commandes/2026-08-11.dump
  sudo -u postgres psql -d suivi_commandes_test -c 'SELECT count(*) FROM "Row";'
  sudo -u postgres dropdb suivi_commandes_test
  ```

  Attendu : `pg_restore` sans erreur, et un compte de lignes cohérent avec
  l'application.

  ## 4. Restauration réelle (perte de données)

  ⚠️ Cette procédure **écrase** les données actuelles. À ne lancer qu'en
  connaissance de cause.

  ```bash
  # 1. Arrêter l'application pour qu'aucune écriture ne parte en base
  pm2 stop suivi-api suivi-web

  # 2. Restaurer par-dessus la base existante
  sudo -u postgres pg_restore \
    --clean --if-exists --no-owner --no-privileges \
    --dbname=suivi_commandes \
    /var/backups/suivi-commandes/AAAA-MM-JJ.dump

  # 3. Redémarrer
  pm2 start suivi-api suivi-web
  pm2 status
  ```

  Puis vérifier dans le navigateur qu'un mois connu affiche bien ses lignes,
  et côté serveur :

  ```bash
  curl -s https://suivi.exemple.fr/api/health
  ```

  Attendu : `{"status":"ok"}`.

  ## 5. Copie hors du serveur (recommandé)

  Les dumps vivent sur le même disque que la base : une panne de disque les
  emporte tous les deux. Depuis un poste de travail allumé quotidiennement :

  ```bash
  rsync -avz --delete \
    suivi@suivi.exemple.fr:/var/backups/suivi-commandes/ \
    ~/sauvegardes/suivi-commandes/
  ```

  (L'utilisateur `suivi` doit pouvoir lire `/var/backups/suivi-commandes` :
  `sudo chown -R suivi:suivi /var/backups/suivi-commandes`.)
  ````

- [ ] **Étape 5: relancer le test (PASS)**

  ```bash
  ./deploy/check-deploy.sh backup
  ```

  Résultat attendu : **PASS** (exit 0) — 16 lignes `OK` puis
  `Toutes les vérifications de déploiement passent.` Si `shellcheck` est installé,
  la ligne `OK   : shellcheck : aucun avertissement sur backup.sh et check-deploy.sh`
  apparaît ; sinon la ligne indiquant qu'il est absent.

- [ ] **Étape 6: passer shellcheck explicitement (ou relecture manuelle)**

  ```bash
  shellcheck deploy/backup.sh deploy/check-deploy.sh && echo "shellcheck OK"
  ```

  Résultat attendu : aucune sortie de shellcheck, puis `shellcheck OK`.

  Si la commande renvoie `shellcheck: command not found`, l'installer
  (`sudo apt install -y shellcheck`) ou, à défaut, relire les deux scripts en
  contrôlant les cinq points que shellcheck vérifierait :

  1. toute expansion de variable est entre guillemets (`"$target"`, `"${checks[@]}"`) ;
  2. aucune variable n'est utilisée sans valeur par défaut (`${VAR:-défaut}`) ;
  3. les substitutions de commande utilisent `$( )` et jamais les accents graves ;
  4. `local` et affectation par substitution de commande ne sont pas sur la même ligne ;
  5. `set -euo pipefail` est présent en tête des deux scripts.

- [ ] **Étape 7: commit**

  ```bash
  git add deploy/backup.sh deploy/backup.md deploy/check-deploy.sh
  git commit -m "feat: sauvegarde postgres quotidienne (pg_dump custom, rotation 30j) et procedure"
  ```

> À vérifier à l'exécution : (1) que `pg_dump` installé sur le VPS est bien celui de PostgreSQL 16 (`pg_dump --version`) — un `pg_dump` plus ancien que le serveur refuse de dumper ; (2) le comportement exact de `find -mtime +30` (il compare des multiples de 24 h à partir de la date de modification : un fichier de 30,5 jours n'est pas encore supprimé, ce qui est le comportement souhaité, la rétention est « au moins 30 jours ») ; (3) que `du -h` est disponible dans l'environnement cron minimal (paquet `coreutils`, présent par défaut sur Debian).

---

### Task 10.5: Procédure d'installation pas à pas (Debian 13)

**Files:**
- Create: `deploy/install.md`
- Modify: `deploy/check-deploy.sh` (ajout de `check_install`)
- Test: `./deploy/check-deploy.sh install`

**Interfaces:**
- Consomme : tous les livrables précédents (`deploy/ecosystem.config.js`, `deploy/apache-vhost.conf`, `deploy/backup.sh`, `deploy/backup.md`) ; scripts des contrats (`prisma migrate deploy`, `prisma db seed`, `import:xlsx`, `build` des deux apps) ; variables d'env des contrats (`DATABASE_URL`, `JWT_SECRET`, `APP_URL`, `PORT`, `NEXT_PUBLIC_API_URL`, `API_INTERNAL_URL`).
- Produit : `deploy/install.md` — procédure complète et ordonnée, de la machine nue au site en HTTPS, plus la procédure de mise à jour d'une version ultérieure.

- [ ] **Étape 1: écrire le test qui échoue (`check_install`)**

  Dans `deploy/check-deploy.sh`, insérer la fonction suivante **juste avant** la ligne
  `run_check() {` :

  ```bash
  check_install() {
    local f="deploy/install.md"
    expect_file "$f"
    expect_grep "$f" 'nodesource' "install : dépôt NodeSource pour Node 22"
    expect_grep "$f" 'setup_22\.x' "install : script d'installation Node 22"
    expect_grep "$f" 'corepack enable' "install : pnpm activé via corepack"
    expect_grep "$f" 'corepack prepare pnpm@' "install : version de pnpm épinglée"
    expect_grep "$f" 'postgresql-16' "install : PostgreSQL 16"
    expect_grep "$f" 'CREATE DATABASE suivi_commandes' "install : création de la base"
    expect_grep "$f" 'DATABASE_URL=postgresql://' "install : DATABASE_URL documentée"
    expect_grep "$f" 'openssl rand -base64 32' "install : JWT_SECRET généré aléatoirement"
    expect_grep "$f" 'git clone' "install : clonage du dépôt"
    expect_grep "$f" 'pnpm install --frozen-lockfile' "install : installation des dépendances"
    expect_grep "$f" 'prisma migrate deploy' "install : migrations Prisma en production"
    expect_grep "$f" 'prisma db seed' "install : seed initial"
    expect_grep "$f" 'import:xlsx' "install : import du classeur Excel"
    expect_grep "$f" 'filter @suivi/api build' "install : build de l'API"
    expect_grep "$f" 'filter @suivi/web build' "install : build du web"
    expect_grep "$f" 'pm2 start deploy/ecosystem.config.js' "install : démarrage PM2"
    expect_grep "$f" 'pm2 startup' "install : PM2 au démarrage du serveur"
    expect_grep "$f" 'pm2 save' "install : liste PM2 persistée"
    expect_grep "$f" 'a2enmod proxy proxy_http proxy_wstunnel rewrite ssl headers' \
      "install : activation des modules Apache"
    expect_grep "$f" 'a2ensite suivi-commandes' "install : activation du vhost"
    expect_grep "$f" 'apachectl configtest' "install : validation de la configuration Apache"
    expect_grep "$f" 'certbot --apache' "install : obtention du certificat TLS"
    expect_grep "$f" 'curl -s https://.*/api/health' "install : vérification finale HTTPS"
    expect_grep "$f" 'deploy/backup.md' "install : renvoi vers la procédure de sauvegarde"
  }
  ```

- [ ] **Étape 2: lancer le test (FAIL)**

  ```bash
  ./deploy/check-deploy.sh install
  ```

  Résultat attendu : **FAIL** (exit 1) — `ECHEC: fichier manquant : deploy/install.md`
  suivi de 24 lignes `ECHEC: … motif « … » absent de deploy/install.md`, puis
  `25 vérification(s) en échec.`

- [ ] **Étape 3: implémentation minimale (la procédure)**

  Créer `deploy/install.md` :

  ````markdown
  # Installation en production — suivi des commandes

  Cible : VPS **Debian 13 (trixie)**, accès `sudo`, sous-domaine dédié
  (exemple : `suivi.exemple.fr`) dont l'enregistrement DNS **A** pointe déjà
  sur l'adresse IP du VPS.

  Résultat attendu à la fin : `https://suivi.exemple.fr` affiche la page de
  connexion, l'API répond sur `/api`, la co-édition temps réel fonctionne, les
  deux process redémarrent tout seuls après un reboot, et la base est
  sauvegardée chaque nuit.

  Durée : environ 45 minutes. Toutes les commandes sont à exécuter dans l'ordre.

  Conventions de ce document :

  | Marqueur | À remplacer par |
  |---|---|
  | `suivi.exemple.fr` | votre sous-domaine réel |
  | `MOT_DE_PASSE_PG` | un mot de passe fort généré (voir étape 3.2) |
  | `<compte>/<depot>` | le chemin GitHub réel du dépôt |

  ---

  ## 1. Mise à jour du système et paquets de base

  ```bash
  sudo apt update && sudo apt upgrade -y
  sudo apt install -y curl ca-certificates gnupg git build-essential \
    apache2 openssl shellcheck
  ```

  Vérification :

  ```bash
  apache2 -v
  ```

  Attendu : `Server version: Apache/2.4.x`.

  ## 2. Node.js 22 LTS (dépôt NodeSource) et pnpm

  Debian ne fournit pas Node 22. On utilise le dépôt officiel NodeSource :

  ```bash
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt install -y nodejs
  ```

  Vérification :

  ```bash
  node --version
  ```

  Attendu : `v22.x.x`.

  pnpm est fourni par corepack (livré avec Node) :

  ```bash
  sudo corepack enable
  sudo corepack prepare pnpm@10.11.0 --activate
  pnpm --version
  ```

  Attendu : `10.11.0` (la version doit correspondre au champ `packageManager`
  du `package.json` racine).

  ## 3. PostgreSQL 16

  ### 3.1 Installation depuis le dépôt PGDG

  Le paquet `postgresql` de Debian 13 n'est pas en version 16 ; on installe donc
  depuis le dépôt officiel PostgreSQL :

  ```bash
  sudo install -d /usr/share/postgresql-common/pgdg
  sudo curl -fsSL -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc \
    https://www.postgresql.org/media/keys/ACCC4CF8.asc
  . /etc/os-release
  echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt ${VERSION_CODENAME}-pgdg main" \
    | sudo tee /etc/apt/sources.list.d/pgdg.list
  sudo apt update
  sudo apt install -y postgresql-16
  ```

  Vérification :

  ```bash
  psql --version
  sudo systemctl is-active postgresql
  ```

  Attendu : `psql (PostgreSQL) 16.x` et `active`.

  ### 3.2 Utilisateur et base

  Générer un mot de passe et le **conserver** (gestionnaire de mots de passe) :

  ```bash
  openssl rand -base64 24
  ```

  Créer le rôle et la base (remplacer `MOT_DE_PASSE_PG` par la valeur générée) :

  ```bash
  sudo -u postgres psql -c "CREATE USER suivi WITH PASSWORD 'MOT_DE_PASSE_PG';"
  sudo -u postgres psql -c "CREATE DATABASE suivi_commandes OWNER suivi;"
  ```

  Vérification de la connexion :

  ```bash
  PGPASSWORD='MOT_DE_PASSE_PG' psql -h 127.0.0.1 -U suivi -d suivi_commandes -c '\conninfo'
  ```

  Attendu : `You are connected to database "suivi_commandes" as user "suivi"…`.

  La chaîne de connexion à utiliser plus bas est donc :

  ```
  DATABASE_URL=postgresql://suivi:MOT_DE_PASSE_PG@127.0.0.1:5432/suivi_commandes?schema=public
  ```

  > Si le mot de passe contient `@`, `:`, `/` ou `?`, il doit être encodé URL
  > dans `DATABASE_URL`. Le plus simple est de régénérer un mot de passe
  > alphanumérique : `openssl rand -hex 24`.

  ## 4. Utilisateur système et code source

  L'application ne tourne pas en root :

  ```bash
  sudo adduser --disabled-password --gecos "" suivi
  sudo -iu suivi
  ```

  Toutes les commandes des sections 4 à 7 s'exécutent **en tant que `suivi`**
  (l'invite affiche `suivi@…$`).

  ```bash
  git clone https://github.com/<compte>/<depot>.git ~/suivi-commandes
  cd ~/suivi-commandes
  git checkout main
  pnpm install --frozen-lockfile
  ```

  Attendu : `Done in …s`, aucun `ERR_PNPM_OUTDATED_LOCKFILE`.

  ## 5. Fichiers d'environnement

  ### 5.1 API

  Générer le secret JWT :

  ```bash
  openssl rand -base64 32
  ```

  Créer `~/suivi-commandes/apps/api/.env` (remplacer les deux valeurs) :

  ```bash
  cat > ~/suivi-commandes/apps/api/.env <<'EOF'
  DATABASE_URL=postgresql://suivi:MOT_DE_PASSE_PG@127.0.0.1:5432/suivi_commandes?schema=public
  JWT_SECRET=LE_SECRET_GENERE_PAR_OPENSSL
  APP_URL=https://suivi.exemple.fr
  PORT=3001
  EOF
  chmod 600 ~/suivi-commandes/apps/api/.env
  ```

  ### 5.2 Web

  En production, le navigateur appelle l'API sur la **même origine**
  (`https://suivi.exemple.fr/api`) : `NEXT_PUBLIC_API_URL` reste donc vide. En
  revanche les Server Components (layout `(app)`, vérification de session) appellent
  l'API depuis le serveur et exigent une **URL absolue** : c'est le rôle de
  `API_INTERNAL_URL`, qui doit pointer vers le port local de l'API.

  ```bash
  cat > ~/suivi-commandes/apps/web/.env <<'EOF'
  NEXT_PUBLIC_API_URL=
  API_INTERNAL_URL=http://127.0.0.1:3001
  EOF
  ```

  Vérification :

  ```bash
  ls -l ~/suivi-commandes/apps/api/.env ~/suivi-commandes/apps/web/.env
  ```

  Attendu : les deux fichiers existent, `.env` de l'API en `-rw-------`.

  > Ces deux fichiers ne sont **pas** versionnés (`.gitignore`). Recopiez-les
  > dans votre gestionnaire de mots de passe : ils ne sont pas dans les
  > sauvegardes de base (voir `deploy/backup.md`).

  ## 6. Base de données : migrations, seed, import du classeur

  ```bash
  cd ~/suivi-commandes
  pnpm --filter @suivi/api exec prisma migrate deploy
  ```

  Attendu : `All migrations have been successfully applied.`
  (`migrate deploy` est la commande de production : elle applique les migrations
  existantes et n'en génère jamais de nouvelle, contrairement à `migrate dev`.)

  Données de départ (colonnes, listes, couleurs, premier compte) :

  ```bash
  pnpm --filter @suivi/api exec prisma db seed
  ```

  Attendu : le récapitulatif du seed (16 colonnes créées, choix colorés, compte
  initial). Notez l'email et le mot de passe initial affichés.

  Import du classeur Zoho (transférer d'abord le fichier `.xlsx` sur le VPS,
  par exemple avec `scp` depuis votre poste) :

  ```bash
  pnpm --filter @suivi/api run import:xlsx "/home/suivi/TABLEAU SUIVI COMMANDES 2026.xlsx"
  ```

  Attendu : le rapport d'import (compteurs par feuille, anomalies signalées).

  > L'import **purge et recharge** les lignes : il ne doit être joué qu'avant la
  > mise en service, jamais sur une base déjà utilisée par l'équipe.

  Contrôle rapide :

  ```bash
  PGPASSWORD='MOT_DE_PASSE_PG' psql -h 127.0.0.1 -U suivi -d suivi_commandes \
    -c 'SELECT month, count(*) FROM "Row" GROUP BY month ORDER BY month;'
  ```

  Attendu : une ligne par mois importé, avec des compteurs non nuls.

  ## 7. Build de production des deux applications

  ```bash
  cd ~/suivi-commandes
  pnpm --filter @suivi/api build
  NODE_ENV=production pnpm --filter @suivi/web build
  ```

  Attendu : deux sorties en code 0, `apps/api/dist/main.js` et `apps/web/.next/`
  présents :

  ```bash
  ls -l apps/api/dist/main.js && ls -d apps/web/.next
  ```

  ## 8. PM2 (démarrage et redémarrage automatique)

  Revenir en utilisateur `sudo` uniquement pour l'installation globale :

  ```bash
  exit                      # quitte la session « suivi »
  sudo npm install -g pm2
  sudo install -d -o suivi -g suivi /var/log/pm2
  sudo -iu suivi
  ```

  Démarrer les deux process (depuis la racine du dépôt : les `cwd` du fichier
  ecosystem sont relatifs) :

  ```bash
  cd ~/suivi-commandes
  pm2 start deploy/ecosystem.config.js
  pm2 status
  ```

  Attendu : deux lignes `suivi-api` et `suivi-web` en statut `online`.

  Vérification locale, avant même Apache :

  ```bash
  curl -s http://127.0.0.1:3001/api/health
  curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3000/
  ```

  Attendu : `{"status":"ok"}` puis `200` (ou `307` si la racine redirige vers
  `/login` — les deux sont acceptables).

  Persister la liste et l'installer au démarrage du serveur :

  ```bash
  pm2 save
  pm2 startup systemd
  ```

  `pm2 startup` **affiche** une commande `sudo env PATH=… pm2 startup systemd -u suivi --hp /home/suivi`.
  Sortir de la session `suivi` (`exit`) et coller cette commande telle quelle,
  puis vérifier :

  ```bash
  sudo systemctl is-enabled pm2-suivi
  ```

  Attendu : `enabled`.

  En cas de doute, tester réellement : `sudo reboot`, puis après reconnexion
  `sudo -iu suivi pm2 status` doit afficher les deux process `online`.

  ## 9. Apache : modules, VirtualHost, HTTPS

  ### 9.1 Modules

  ```bash
  sudo a2enmod proxy proxy_http proxy_wstunnel rewrite ssl headers
  sudo systemctl restart apache2
  ```

  Vérification :

  ```bash
  apache2ctl -M | grep -E 'proxy_http|proxy_wstunnel|rewrite|ssl|headers'
  ```

  Attendu : les cinq modules listés (`proxy_http_module`,
  `proxy_wstunnel_module`, `rewrite_module`, `ssl_module`, `headers_module`).

  ### 9.2 VirtualHost

  ```bash
  sudo cp /home/suivi/suivi-commandes/deploy/apache-vhost.conf \
    /etc/apache2/sites-available/suivi-commandes.conf
  sudo sed -i 's/suivi\.exemple\.fr/suivi.exemple.fr/g' \
    /etc/apache2/sites-available/suivi-commandes.conf
  ```

  (Dans la commande `sed`, remplacer la **deuxième** occurrence par votre vrai
  sous-domaine.)

  ```bash
  sudo a2ensite suivi-commandes
  sudo apachectl configtest
  ```

  Attendu : `Syntax OK`. En cas d'erreur, la corriger avant d'aller plus loin.

  ```bash
  sudo systemctl reload apache2
  curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' http://suivi.exemple.fr/
  ```

  Attendu : `301 https://suivi.exemple.fr/`.

  ### 9.3 Certificat TLS

  ```bash
  sudo apt install -y certbot python3-certbot-apache
  sudo certbot --apache -d suivi.exemple.fr
  ```

  Répondre : adresse email d'administration, acceptation des conditions
  Let's Encrypt, et **ne pas** demander la redirection automatique (elle est
  déjà dans le VirtualHost `*:80`).

  Vérifier le renouvellement automatique :

  ```bash
  sudo certbot renew --dry-run
  sudo systemctl list-timers | grep certbot
  ```

  Attendu : `Congratulations, all simulated renewals succeeded` et un timer actif.

  ```bash
  sudo apachectl configtest && sudo systemctl reload apache2
  ```

  ## 10. Pare-feu (optionnel mais recommandé)

  ```bash
  sudo apt install -y ufw
  sudo ufw allow OpenSSH
  sudo ufw allow 'WWW Full'
  sudo ufw --force enable
  sudo ufw status
  ```

  Attendu : seuls 22, 80 et 443 sont ouverts. Les ports 3000 et 3001 ne sont
  **jamais** exposés : les process écoutent derrière Apache et le pare-feu.

  ## 11. Sauvegardes

  Suivre `deploy/backup.md` (fichier `.pgpass`, dossier de sauvegarde, premier
  dump manuel, ligne crontab de 3 h 00). À faire le jour de l'installation, pas
  « plus tard ».

  ## 12. Vérifications finales

  ```bash
  # API derrière HTTPS
  curl -s https://suivi.exemple.fr/api/health

  # Interface
  curl -s -o /dev/null -w '%{http_code}\n' https://suivi.exemple.fr/

  # Négociation WebSocket (Socket.IO en transport polling puis upgrade)
  curl -s "https://suivi.exemple.fr/socket.io/?EIO=4&transport=polling" | head -c 120

  # Process
  sudo -iu suivi pm2 status
  ```

  Attendu :

  1. `{"status":"ok"}` ;
  2. `200` (ou `307` vers `/login`) ;
  3. une réponse commençant par `0{"sid":"…` (poignée de main Socket.IO) — si la
     réponse est du HTML, c'est que `/socket.io` part vers Next.js : revoir
     l'ordre des `ProxyPass` dans le VirtualHost ;
  4. `suivi-api` et `suivi-web` en `online`.

  Puis, dans un navigateur :

  1. ouvrir `https://suivi.exemple.fr` → page de connexion, cadenas valide ;
  2. se connecter avec le compte du seed ;
  3. ouvrir la même page dans une seconde fenêtre (autre navigateur ou navigation
     privée) avec un second compte → les deux avatars apparaissent dans la barre
     de présence ;
  4. modifier une cellule dans une fenêtre → la valeur apparaît immédiatement
     dans l'autre (c'est la preuve que le tunnel WebSocket fonctionne) ;
  5. recharger la page → la valeur est persistée.

  ## 13. Mettre à jour l'application (versions suivantes)

  ```bash
  sudo -iu suivi
  cd ~/suivi-commandes
  git fetch origin && git checkout main && git pull
  pnpm install --frozen-lockfile
  pnpm --filter @suivi/api exec prisma migrate deploy
  pnpm --filter @suivi/api build
  NODE_ENV=production pnpm --filter @suivi/web build
  pm2 restart suivi-api suivi-web
  pm2 status
  curl -s https://suivi.exemple.fr/api/health
  ```

  Avant toute mise à jour touchant la base, lancer une sauvegarde manuelle :

  ```bash
  sudo /home/suivi/suivi-commandes/deploy/backup.sh
  ```

  ## 14. Diagnostic

  | Symptôme | Où regarder |
  |---|---|
  | Page blanche / 502 | `sudo -iu suivi pm2 logs suivi-web --lines 50` |
  | `/api` en 502 | `sudo -iu suivi pm2 logs suivi-api --lines 50` |
  | Temps réel muet, bandeau « connexion perdue » | `sudo tail -f /var/log/apache2/suivi-commandes-error.log` puis vérifier `apache2ctl -M | grep wstunnel` |
  | Déconnexion permanente après login | cookie `secure` refusé : vérifier que le site est bien servi en HTTPS et que `RequestHeader set X-Forwarded-Proto "https"` est présent dans le vhost |
  | Erreur Prisma au démarrage | `apps/api/.env` absent ou `cwd` PM2 incorrect : `sudo -iu suivi pm2 describe suivi-api` (champ `exec cwd`) |
  | Base injoignable | `sudo systemctl status postgresql` puis `sudo tail -n 50 /var/log/postgresql/postgresql-16-main.log` |
  ````

- [ ] **Étape 4: relancer le test (PASS)**

  ```bash
  ./deploy/check-deploy.sh install
  ```

  Résultat attendu : **PASS** (exit 0) — 25 lignes `OK` puis
  `Toutes les vérifications de déploiement passent.`

- [ ] **Étape 5: commit**

  ```bash
  git add deploy/install.md deploy/check-deploy.sh
  git commit -m "docs: procedure d'installation pas a pas sur VPS Debian 13"
  ```

> À vérifier à l'exécution : (1) le nom de code Debian 13 renvoyé par `. /etc/os-release; echo $VERSION_CODENAME` (`trixie`) et l'existence du dépôt `trixie-pgdg` — s'il n'est pas encore publié, utiliser le dépôt `bookworm-pgdg` (compatible) ou accepter la version de PostgreSQL fournie par Debian, en notant que le schéma Prisma des contrats est compatible 16 comme 17 ; (2) le nom exact de l'unité systemd créée par `pm2 startup systemd` (`pm2-suivi.service` si l'utilisateur est `suivi`) ; (3) que `certbot --apache` conserve bien les directives proxy du VirtualHost 443 (relire le fichier après passage de certbot avec `sudo apachectl -S`).

---

### Task 10.6: Vérification complète du périmètre et merge gitflow

**Files:**
- Modify: aucun (tâche de validation et d'intégration)
- Test: l'intégralité des suites du dépôt + les deux builds de production + `./deploy/check-deploy.sh all`

**Interfaces:**
- Consomme : tout ce qui a été produit par les tâches 10.1 à 10.5.
- Produit : la branche `develop` à jour sur l'origine, contenant un dossier `deploy/` complet et une API prête pour le reverse proxy.

- [ ] **Étape 1: vérification statique complète des livrables de déploiement**

  ```bash
  ./deploy/check-deploy.sh all
  ```

  Attendu : **PASS** (exit 0) — quatre blocs (`ecosystem`, `vhost`, `backup`, `install`),
  aucune ligne `ECHEC`, et `Toutes les vérifications de déploiement passent.`

- [ ] **Étape 2: lancer tous les tests du dépôt**

  ```bash
  pnpm --filter @suivi/api test:unit
  pnpm --filter @suivi/api test:e2e
  pnpm -r test
  pnpm --filter @suivi/web test:e2e
  ```

  Attendu : **PASS** intégral, y compris `app.setup.spec.ts` (5 tests), toutes les
  suites des Features 0 à 9 et l'intégralité des scénarios Playwright de
  `apps/web/e2e/` (Features 2, 6, 7 et 8 — harnais unique, cf. `_contracts.md`
  § « Outillage de test front »). Aucun test rouge : interdiction de merger sinon.

- [ ] **Étape 3: builds de production des deux applications**

  ```bash
  pnpm --filter @suivi/api build
  NODE_ENV=production pnpm --filter @suivi/web build
  ls -l apps/api/dist/main.js && ls -d apps/web/.next
  ```

  Attendu : deux commandes en code 0, `apps/api/dist/main.js` présent et
  `apps/web/.next` présent. Le build Next doit se terminer sans erreur de type
  (TypeScript strict) et lister les routes `/login`, `/`, `/archives`,
  `/recherche`, `/parametres`.

- [ ] **Étape 4: fumigation locale du binaire de production de l'API**

  Dans un premier terminal :

  ```bash
  cd apps/api && NODE_ENV=production node dist/main.js
  ```

  Dans un second terminal :

  ```bash
  curl -s http://127.0.0.1:3001/api/health
  curl -s -o /dev/null -w '%{http_code}\n' -H 'Origin: http://exemple-malveillant.test' \
    http://127.0.0.1:3001/api/health
  ```

  Attendu : `{"status":"ok"}` pour la première commande, et `200` **sans** en-tête
  `Access-Control-Allow-Origin` pour la seconde (le CORS est bien désactivé en
  production ; pour le voir, relancer la seconde commande avec `-i` et vérifier
  l'absence de la ligne `access-control-allow-origin`). Arrêter ensuite le serveur
  du premier terminal avec `Ctrl+C`.

  Note : cette étape utilise la base de développement locale (le `.env` de dev est
  lu par `dotenv` depuis `apps/api`). Elle ne touche à aucun serveur distant.

- [ ] **Étape 5: vérifier qu'il ne reste rien à committer**

  ```bash
  git status --short
  ```

  Attendu : sortie vide. Si `apps/web/.next` ou `apps/api/dist` apparaissent, c'est
  que `.gitignore` est incomplet — les ajouter avant de continuer (`dist/`, `.next/`
  y figurent depuis la Feature 0).

- [ ] **Étape 6: merge gitflow dans `develop` et push**

  ```bash
  git checkout develop && git merge --no-ff feature/deploy-config -m "merge: feature/deploy-config"
  git push origin develop
  ```

  Attendu : merge sans conflit (commit de merge créé) et `develop` poussé sur
  l'origine.

- [ ] **Étape 7: préparer la mise en production (hors périmètre de cette feature)**

  Le passage `develop` → `main` avec tag est une opération de release, distincte de
  la feature. Une fois toutes les features validées :

  ```bash
  git checkout main && git pull
  git merge --no-ff develop -m "release: v1.0.0"
  git tag -a v1.0.0 -m "Version 1.0.0 — suivi des commandes"
  git push origin main --follow-tags
  ```

  C'est ce commit taggé de `main` que la section 4 de `deploy/install.md` clone sur
  le VPS.

---

## Récapitulatif de ce que produit cette feature

| Élément | Où | Signature / contenu |
|---|---|---|
| Setup HTTP durci | `apps/api/src/app.setup.ts` | `setupApp(app: INestApplication): INestApplication` — préfixe `api`, cookie-parser, `set('trust proxy', 1)`, CORS **seulement** hors production, filtre global |
| Garde-fou de production | `apps/api/src/app.setup.spec.ts` | 5 tests : préfixe/middleware/filtre, trust proxy, CORS dev, CORS prod, cookie `secure` |
| Décision Next.js | `apps/web/next.config.ts` | `transpilePackages: ['@suivi/shared']` + commentaire « pas de `output: standalone` » |
| Harnais de vérification | `deploy/check-deploy.sh` | `./deploy/check-deploy.sh [ecosystem\|vhost\|backup\|install\|all]` — exit 0/1 ; fonctions `ok`, `fail`, `expect_file`, `expect_exec`, `expect_grep` |
| Process PM2 | `deploy/ecosystem.config.js` | `module.exports = { apps: [ {name:'suivi-api', cwd:'./apps/api', script:'dist/main.js', env:{NODE_ENV:'production', PORT:'3001'}}, {name:'suivi-web', cwd:'./apps/web', script:'pnpm', args:'start', interpreter:'none', env:{NODE_ENV:'production', PORT:'3000', API_INTERNAL_URL:'http://127.0.0.1:3001'}} ] }` |
| VirtualHost Apache | `deploy/apache-vhost.conf` | `*:80` → 301 HTTPS (hors ACME) ; `*:443` → `SSLEngine on`, `ProxyPreserveHost On`, `X-Forwarded-Proto`, tunnel `ws://127.0.0.1:3001/socket.io/`, `ProxyPass /socket.io/`+`/api` → :3001, `/` → :3000 |
| Sauvegarde | `deploy/backup.sh` | `pg_dump --format=custom` → `/var/backups/suivi-commandes/AAAA-MM-JJ.dump`, rotation `find -mtime +30 -delete` ; env `BACKUP_DIR`, `DB_NAME`, `DB_USER`, `DB_HOST`, `DB_PORT`, `RETENTION_DAYS`, `PGPASSFILE` |
| Procédure sauvegarde | `deploy/backup.md` | `.pgpass`, cron `0 3 * * *`, `pg_restore --clean --if-exists`, test trimestriel, copie hors serveur |
| Procédure installation | `deploy/install.md` | 14 sections : système, Node 22 NodeSource, pnpm/corepack, PostgreSQL 16 PGDG, utilisateur `suivi` + clone, `.env` (`openssl rand -base64 32`), `migrate deploy`/`db seed`/`import:xlsx`, builds, PM2 (`startup`/`save`), Apache (`a2enmod`, `a2ensite`, `configtest`, `certbot --apache`), ufw, sauvegardes, vérifications finales, mise à jour, diagnostic |
