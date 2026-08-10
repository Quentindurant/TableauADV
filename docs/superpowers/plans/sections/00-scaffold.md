# Section 00 — Socle monorepo

> Références obligatoires : `docs/superpowers/specs/2026-08-10-suivi-commandes-design.md`
> et `docs/superpowers/plans/sections/_contracts.md`. Aucun nom (package, route,
> type, fichier) ne doit dévier des contrats.

## Feature 0 — Socle monorepo (branche `feature/scaffold`)

**But:** créer le squelette complet du monorepo pnpm (`@suivi/web`, `@suivi/api`, `@suivi/shared`), l'outillage commun (TypeScript strict, ESLint flat, Prettier), la base Postgres de dev en Docker, et prouver que l'API démarre (`GET /api/health` → 200) et que le web builde.

**Dépend de:** rien (première feature du plan).

**Particularité:** c'est la seule feature sans TDD métier. Les « tests » de ce socle sont :

1. l'API démarre et `GET /api/health` répond `200 {status:'ok'}` (test e2e supertest) ;
2. `pnpm --filter @suivi/web build` sort en code 0 ;
3. `pnpm lint` et `pnpm -r test` sont verts à la racine.

Chaque étape reste néanmoins au format « vérification d'abord » : quand c'est possible, la commande de vérification est lancée AVANT l'implémentation (résultat attendu : FAIL), puis APRÈS (résultat attendu : PASS).

---

### Task 0.1: Initialisation du dépôt et outillage racine

**Files:**
- Create: `pnpm-workspace.yaml`, `package.json`, `tsconfig.base.json`, `.gitignore`, `.editorconfig`, `.nvmrc`, `eslint.config.mjs`, `.prettierrc.json`, `.prettierignore`
- Test: `pnpm install` puis `pnpm lint` (exit 0)

**Interfaces:**
- Consomme : versions des contrats (`_contracts.md` § Versions et outillage) — Node 22, pnpm 10, TypeScript strict.
- Produit :
  - workspace pnpm couvrant `apps/*` et `packages/*` ;
  - scripts racine `dev` / `build` / `test` / `lint` / `format` (utilisés par toutes les features suivantes) et l'alias `import:xlsx` (délègue à `pnpm --filter @suivi/api import:xlsx`, promis par la spec §8) ;
  - `tsconfig.base.json` que chaque package étend via `"extends": "../../tsconfig.base.json"`.

- [ ] **Étape 1: bootstrap git + branche de feature**

  Le dépôt n'existe pas encore à ce stade. Bootstrap (une seule fois) :

  ```bash
  cd /home/dev/Developpement/Projet/TableauSuivieGcDev
  git init -b main
  git commit --allow-empty -m "chore: initialisation du depot"
  git branch develop
  ```

  Puis le gitflow standard de début de feature (le `git pull` échoue sans gravité tant que le remote GitHub n'est pas configuré — d'où le `|| true` toléré UNIQUEMENT pour cette toute première feature) :

  ```bash
  git checkout develop && (git pull || true) && git checkout -b feature/scaffold
  ```

  Résultat attendu : `Switched to a new branch 'feature/scaffold'`.

- [ ] **Étape 2: déclarer le workspace pnpm et le package.json racine**

  Créer `pnpm-workspace.yaml` :

  ```yaml
  packages:
    - "apps/*"
    - "packages/*"
  ```

  Créer `package.json` (racine) :

  ```json
  {
    "name": "suivi-commandes",
    "version": "0.1.0",
    "private": true,
    "packageManager": "pnpm@10.11.0",
    "engines": {
      "node": ">=22"
    },
    "scripts": {
      "dev": "pnpm --parallel -r dev",
      "build": "pnpm -r build",
      "test": "pnpm -r test",
      "lint": "eslint .",
      "format": "prettier --write .",
      "import:xlsx": "pnpm --filter @suivi/api import:xlsx"
    },
    "devDependencies": {
      "@eslint/js": "^9.18.0",
      "eslint": "^9.18.0",
      "eslint-config-prettier": "^9.1.0",
      "prettier": "^3.4.2",
      "typescript": "^5.7.3",
      "typescript-eslint": "^8.20.0"
    }
  }
  ```

  Créer `.nvmrc` :

  ```
  22
  ```

  Note : `pnpm -r run <script>` ignore silencieusement les packages qui n'ont pas le script — c'est voulu (ex. `@suivi/shared` n'a pas de script `dev`).

- [ ] **Étape 3: tsconfig de base strict**

  Créer `tsconfig.base.json` :

  ```json
  {
    "compilerOptions": {
      "strict": true,
      "target": "ES2022",
      "lib": ["ES2022"],
      "esModuleInterop": true,
      "allowSyntheticDefaultImports": true,
      "forceConsistentCasingInFileNames": true,
      "resolveJsonModule": true,
      "skipLibCheck": true,
      "noFallthroughCasesInSwitch": true
    }
  }
  ```

  Chaque package (`apps/api`, `apps/web`, `packages/shared`) l'étendra et ne
  redéfinira QUE ce qui lui est propre (`module`, `moduleResolution`, `jsx`,
  décorateurs, `outDir`, `paths`).

- [ ] **Étape 4: hygiène du dépôt (.gitignore, .editorconfig)**

  Créer `.gitignore` :

  ```
  node_modules/
  dist/
  .next/
  coverage/
  *.log
  *.tsbuildinfo
  .env
  .env.local
  .DS_Store
  ```

  (`next-env.d.ts` n'est PAS ignoré : Next.js recommande de le committer.)

  Créer `.editorconfig` :

  ```
  root = true

  [*]
  charset = utf-8
  end_of_line = lf
  insert_final_newline = true
  indent_style = space
  indent_size = 2
  trim_trailing_whitespace = true

  [*.md]
  trim_trailing_whitespace = false
  ```

- [ ] **Étape 5: ESLint flat config + Prettier partagés**

  Créer `eslint.config.mjs` (racine — ESLint 9 remonte l'arborescence, donc
  cette config unique sert aux trois packages) :

  ```js
  import js from '@eslint/js';
  import tseslint from 'typescript-eslint';
  import prettier from 'eslint-config-prettier';

  export default tseslint.config(
    {
      ignores: [
        '**/node_modules/**',
        '**/dist/**',
        '**/.next/**',
        '**/next-env.d.ts',
        '**/coverage/**',
      ],
    },
    js.configs.recommended,
    ...tseslint.configs.recommended,
    prettier,
  );
  ```

  Créer `.prettierrc.json` :

  ```json
  {
    "singleQuote": true,
    "trailingComma": "all",
    "printWidth": 100
  }
  ```

  Créer `.prettierignore` :

  ```
  node_modules
  dist
  .next
  coverage
  pnpm-lock.yaml
  ```

- [ ] **Étape 6: vérifier (installation + lint)**

  ```bash
  pnpm install
  pnpm lint
  ```

  Résultat attendu : `pnpm install` crée `pnpm-lock.yaml` sans erreur ;
  `pnpm lint` sort en code 0 (il ne linte pour l'instant que `eslint.config.mjs`).

- [ ] **Étape 7: commit**

  ```bash
  git add pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json .gitignore .editorconfig .nvmrc eslint.config.mjs .prettierrc.json .prettierignore
  git commit -m "chore: workspace pnpm, tsconfig strict, eslint flat + prettier"
  ```

> À vérifier à l'exécution : la version exacte de `packageManager` (`pnpm@10.11.0`) — la remplacer par la sortie de `pnpm --version` de la machine (rester en 10.x, exigé par les contrats).

---

### Task 0.2: Squelette du package partagé `@suivi/shared`

**Files:**
- Create: `packages/shared/package.json`, `packages/shared/tsconfig.json`, `packages/shared/src/index.ts`
- Test: `pnpm --filter @suivi/shared test` (= `tsc --noEmit`)

**Interfaces:**
- Consomme : `tsconfig.base.json` (Task 0.1).
- Produit :
  - package `@suivi/shared` dont le point d'entrée est la **source TypeScript** (`"main": "src/index.ts"`, `"types": "src/index.ts"` — aucun build, aucun `dist`) ;
  - export temporaire `export const SHARED_READY = true as const;` (marqueur de câblage, remplacé en Feature 1 par les types/schémas des contrats : `UserDTO`, `ColumnDTO`, `RowDTO`, `ErrorCode`, schémas zod, `PASTEL_PALETTE`, `pastelFor`).

**Comment ce package est consommé (à connaître pour toutes les features suivantes) :**

`@suivi/shared` n'est jamais compilé séparément. Chaque consommateur transpile la source lui-même :

| Consommateur | Mécanisme |
|---|---|
| `apps/web` | `transpilePackages: ['@suivi/shared']` dans `next.config.ts` (Task 0.4) + dépendance `"@suivi/shared": "workspace:*"` — Next.js compile la source TS du package. |
| `apps/api` (tsc/nest build) | `"paths": { "@suivi/shared": ["../../packages/shared/src/index.ts"] }` dans `apps/api/tsconfig.json` (Task 0.3) — le compilateur inclut la source. |
| `apps/api` (jest) | `"moduleNameMapper": { "^@suivi/shared$": "<rootDir>/../../../packages/shared/src/index.ts" }` dans les deux configs jest (Task 0.3) — ts-jest transpile la source. |

- [ ] **Étape 1: package.json et tsconfig du package**

  Créer `packages/shared/package.json` :

  ```json
  {
    "name": "@suivi/shared",
    "version": "0.1.0",
    "private": true,
    "main": "src/index.ts",
    "types": "src/index.ts",
    "scripts": {
      "test": "tsc -p tsconfig.json --noEmit",
      "typecheck": "tsc -p tsconfig.json --noEmit"
    },
    "devDependencies": {
      "typescript": "^5.7.3"
    }
  }
  ```

  Créer `packages/shared/tsconfig.json` :

  ```json
  {
    "extends": "../../tsconfig.base.json",
    "compilerOptions": {
      "module": "esnext",
      "moduleResolution": "bundler",
      "noEmit": true
    },
    "include": ["src"]
  }
  ```

- [ ] **Étape 2: lancer le « test » AVANT de créer la source (échec attendu)**

  ```bash
  pnpm install
  pnpm --filter @suivi/shared test
  ```

  Résultat attendu : **FAIL** — `error TS18003: No inputs were found in config file` (le dossier `src/` n'existe pas encore).

- [ ] **Étape 3: créer le point d'entrée**

  Créer `packages/shared/src/index.ts` :

  ```ts
  // Point d'entrée du package partagé `@suivi/shared`.
  //
  // Consommation (voir plan section 00, Task 0.2) :
  // - apps/web : transpilePackages ['@suivi/shared'] (next.config.ts)
  // - apps/api : tsconfig "paths" + jest "moduleNameMapper" vers ce fichier
  //
  // Les types et schémas des contrats (UserDTO, ColumnDTO, RowDTO, ErrorCode,
  // schémas zod, PASTEL_PALETTE, pastelFor) sont ajoutés en Feature 1.
  // La constante ci-dessous est un marqueur temporaire qui prouve que le
  // câblage inter-packages fonctionne ; elle sera supprimée en Feature 1.
  export const SHARED_READY = true as const;
  ```

- [ ] **Étape 4: relancer le test**

  ```bash
  pnpm --filter @suivi/shared test
  ```

  Résultat attendu : **PASS** — `tsc` sort en code 0, aucune erreur.

- [ ] **Étape 5: commit**

  ```bash
  git add packages/shared
  git commit -m "feat: squelette @suivi/shared (export source TS, sans build)"
  ```

---

### Task 0.3: API NestJS 11 minimale avec module health (TDD)

Le squelette NestJS est écrit **à la main** (pas de `nest new`, pas de CLI interactive) ; `@nestjs/cli` n'est utilisé qu'en devDependency pour les commandes non interactives `nest build` / `nest start --watch`.

**Files:**
- Create: `apps/api/package.json`, `apps/api/tsconfig.json`, `apps/api/tsconfig.build.json`, `apps/api/nest-cli.json`, `apps/api/test/jest-e2e.json`, `apps/api/src/main.ts`, `apps/api/src/app.setup.ts`, `apps/api/src/app.module.ts`, `apps/api/src/health/health.module.ts`, `apps/api/src/health/health.controller.ts`
- Test: `apps/api/test/health.e2e-spec.ts`

**Interfaces:**
- Consomme : `tsconfig.base.json` (Task 0.1) ; contrats — préfixe global `/api`, port 3001, env `PORT`.
- Produit :
  - `export class AppModule {}` (`apps/api/src/app.module.ts`) — toutes les features API suivantes y ajouteront leurs modules ;
  - `export function setupApp(app: INestApplication): INestApplication` (`apps/api/src/app.setup.ts`) — applique `setGlobalPrefix('api')` + `cookieParser()` ; **obligatoire dans tous les futurs tests e2e** pour tester la même config que la prod ;
  - `GET /api/health` → `200 {"status":"ok"}` ;
  - scripts `@suivi/api` : `dev`, `build`, `start`, `test` (unitaires, `--passWithNoTests`, puis e2e), `test:e2e` ;
  - configs jest (unitaire + e2e) avec `moduleNameMapper` pour `@suivi/shared`.

- [ ] **Étape 1: package.json de l'API**

  Créer `apps/api/package.json` :

  ```json
  {
    "name": "@suivi/api",
    "version": "0.1.0",
    "private": true,
    "scripts": {
      "dev": "nest start --watch",
      "build": "nest build",
      "start": "node dist/main.js",
      "test": "jest --passWithNoTests && jest --config ./test/jest-e2e.json",
      "test:unit": "jest --passWithNoTests",
      "test:e2e": "jest --config ./test/jest-e2e.json"
    },
    "dependencies": {
      "@nestjs/common": "^11.0.0",
      "@nestjs/core": "^11.0.0",
      "@nestjs/platform-express": "^11.0.0",
      "@suivi/shared": "workspace:*",
      "cookie-parser": "^1.4.7",
      "reflect-metadata": "^0.2.2",
      "rxjs": "^7.8.1"
    },
    "devDependencies": {
      "@nestjs/cli": "^11.0.0",
      "@nestjs/schematics": "^11.0.0",
      "@nestjs/testing": "^11.0.0",
      "@types/cookie-parser": "^1.4.8",
      "@types/express": "^5.0.0",
      "@types/jest": "^29.5.14",
      "@types/node": "^22.10.0",
      "@types/supertest": "^6.0.2",
      "jest": "^29.7.0",
      "supertest": "^7.0.0",
      "ts-jest": "^29.2.5",
      "ts-node": "^10.9.2",
      "typescript": "^5.7.3"
    },
    "jest": {
      "moduleFileExtensions": ["js", "json", "ts"],
      "rootDir": "src",
      "testRegex": ".*\\.spec\\.ts$",
      "transform": { "^.+\\.ts$": "ts-jest" },
      "moduleNameMapper": {
        "^@suivi/shared$": "<rootDir>/../../../packages/shared/src/index.ts"
      },
      "testEnvironment": "node"
    }
  }
  ```

  Le script `test` enchaîne unitaires (aucun pour l'instant, d'où `--passWithNoTests`) puis e2e — ainsi `pnpm -r test` à la racine couvre bien le e2e.

- [ ] **Étape 2: tsconfig + nest-cli + config jest e2e**

  Créer `apps/api/tsconfig.json` :

  ```json
  {
    "extends": "../../tsconfig.base.json",
    "compilerOptions": {
      "module": "commonjs",
      "moduleResolution": "node",
      "emitDecoratorMetadata": true,
      "experimentalDecorators": true,
      "declaration": false,
      "sourceMap": true,
      "incremental": true,
      "outDir": "./dist",
      "baseUrl": "./",
      "paths": {
        "@suivi/shared": ["../../packages/shared/src/index.ts"]
      }
    },
    "include": ["src", "test"]
  }
  ```

  Créer `apps/api/tsconfig.build.json` :

  ```json
  {
    "extends": "./tsconfig.json",
    "exclude": ["node_modules", "test", "dist", "**/*.spec.ts", "**/*.e2e-spec.ts"]
  }
  ```

  Créer `apps/api/nest-cli.json` :

  ```json
  {
    "$schema": "https://docs.nestjs.com/schema/nest-cli",
    "collection": "@nestjs/schematics",
    "sourceRoot": "src",
    "compilerOptions": {
      "webpack": true,
      "deleteOutDir": true,
      "tsConfigPath": "tsconfig.build.json"
    }
  }
  ```

  `"webpack": true` est délibéré : le bundle résout `@suivi/shared` (source TS hors de `apps/api`) via les `paths` du tsconfig et produit toujours un unique `dist/main.js`, quel que soit le graphe d'imports. Sans webpack, `tsc` déplacerait la sortie vers `dist/apps/api/src/main.js` dès le premier import de `@suivi/shared` et casserait le script `start`.

  Créer `apps/api/test/jest-e2e.json` :

  ```json
  {
    "moduleFileExtensions": ["js", "json", "ts"],
    "rootDir": ".",
    "testEnvironment": "node",
    "testRegex": ".e2e-spec.ts$",
    "transform": { "^.+\\.ts$": "ts-jest" },
    "moduleNameMapper": {
      "^@suivi/shared$": "<rootDir>/../../../packages/shared/src/index.ts"
    }
  }
  ```

  Puis installer :

  ```bash
  pnpm install
  ```

  Résultat attendu : installation sans erreur, `apps/api/node_modules` peuplé.

- [ ] **Étape 3: écrire le test e2e health (échec attendu)**

  Créer `apps/api/test/health.e2e-spec.ts` :

  ```ts
  import type { INestApplication } from '@nestjs/common';
  import { Test } from '@nestjs/testing';
  import request from 'supertest';
  import { AppModule } from '../src/app.module';
  import { setupApp } from '../src/app.setup';

  describe('Health (e2e)', () => {
    let app: INestApplication;

    beforeAll(async () => {
      const moduleRef = await Test.createTestingModule({
        imports: [AppModule],
      }).compile();
      app = setupApp(moduleRef.createNestApplication());
      await app.init();
    });

    afterAll(async () => {
      await app.close();
    });

    it('GET /api/health repond 200 {status:"ok"}', async () => {
      const res = await request(app.getHttpServer()).get('/api/health');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ status: 'ok' });
    });

    it('GET /health (sans prefixe /api) repond 404', async () => {
      const res = await request(app.getHttpServer()).get('/health');
      expect(res.status).toBe(404);
    });

    it('GET /api/inexistant repond 404', async () => {
      const res = await request(app.getHttpServer()).get('/api/inexistant');
      expect(res.status).toBe(404);
    });
  });
  ```

  (Aucun `ErrorCode` des contrats n'est dans le périmètre de cette feature —
  le premier code, `AUTH_INVALID`, arrive avec la feature auth. Les deux tests
  404 vérifient le comportement par défaut de Nest et le préfixe global.)

- [ ] **Étape 4: lancer le test (FAIL)**

  ```bash
  pnpm --filter @suivi/api test:e2e
  ```

  Résultat attendu : **FAIL** — erreur de compilation ts-jest
  `Cannot find module '../src/app.module'` (les sources n'existent pas encore).

- [ ] **Étape 5: implémentation minimale (setup, module, health, main)**

  Créer `apps/api/src/app.setup.ts` :

  ```ts
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
  ```

  Créer `apps/api/src/health/health.controller.ts` :

  ```ts
  import { Controller, Get } from '@nestjs/common';

  @Controller('health')
  export class HealthController {
    @Get()
    getHealth(): { status: 'ok' } {
      return { status: 'ok' };
    }
  }
  ```

  Créer `apps/api/src/health/health.module.ts` :

  ```ts
  import { Module } from '@nestjs/common';
  import { HealthController } from './health.controller';

  @Module({
    controllers: [HealthController],
  })
  export class HealthModule {}
  ```

  Créer `apps/api/src/app.module.ts` :

  ```ts
  import { Module } from '@nestjs/common';
  import { HealthModule } from './health/health.module';

  @Module({
    imports: [HealthModule],
  })
  export class AppModule {}
  ```

  Créer `apps/api/src/main.ts` :

  ```ts
  import 'reflect-metadata';
  import { NestFactory } from '@nestjs/core';
  import { AppModule } from './app.module';
  import { setupApp } from './app.setup';

  async function bootstrap(): Promise<void> {
    const app = await NestFactory.create(AppModule);
    setupApp(app);
    app.enableShutdownHooks();
    await app.listen(process.env.PORT ?? 3001);
  }

  void bootstrap();
  ```

- [ ] **Étape 6: relancer le test (PASS)**

  ```bash
  pnpm --filter @suivi/api test:e2e
  ```

  Résultat attendu : **PASS** — `Tests: 3 passed, 3 total`.

- [ ] **Étape 7: vérifier le build et le démarrage réel**

  ```bash
  pnpm --filter @suivi/api build
  node apps/api/dist/main.js &
  sleep 2 && curl -s http://localhost:3001/api/health
  kill %1
  ```

  Résultat attendu : build en code 0, `dist/main.js` présent, et `curl` affiche
  `{"status":"ok"}`.

- [ ] **Étape 8: commit**

  ```bash
  git add apps/api pnpm-lock.yaml
  git commit -m "feat: api NestJS minimale (prefix /api, cookie-parser, health, e2e supertest)"
  ```

> À vérifier à l'exécution : que `nest build` en mode webpack résout bien `@suivi/shared` via les `paths` du tsconfig (le CLI Nest embarque `tsconfig-paths-webpack-plugin`). Si ce n'est pas le cas au moment du premier import réel (Feature 1), l'alternative documentée est `nest build` sans webpack + script `"start": "node dist/apps/api/src/main.js"`.

---

### Task 0.4: Web Next.js 15 minimal (App Router)

Squelette écrit à la main (pas de `create-next-app`).

**Files:**
- Create: `apps/web/package.json`, `apps/web/next.config.ts`, `apps/web/tsconfig.json`, `apps/web/src/app/layout.tsx`, `apps/web/src/app/page.tsx`
- Test: `pnpm --filter @suivi/web build` (exit 0)

**Interfaces:**
- Consomme : `SHARED_READY` de `@suivi/shared` (Task 0.2) — uniquement comme preuve de câblage `transpilePackages`.
- Produit :
  - package `@suivi/web` avec scripts `dev` (port 3000), `build`, `start` ;
  - `next.config.ts` avec `transpilePackages: ['@suivi/shared']` (toutes les features web en dépendent) ;
  - layout racine `apps/web/src/app/layout.tsx` (lang `fr`) et page d'accueil placeholder `apps/web/src/app/page.tsx` (`<main>Suivi commandes</main>` — la vraie page grille et la redirection vers `/login` arrivent dans les features suivantes, conformément à l'arborescence cible des contrats `app/(app)/...`).

- [ ] **Étape 1: package.json, next.config.ts, tsconfig**

  Créer `apps/web/package.json` :

  ```json
  {
    "name": "@suivi/web",
    "version": "0.1.0",
    "private": true,
    "scripts": {
      "dev": "next dev --port 3000",
      "build": "next build",
      "start": "next start --port 3000"
    },
    "dependencies": {
      "@suivi/shared": "workspace:*",
      "next": "^15.1.0",
      "react": "^19.0.0",
      "react-dom": "^19.0.0"
    },
    "devDependencies": {
      "@types/node": "^22.10.0",
      "@types/react": "^19.0.0",
      "@types/react-dom": "^19.0.0",
      "typescript": "^5.7.3"
    }
  }
  ```

  Créer `apps/web/next.config.ts` :

  ```ts
  import type { NextConfig } from 'next';

  const nextConfig: NextConfig = {
    // @suivi/shared est publié en source TypeScript (main: src/index.ts) :
    // Next.js doit le transpiler lui-même. Ne jamais retirer cette ligne.
    transpilePackages: ['@suivi/shared'],
  };

  export default nextConfig;
  ```

  Créer `apps/web/tsconfig.json` :

  ```json
  {
    "extends": "../../tsconfig.base.json",
    "compilerOptions": {
      "lib": ["dom", "dom.iterable", "esnext"],
      "allowJs": true,
      "noEmit": true,
      "incremental": true,
      "module": "esnext",
      "moduleResolution": "bundler",
      "isolatedModules": true,
      "jsx": "preserve",
      "plugins": [{ "name": "next" }]
    },
    "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
    "exclude": ["node_modules"]
  }
  ```

  Contrairement à l'API, PAS de `paths` ici : la résolution passe par la
  dépendance workspace (`node_modules/@suivi/shared` → lien symbolique pnpm),
  dont `"types": "src/index.ts"` fournit les types, et `transpilePackages`
  fait la compilation.

- [ ] **Étape 2: lancer le build AVANT les pages (échec attendu)**

  ```bash
  pnpm install
  pnpm --filter @suivi/web build
  ```

  Résultat attendu : **FAIL** — Next.js refuse de builder sans dossier `app`
  (message du type `Couldn't find any 'pages' or 'app' directory`).

- [ ] **Étape 3: layout racine et page placeholder**

  Créer `apps/web/src/app/layout.tsx` :

  ```tsx
  import type { Metadata } from 'next';
  import type { ReactNode } from 'react';

  export const metadata: Metadata = {
    title: 'Suivi commandes',
    description: 'Tableau de suivi des commandes et installations',
  };

  export default function RootLayout({ children }: { children: ReactNode }) {
    return (
      <html lang="fr">
        <body>{children}</body>
      </html>
    );
  }
  ```

  Créer `apps/web/src/app/page.tsx` :

  ```tsx
  import { SHARED_READY } from '@suivi/shared';

  // Placeholder du socle : la vraie page (grille du mois courant) et la
  // redirection vers /login arrivent dans les features suivantes.
  // L'import de @suivi/shared prouve au build que transpilePackages fonctionne.
  export default function HomePage() {
    return <main data-shared-ready={SHARED_READY}>Suivi commandes</main>;
  }
  ```

- [ ] **Étape 4: relancer le build (PASS)**

  ```bash
  pnpm --filter @suivi/web build
  ```

  Résultat attendu : **PASS** — `Compiled successfully`, la route `/` listée
  comme statique, code de sortie 0. Le build génère `apps/web/next-env.d.ts`
  (à committer).

- [ ] **Étape 5: vérifier le lint global**

  ```bash
  pnpm lint
  ```

  Résultat attendu : exit 0 (la config flat racine couvre les `.tsx` du web).

- [ ] **Étape 6: commit**

  ```bash
  git add apps/web pnpm-lock.yaml
  git commit -m "feat: web Next.js 15 minimal (App Router, transpilePackages @suivi/shared)"
  ```

> À vérifier à l'exécution : la version mineure exacte de Next 15 installée par `^15.1.0` (prendre la dernière 15.x stable) et la présence de `next.config.ts` en TS (supporté depuis Next 15 ; si souci, repli `next.config.mjs` au contenu identique).

---

### Task 0.5: Postgres Docker, README, vérification complète et merge

**Files:**
- Create: `docker-compose.dev.yml`, `README.md`, `apps/api/.env.example`, `apps/web/.env.example`
- Test: `docker compose -f docker-compose.dev.yml up -d` + `pg_isready`, puis `pnpm lint && pnpm -r test && pnpm build`

**Interfaces:**
- Consomme : tout ce qui précède (Tasks 0.1 → 0.4) ; contrats — env `DATABASE_URL`, `JWT_SECRET`, `APP_URL`, `PORT` (api) et `NEXT_PUBLIC_API_URL` (web).
- Produit :
  - base Postgres 16 de dev : hôte `localhost:5432`, user `suivi`, base `suivi`, mot de passe `dev` → **`DATABASE_URL=postgresql://suivi:dev@localhost:5432/suivi`** (valeur utilisée par la feature Prisma) ;
  - fichiers `.env.example` documentant les variables des contrats ;
  - `README.md` quickstart pour tout nouveau développeur.

- [ ] **Étape 1: docker-compose de dev**

  Créer `docker-compose.dev.yml` :

  ```yaml
  services:
    postgres:
      image: postgres:16
      container_name: suivi-postgres
      environment:
        POSTGRES_USER: suivi
        POSTGRES_PASSWORD: dev
        POSTGRES_DB: suivi
      ports:
        - "5432:5432"
      volumes:
        - suivi_pgdata:/var/lib/postgresql/data

  volumes:
    suivi_pgdata:
  ```

  Vérifier :

  ```bash
  docker compose -f docker-compose.dev.yml up -d
  docker compose -f docker-compose.dev.yml exec postgres pg_isready -U suivi
  ```

  Résultat attendu : `.../var/run/postgresql:5432 - accepting connections`.

- [ ] **Étape 2: fichiers .env.example**

  Créer `apps/api/.env.example` :

  ```
  # Copier en apps/api/.env (jamais committe — .env est dans .gitignore)
  DATABASE_URL=postgresql://suivi:dev@localhost:5432/suivi
  JWT_SECRET=change-me-in-prod
  APP_URL=http://localhost:3000
  PORT=3001
  ```

  Créer `apps/web/.env.example` :

  ```
  # Copier en apps/web/.env.local
  # En production : laisser vide (meme origine derriere Apache)
  NEXT_PUBLIC_API_URL=http://localhost:3001
  ```

- [ ] **Étape 3: README quickstart**

  Créer `README.md` :

  ````markdown
  # Suivi commandes

  Application web auto-hébergée de suivi des commandes/installations télécom :
  grille type tableur (AG Grid), co-édition temps réel (Socket.IO),
  paramétrage complet des colonnes/listes/couleurs.
  Remplace le classeur Zoho « TABLEAU SUIVI COMMANDES 2026 ».

  ## Stack

  Monorepo pnpm :

  | Package | Rôle | Port dev |
  |---|---|---|
  | `apps/web` (`@suivi/web`) | Next.js 15 (App Router, React 19) | 3000 |
  | `apps/api` (`@suivi/api`) | NestJS 11 (REST `/api` + Socket.IO) | 3001 |
  | `packages/shared` (`@suivi/shared`) | Types + schémas zod partagés (source TS, sans build) | — |

  Base : PostgreSQL 16 (Prisma 6).

  ## Prérequis

  - Node 22 LTS (`nvm use` lit le `.nvmrc`)
  - pnpm 10 (`corepack enable`)
  - Docker (Postgres de dev)

  ## Démarrage rapide

  ```bash
  pnpm install

  # Base de données de dev (postgres:16, user suivi / mdp dev / base suivi)
  docker compose -f docker-compose.dev.yml up -d

  # Variables d'environnement
  cp apps/api/.env.example apps/api/.env
  cp apps/web/.env.example apps/web/.env.local

  # Lancer web (3000) + api (3001) en parallèle
  pnpm dev
  ```

  Vérifications : http://localhost:3001/api/health → `{"status":"ok"}` ;
  http://localhost:3000 → page « Suivi commandes ».

  ## Scripts racine

  | Commande | Effet |
  |---|---|
  | `pnpm dev` | web + api en watch |
  | `pnpm build` | build de tous les packages |
  | `pnpm test` | tests de tous les packages (jest + supertest côté api) |
  | `pnpm lint` | ESLint (flat config racine) |
  | `pnpm format` | Prettier |

  ## Méthodologie

  Gitflow : `main` (stable) / `develop` (intégration) / `feature/<nom>`.
  Aucun commit direct sur `develop` ou `main` ; pas de merge avec des tests
  rouges. Le plan d'implémentation détaillé est dans
  `docs/superpowers/plans/`.
  ````

- [ ] **Étape 4: vérification complète du périmètre**

  ```bash
  pnpm lint
  pnpm -r test
  pnpm build
  ```

  Résultat attendu :
  - `pnpm lint` : exit 0 ;
  - `pnpm -r test` : `@suivi/shared` (tsc) OK, `@suivi/api` : 3 tests e2e PASS ;
  - `pnpm build` : `@suivi/api` produit `dist/main.js`, `@suivi/web` `Compiled successfully`.

- [ ] **Étape 5: commit final de la feature**

  ```bash
  git add docker-compose.dev.yml README.md apps/api/.env.example apps/web/.env.example
  git commit -m "chore: postgres dev (docker), env examples, README quickstart"
  ```

- [ ] **Étape 6: merge gitflow dans develop et push**

  Si le dépôt GitHub n'existe pas encore, le créer (vide, sans README) et
  brancher le remote une seule fois :

  ```bash
  git remote add origin git@github.com:<compte>/suivi-commandes.git
  git push -u origin main
  ```

  Puis le merge de fin de feature :

  ```bash
  git checkout develop && git merge --no-ff feature/scaffold -m "merge: feature/scaffold"
  git push origin develop
  ```

  Résultat attendu : merge sans conflit, `develop` poussé. La Feature 1
  démarrera par `git checkout develop && git pull && git checkout -b feature/<nom>`.

---

## Récapitulatif de ce que les features suivantes peuvent utiliser

| Élément | Où | Signature / valeur |
|---|---|---|
| Module racine API | `apps/api/src/app.module.ts` | `export class AppModule {}` (ajouter ses modules dans `imports`) |
| Setup HTTP commun | `apps/api/src/app.setup.ts` | `export function setupApp(app: INestApplication): INestApplication` (prefix `api` + cookie-parser) — à utiliser dans chaque test e2e |
| Santé | `GET /api/health` | `200 {"status":"ok"}` |
| Package partagé | `packages/shared/src/index.ts` | `export const SHARED_READY = true as const;` (temporaire, remplacé en Feature 1) |
| Câblage shared → web | `apps/web/next.config.ts` | `transpilePackages: ['@suivi/shared']` |
| Câblage shared → api | `apps/api/tsconfig.json` + configs jest | `paths` / `moduleNameMapper` vers `packages/shared/src/index.ts` |
| Base de dev | `docker-compose.dev.yml` | `DATABASE_URL=postgresql://suivi:dev@localhost:5432/suivi` |
| Scripts racine | `package.json` | `pnpm dev` / `build` / `test` / `lint` / `format` |
| Env documentés | `apps/api/.env.example`, `apps/web/.env.example` | `DATABASE_URL`, `JWT_SECRET`, `APP_URL`, `PORT` ; `NEXT_PUBLIC_API_URL` |
