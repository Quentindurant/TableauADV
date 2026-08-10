# Section 02 — Authentification + équipe

> Références obligatoires : `docs/superpowers/specs/2026-08-10-suivi-commandes-design.md`
> et `docs/superpowers/plans/sections/_contracts.md`. Aucun nom (package, route,
> type, événement, fichier) ne dévie des contrats.

## Feature 2 — Authentification + équipe (branche `feature/auth`)

**But:** poser toute la chaîne d'authentification par cookie JWT httpOnly (API NestJS + front Next.js), la gestion des membres de l'équipe, ainsi que les deux briques transverses dont toutes les features suivantes dépendent : le helper de validation `parseOrThrow` (mécanisme unique de validation de l'API) et le filtre d'exception global qui formate **toutes** les réponses d'erreur en `ApiError { code, message, details }`.

**Dépend de:**

- **Feature 0 (socle monorepo)** : workspace pnpm (`@suivi/web`, `@suivi/api`, `@suivi/shared`), `apps/api/src/app.module.ts` (`AppModule`), `apps/api/src/app.setup.ts` (`setupApp(app)` — préfixe global `api` + `cookie-parser`), `GET /api/health`, scripts `test:unit` / `test:e2e` de `@suivi/api`, `apps/web` Next 15 avec `transpilePackages: ['@suivi/shared']`, branche `develop` poussée.
- **Feature 1 (schéma de données + seed)** : migration Prisma appliquée (modèles `User`, `Column`, `Choice`, `Row`, `RowEvent`), `PrismaService` / `PrismaModule` global (`apps/api/src/prisma/prisma.service.ts`), package `@suivi/shared` exportant `UserDTO`, `ApiError`, `ErrorCode`, `loginSchema`, `createUserSchema`, `updateMeSchema`, et le seed idempotent créant l'utilisateur initial **`quentin.durant49@orange.fr` / mot de passe `changeme`** (`displayName` « Quentin », `cursorColor` `#3498DB`).

**Prérequis d'exécution :** Postgres de dev démarré (`docker compose -f docker-compose.dev.yml up -d`), `apps/api/.env` renseigné (`DATABASE_URL`, `JWT_SECRET`, `APP_URL=http://localhost:3000`, `PORT=3001`), `apps/web/.env.local` renseigné (`NEXT_PUBLIC_API_URL=http://localhost:3001`), base migrée et seedée.

**Emplacements ajoutés à l'arborescence des contrats** (aucun n'en contredit un existant) :
`apps/api/src/common/` (helper de validation `parseOrThrow` + `ApiException` et son filtre, briques transverses réutilisées par les Features 3 à 6), `apps/web/src/components/LogoutButton.tsx`, `apps/web/playwright.config.ts` + `apps/web/e2e/` (harnais e2e front **unique** du dépôt : les Features 6, 7 et 8 y ajoutent leurs specs sans jamais recréer la configuration).

---

### Task 2.1: Branche, dépendances, `ApiException` + filtre d'exception global + CORS

**Files:**
- Create: `apps/api/src/common/api.exception.ts`, `apps/api/src/common/api-exception.filter.ts`
- Modify: `apps/api/src/app.setup.ts`, `apps/api/package.json` (dépendances + `setupFiles` jest), `apps/api/test/jest-e2e.json` (`setupFiles`)
- Test: `apps/api/src/common/api-exception.filter.spec.ts`

**Interfaces:**
- Consomme :
  - `type ErrorCode` de `@suivi/shared` (Feature 1) — les 8 codes du contrat ;
  - `export function setupApp(app: INestApplication): INestApplication` (`apps/api/src/app.setup.ts`, Feature 0).
- Produit (utilisé par TOUTES les features API suivantes) :
  - `class ApiException extends HttpException` — `new ApiException(code: ErrorCode, message: string, status: HttpStatus, details?: unknown)`, champs publics `code`, `userMessage`, `details` ;
  - fabriques `authInvalid()`, `authRequired(message?)`, `validationFailed(message, details?)`, `notFound(message?)` ;
  - `interface ApiErrorBody { code: ErrorCode | 'INTERNAL'; message: string; details?: unknown }` ;
  - `class ApiExceptionFilter implements ExceptionFilter` (enregistré globalement dans `setupApp`) ;
  - `setupApp` applique désormais aussi `enableCors({ origin: APP_URL, credentials: true })` et `useGlobalFilters(new ApiExceptionFilter())`.

- [ ] **Étape 1: créer la branche de feature**

  ```bash
  git checkout develop && git pull && git checkout -b feature/auth
  ```

  Résultat attendu : `Switched to a new branch 'feature/auth'`.

- [ ] **Étape 2: installer les dépendances de la feature**

  ```bash
  pnpm --filter @suivi/api add @nestjs/jwt argon2 zod dotenv
  pnpm --filter @suivi/api add -D @types/cookie-parser
  ```

  (`argon2` est peut-être déjà installé par la Feature 1 — la commande est idempotente. `zod` est nécessaire côté API pour le type `ZodSchema` du pipe. `dotenv` charge `apps/api/.env` — indispensable pour `JWT_SECRET` en test comme au démarrage.)

  Puis brancher `dotenv` sur les deux configurations jest. Dans `apps/api/package.json`, bloc `"jest"`, ajouter la clé `setupFiles` (le bloc complet devient) :

  ```json
  "jest": {
    "moduleFileExtensions": ["js", "json", "ts"],
    "rootDir": "src",
    "testRegex": ".*\\.spec\\.ts$",
    "transform": { "^.+\\.ts$": "ts-jest" },
    "moduleNameMapper": {
      "^@suivi/shared$": "<rootDir>/../../../packages/shared/src/index.ts"
    },
    "setupFiles": ["dotenv/config"],
    "testEnvironment": "node"
  }
  ```

  Et remplacer `apps/api/test/jest-e2e.json` par :

  ```json
  {
    "moduleFileExtensions": ["js", "json", "ts"],
    "rootDir": ".",
    "testEnvironment": "node",
    "testRegex": ".e2e-spec.ts$",
    "transform": { "^.+\\.(t|j)s$": "ts-jest" },
    "moduleNameMapper": {
      "^@suivi/shared$": "<rootDir>/../../../packages/shared/src/index.ts"
    },
    "setupFiles": ["dotenv/config"]
  }
  ```

  Enfin, ajouter `import 'dotenv/config';` en toute première ligne de `apps/api/src/main.ts` (avant `import 'reflect-metadata';`).

- [ ] **Étape 3: écrire le test qui échoue**

  Créer `apps/api/src/common/api-exception.filter.spec.ts` :

  ```ts
  import {
    type ArgumentsHost,
    ForbiddenException,
    HttpStatus,
    NotFoundException,
    UnauthorizedException,
  } from '@nestjs/common';
  import { ApiException, validationFailed } from './api.exception';
  import { ApiExceptionFilter, type ApiErrorBody } from './api-exception.filter';

  function createHost(): {
    host: ArgumentsHost;
    status: jest.Mock;
    json: jest.Mock;
  } {
    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });
    const host = {
      switchToHttp: () => ({ getResponse: () => ({ status }) }),
    } as unknown as ArgumentsHost;
    return { host, status, json };
  }

  describe('ApiExceptionFilter', () => {
    const filter = new ApiExceptionFilter();

    it('formate une ApiException avec son code, son message et ses details', () => {
      const { host, status, json } = createHost();

      filter.catch(
        new ApiException('VERSION_CONFLICT', 'Modifié entre-temps.', HttpStatus.CONFLICT, {
          conflictKeys: ['statut'],
        }),
        host,
      );

      expect(status).toHaveBeenCalledWith(409);
      expect(json).toHaveBeenCalledWith<[ApiErrorBody]>({
        code: 'VERSION_CONFLICT',
        message: 'Modifié entre-temps.',
        details: { conflictKeys: ['statut'] },
      });
    });

    it('formate la fabrique validationFailed en 422 VALIDATION_FAILED', () => {
      const { host, status, json } = createHost();

      filter.catch(validationFailed('Données invalides.', [{ path: 'email', message: 'X' }]), host);

      expect(status).toHaveBeenCalledWith(422);
      expect(json).toHaveBeenCalledWith({
        code: 'VALIDATION_FAILED',
        message: 'Données invalides.',
        details: [{ path: 'email', message: 'X' }],
      });
    });

    it('traduit une NotFoundException de Nest en 404 NOT_FOUND', () => {
      const { host, status, json } = createHost();

      filter.catch(new NotFoundException(), host);

      expect(status).toHaveBeenCalledWith(404);
      expect(json).toHaveBeenCalledWith({
        code: 'NOT_FOUND',
        message: 'Ressource introuvable.',
      });
    });

    it('traduit une UnauthorizedException de Nest en 401 AUTH_REQUIRED', () => {
      const { host, status, json } = createHost();

      filter.catch(new UnauthorizedException(), host);

      expect(status).toHaveBeenCalledWith(401);
      expect(json).toHaveBeenCalledWith({
        code: 'AUTH_REQUIRED',
        message: 'Connexion requise.',
      });
    });

    it('traduit un statut HTTP non cartographié en 4xx VALIDATION_FAILED', () => {
      const { host, status, json } = createHost();

      filter.catch(new ForbiddenException(), host);

      expect(status).toHaveBeenCalledWith(403);
      expect(json).toHaveBeenCalledWith({
        code: 'VALIDATION_FAILED',
        message: 'Requête invalide.',
      });
    });

    it('traduit une erreur inattendue en 500 INTERNAL sans fuiter le détail', () => {
      const { host, status, json } = createHost();

      filter.catch(new Error('connexion Postgres perdue'), host);

      expect(status).toHaveBeenCalledWith(500);
      expect(json).toHaveBeenCalledWith({
        code: 'INTERNAL',
        message: 'Erreur interne du serveur.',
      });
    });
  });
  ```

- [ ] **Étape 4: lancer le test (FAIL)**

  ```bash
  pnpm --filter @suivi/api test:unit -- api-exception.filter.spec
  ```

  Résultat attendu : **FAIL** — `Cannot find module './api.exception'` (les deux fichiers n'existent pas encore).

- [ ] **Étape 5: implémenter `ApiException`**

  Créer `apps/api/src/common/api.exception.ts` :

  ```ts
  import { HttpException, HttpStatus } from '@nestjs/common';
  import type { ErrorCode } from '@suivi/shared';

  /**
   * Exception métier de l'API. Toute erreur volontairement renvoyée au client
   * passe par cette classe : le filtre global (api-exception.filter.ts) la
   * sérialise en `ApiError { code, message, details }` (contrat partagé).
   *
   * `userMessage` duplique volontairement le message : il est la source de
   * vérité du filtre, indépendamment de la façon dont Nest dérive
   * `HttpException.message` du corps de réponse.
   */
  export class ApiException extends HttpException {
    readonly code: ErrorCode;
    readonly userMessage: string;
    readonly details?: unknown;

    constructor(code: ErrorCode, message: string, status: HttpStatus, details?: unknown) {
      super({ code, message, details }, status);
      this.code = code;
      this.userMessage = message;
      this.details = details;
    }
  }

  export function authInvalid(): ApiException {
    return new ApiException(
      'AUTH_INVALID',
      'E-mail ou mot de passe incorrect.',
      HttpStatus.UNAUTHORIZED,
    );
  }

  export function authRequired(message = 'Connexion requise.'): ApiException {
    return new ApiException('AUTH_REQUIRED', message, HttpStatus.UNAUTHORIZED);
  }

  export function validationFailed(message: string, details?: unknown): ApiException {
    return new ApiException(
      'VALIDATION_FAILED',
      message,
      HttpStatus.UNPROCESSABLE_ENTITY,
      details,
    );
  }

  export function notFound(message = 'Ressource introuvable.'): ApiException {
    return new ApiException('NOT_FOUND', message, HttpStatus.NOT_FOUND);
  }
  ```

- [ ] **Étape 6: implémenter le filtre global**

  Créer `apps/api/src/common/api-exception.filter.ts` :

  ```ts
  import {
    type ArgumentsHost,
    Catch,
    type ExceptionFilter,
    HttpException,
    HttpStatus,
    Logger,
  } from '@nestjs/common';
  import type { Response } from 'express';
  import type { ErrorCode } from '@suivi/shared';
  import { ApiException } from './api.exception';

  /**
   * Corps de réponse d'erreur : `ApiError` du contrat partagé, élargi au seul
   * code technique 'INTERNAL' (aucun ErrorCode du contrat ne couvre l'erreur
   * serveur inattendue ; le front n'y réagit que par un message générique).
   */
  export interface ApiErrorBody {
    code: ErrorCode | 'INTERNAL';
    message: string;
    details?: unknown;
  }

  const STATUS_TO_CODE: Record<number, ErrorCode> = {
    400: 'VALIDATION_FAILED',
    401: 'AUTH_REQUIRED',
    404: 'NOT_FOUND',
    409: 'VERSION_CONFLICT',
    422: 'VALIDATION_FAILED',
  };

  const STATUS_TO_MESSAGE: Record<number, string> = {
    400: 'Requête invalide.',
    401: 'Connexion requise.',
    404: 'Ressource introuvable.',
    409: 'Conflit de version.',
    422: 'Données invalides.',
  };

  @Catch()
  export class ApiExceptionFilter implements ExceptionFilter {
    private readonly logger = new Logger(ApiExceptionFilter.name);

    catch(exception: unknown, host: ArgumentsHost): void {
      const response = host.switchToHttp().getResponse<Response>();
      const { status, body } = this.toApiError(exception);
      response.status(status).json(body);
    }

    private toApiError(exception: unknown): { status: number; body: ApiErrorBody } {
      if (exception instanceof ApiException) {
        const body: ApiErrorBody = { code: exception.code, message: exception.userMessage };
        if (exception.details !== undefined) {
          body.details = exception.details;
        }
        return { status: exception.getStatus(), body };
      }

      if (exception instanceof HttpException) {
        const status = exception.getStatus();
        return {
          status,
          body: {
            code: STATUS_TO_CODE[status] ?? 'VALIDATION_FAILED',
            message: STATUS_TO_MESSAGE[status] ?? 'Requête invalide.',
          },
        };
      }

      this.logger.error(
        'Erreur inattendue',
        exception instanceof Error ? exception.stack : String(exception),
      );
      return {
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        body: { code: 'INTERNAL', message: 'Erreur interne du serveur.' },
      };
    }
  }
  ```

- [ ] **Étape 7: brancher le filtre et CORS dans `setupApp`**

  En dev, le front (`http://localhost:3000`) et l'API (`http://localhost:3001`) sont des origines différentes : sans CORS crédentialisé, le navigateur refuse d'envoyer et d'accepter le cookie `token`. En production les deux sont derrière la même origine Apache et ce réglage est neutre.

  Remplacer `apps/api/src/app.setup.ts` par :

  ```ts
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
  ```

- [ ] **Étape 8: relancer le test (PASS)**

  ```bash
  pnpm --filter @suivi/api test:unit -- api-exception.filter.spec
  ```

  Résultat attendu : **PASS** — `Tests: 6 passed, 6 total`.

- [ ] **Étape 9: vérifier la non-régression du health e2e**

  ```bash
  pnpm --filter @suivi/api test:e2e -- health.e2e-spec
  ```

  Résultat attendu : **PASS** (3 tests). Les deux tests 404 passent toujours : seul le corps change (`{code:'NOT_FOUND', ...}`), ils n'assertent que le statut.

- [ ] **Étape 10: commit**

  ```bash
  git add apps/api/src/common apps/api/src/app.setup.ts apps/api/src/main.ts apps/api/package.json apps/api/test/jest-e2e.json pnpm-lock.yaml
  git commit -m "feat(api): filtre d'exception global ApiError, CORS credentials, chargement .env"
  ```

> À vérifier à l'exécution : que `dotenv/config` en `setupFiles` charge bien `apps/api/.env` (le cwd de jest est `apps/api` avec `pnpm --filter`). Si `JWT_SECRET` reste indéfini en test, remplacer `"setupFiles": ["dotenv/config"]` par un fichier `apps/api/test/load-env.ts` contenant `import { config } from 'dotenv'; config({ path: `${__dirname}/../.env` });` et le référencer à la place.

---

### Task 2.2: `parseOrThrow` — mécanisme **unique** de validation zod (422 VALIDATION_FAILED avec détails)

> Voir `_contracts.md` § « Erreurs et validation API » : `parseOrThrow` est le seul
> mécanisme de validation de l'API. Il n'existe **pas** de `ZodValidationPipe`.

**Files:**
- Create: `apps/api/src/common/api-error.ts`
- Test: `apps/api/src/common/api-error.spec.ts`

**Interfaces:**
- Consomme : `ApiException` / `validationFailed` (Task 2.1) ; `loginSchema`, `createUserSchema` de `@suivi/shared` (Feature 1) ; `ZodType` de `zod`.
- Produit (utilisé par tous les contrôleurs des Features 2 à 4) :
  - `interface ValidationDetail { path: string; message: string }` ;
  - `function parseOrThrow<T>(schema: ZodType<T>, input: unknown): T` ;
  - en cas d'échec : `ApiException` `VALIDATION_FAILED` / HTTP 422 / `details: ValidationDetail[]`.

- [ ] **Étape 1: écrire le test qui échoue**

  Créer `apps/api/src/common/api-error.spec.ts` :

  ```ts
  import { HttpStatus } from '@nestjs/common';
  import { createUserSchema, loginSchema } from '@suivi/shared';
  import { ApiException } from './api.exception';
  import { parseOrThrow } from './api-error';

  describe('parseOrThrow', () => {
    it('retourne la valeur parsée quand elle est valide', () => {
      expect(parseOrThrow(loginSchema, { email: 'test@suivi.local', password: 'motdepasse' })).toEqual({
        email: 'test@suivi.local',
        password: 'motdepasse',
      });
    });

    it('lève une ApiException VALIDATION_FAILED en 422 quand la valeur est invalide', () => {
      expect(() => parseOrThrow(loginSchema, { email: 'pas-un-email', password: '' })).toThrow(
        ApiException,
      );

      try {
        parseOrThrow(loginSchema, { email: 'pas-un-email', password: '' });
        fail('parseOrThrow aurait dû lever une exception');
      } catch (error) {
        const api = error as ApiException;
        expect(api.code).toBe('VALIDATION_FAILED');
        expect(api.getStatus()).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
        expect(api.userMessage).toBe('Données invalides.');
      }
    });

    it('expose les détails champ par champ, avec les messages français des schémas', () => {
      try {
        parseOrThrow(createUserSchema, {
          email: 'nouveau@exemple.fr',
          displayName: 'Pierre',
          password: 'court',
          cursorColor: 'rouge',
        });
        fail('parseOrThrow aurait dû lever une exception');
      } catch (error) {
        const details = (error as ApiException).details as { path: string; message: string }[];
        expect(details).toEqual(
          expect.arrayContaining([
            { path: 'password', message: 'Mot de passe : 8 caractères minimum' },
            { path: 'cursorColor', message: 'Couleur hexadécimale attendue (ex. #AABBCC)' },
          ]),
        );
      }
    });

    it('signale la racine par un chemin vide (valeur non-objet)', () => {
      try {
        parseOrThrow(loginSchema, 'pas un objet');
        fail('parseOrThrow aurait dû lever une exception');
      } catch (error) {
        const details = (error as ApiException).details as { path: string; message: string }[];
        expect(details.length).toBeGreaterThan(0);
        expect(typeof details[0].path).toBe('string');
      }
    });
  });
  ```

- [ ] **Étape 2: lancer le test (FAIL)**

  ```bash
  pnpm --filter @suivi/api test:unit -- api-error.spec
  ```

  Résultat attendu : **FAIL** — `Cannot find module './api-error'`.

- [ ] **Étape 3: implémenter le helper**

  Créer `apps/api/src/common/api-error.ts` :

  ```ts
  import type { ZodType } from 'zod';
  import { validationFailed } from './api.exception';

  export interface ValidationDetail {
    path: string;
    message: string;
  }

  /**
   * Validation zod — mécanisme unique de l'API (aucun pipe de validation).
   * Usage : `const body = parseOrThrow(createUserSchema, rawBody);`
   * Toute entrée invalide devient une 422 `VALIDATION_FAILED` dont `details`
   * liste les champs fautifs (messages français portés par les schémas partagés).
   */
  export function parseOrThrow<T>(schema: ZodType<T>, input: unknown): T {
    const result = schema.safeParse(input);
    if (result.success) {
      return result.data;
    }
    const details: ValidationDetail[] = result.error.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    }));
    throw validationFailed('Données invalides.', details);
  }
  ```

- [ ] **Étape 4: relancer le test (PASS)**

  ```bash
  pnpm --filter @suivi/api test:unit -- api-error.spec
  ```

  Résultat attendu : **PASS** — `Tests: 4 passed, 4 total`.

- [ ] **Étape 5: commit**

  ```bash
  git add apps/api/src/common/api-error.ts apps/api/src/common/api-error.spec.ts
  git commit -m "feat(api): parseOrThrow, mécanisme unique de validation zod (422 VALIDATION_FAILED détaillé)"
  ```

---

### Task 2.3: `toUserDTO` + `AuthService` (argon2 + signature JWT)

**Files:**
- Create: `apps/api/src/users/user.mapper.ts`, `apps/api/src/auth/auth.service.ts`
- Test: `apps/api/src/auth/auth.service.spec.ts`

**Interfaces:**
- Consomme : `PrismaService` (Feature 1), `UserDTO` de `@suivi/shared`, `ApiException` / `authInvalid` / `authRequired` (Task 2.1), `JwtService` de `@nestjs/jwt`, `argon2`.
- Produit :
  - `export function toUserDTO(user: User): UserDTO` (`apps/api/src/users/user.mapper.ts`) — jamais de `passwordHash` en sortie ; réutilisé par `UsersService` (Task 2.6) ;
  - `export function normalizeEmail(email: string): string` (trim + minuscules) ;
  - `class AuthService` avec :
    - `validateCredentials(email: string, password: string): Promise<UserDTO>` → `AUTH_INVALID` (401) si e-mail inconnu ou mot de passe faux,
    - `getUser(id: string): Promise<UserDTO>` → `AUTH_REQUIRED` (401) si l'utilisateur n'existe plus,
    - `signToken(user: UserDTO): string` → JWT `{ sub: user.id, email: user.email }` (payload attendu par `ws-jwt` en Feature 5).

- [ ] **Étape 1: écrire le test qui échoue**

  Créer `apps/api/src/auth/auth.service.spec.ts` :

  ```ts
  import { HttpStatus } from '@nestjs/common';
  import { JwtService } from '@nestjs/jwt';
  import * as argon2 from 'argon2';
  import type { PrismaService } from '../prisma/prisma.service';
  import { ApiException } from '../common/api.exception';
  import { AuthService } from './auth.service';

  describe('AuthService', () => {
    const jwt = new JwtService({ secret: 'secret-test' });
    let passwordHash: string;

    beforeAll(async () => {
      passwordHash = await argon2.hash('motdepasse');
    }, 30000);

    function dbUser() {
      return {
        id: 'u1',
        email: 'test@suivi.local',
        passwordHash,
        displayName: 'Testeur',
        cursorColor: '#FF0000',
        createdAt: new Date(),
      };
    }

    function serviceWith(found: ReturnType<typeof dbUser> | null): {
      service: AuthService;
      findUnique: jest.Mock;
    } {
      const findUnique = jest.fn().mockResolvedValue(found);
      const prisma = { user: { findUnique } } as unknown as PrismaService;
      return { service: new AuthService(prisma, jwt), findUnique };
    }

    it('retourne un UserDTO sans passwordHash quand le mot de passe est bon', async () => {
      const { service } = serviceWith(dbUser());

      await expect(service.validateCredentials('test@suivi.local', 'motdepasse')).resolves.toEqual({
        id: 'u1',
        email: 'test@suivi.local',
        displayName: 'Testeur',
        cursorColor: '#FF0000',
      });
    });

    it("normalise l'e-mail (trim + minuscules) avant la recherche", async () => {
      const { service, findUnique } = serviceWith(dbUser());

      await service.validateCredentials('  Test@Suivi.Local  ', 'motdepasse');

      expect(findUnique).toHaveBeenCalledWith({ where: { email: 'test@suivi.local' } });
    });

    it('rejette AUTH_INVALID (401) quand le mot de passe est faux', async () => {
      const { service } = serviceWith(dbUser());

      await expect(
        service.validateCredentials('test@suivi.local', 'mauvais-mot-de-passe'),
      ).rejects.toMatchObject({
        code: 'AUTH_INVALID',
        userMessage: 'E-mail ou mot de passe incorrect.',
      });
    });

    it("rejette AUTH_INVALID (401) quand l'e-mail est inconnu", async () => {
      const { service } = serviceWith(null);

      const error: ApiException = await service
        .validateCredentials('inconnu@suivi.local', 'motdepasse')
        .then(
          () => {
            throw new Error('aurait dû échouer');
          },
          (e: ApiException) => e,
        );

      expect(error.code).toBe('AUTH_INVALID');
      expect(error.getStatus()).toBe(HttpStatus.UNAUTHORIZED);
    });

    it('getUser rejette AUTH_REQUIRED quand le compte a disparu', async () => {
      const { service } = serviceWith(null);

      await expect(service.getUser('u1')).rejects.toMatchObject({ code: 'AUTH_REQUIRED' });
    });

    it('signToken produit un JWT dont le payload est { sub, email }', () => {
      const { service } = serviceWith(dbUser());

      const token = service.signToken({
        id: 'u1',
        email: 'test@suivi.local',
        displayName: 'Testeur',
        cursorColor: '#FF0000',
      });

      expect(jwt.verify<{ sub: string; email: string }>(token)).toMatchObject({
        sub: 'u1',
        email: 'test@suivi.local',
      });
    });
  });
  ```

- [ ] **Étape 2: lancer le test (FAIL)**

  ```bash
  pnpm --filter @suivi/api test:unit -- auth.service.spec
  ```

  Résultat attendu : **FAIL** — `Cannot find module './auth.service'`.

- [ ] **Étape 3: implémenter le mapper**

  Créer `apps/api/src/users/user.mapper.ts` :

  ```ts
  import type { User } from '@prisma/client';
  import type { UserDTO } from '@suivi/shared';

  /** Projection User (Prisma) → UserDTO (contrat) : le hash ne sort JAMAIS de l'API. */
  export function toUserDTO(user: User): UserDTO {
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      cursorColor: user.cursorColor,
    };
  }

  /** Les e-mails sont stockés et comparés en minuscules, sans espaces. */
  export function normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }
  ```

- [ ] **Étape 4: implémenter `AuthService`**

  Créer `apps/api/src/auth/auth.service.ts` :

  ```ts
  import { Injectable } from '@nestjs/common';
  import { JwtService } from '@nestjs/jwt';
  import * as argon2 from 'argon2';
  import type { UserDTO } from '@suivi/shared';
  import { authInvalid, authRequired } from '../common/api.exception';
  import { PrismaService } from '../prisma/prisma.service';
  import { normalizeEmail, toUserDTO } from '../users/user.mapper';

  @Injectable()
  export class AuthService {
    constructor(
      private readonly prisma: PrismaService,
      private readonly jwt: JwtService,
    ) {}

    async validateCredentials(email: string, password: string): Promise<UserDTO> {
      const user = await this.prisma.user.findUnique({
        where: { email: normalizeEmail(email) },
      });
      if (!user) {
        throw authInvalid();
      }
      const ok = await argon2.verify(user.passwordHash, password);
      if (!ok) {
        throw authInvalid();
      }
      return toUserDTO(user);
    }

    async getUser(id: string): Promise<UserDTO> {
      const user = await this.prisma.user.findUnique({ where: { id } });
      if (!user) {
        // Le JWT est valide mais le compte a été supprimé entre-temps.
        throw authRequired('Session expirée, reconnectez-vous.');
      }
      return toUserDTO(user);
    }

    signToken(user: UserDTO): string {
      return this.jwt.sign({ sub: user.id, email: user.email });
    }
  }
  ```

- [ ] **Étape 5: relancer le test (PASS)**

  ```bash
  pnpm --filter @suivi/api test:unit -- auth.service.spec
  ```

  Résultat attendu : **PASS** — `Tests: 6 passed, 6 total`.

- [ ] **Étape 6: commit**

  ```bash
  git add apps/api/src/users/user.mapper.ts apps/api/src/auth/auth.service.ts apps/api/src/auth/auth.service.spec.ts
  git commit -m "feat(api): AuthService (argon2.verify, JWT sub/email) et mapper UserDTO"
  ```

---

### Task 2.4: `@Public()`, `JwtAuthGuard` (lecture du cookie) et `@CurrentUser()`

**Files:**
- Create: `apps/api/src/auth/public.decorator.ts`, `apps/api/src/auth/cookie.ts`, `apps/api/src/auth/jwt.guard.ts`, `apps/api/src/auth/current-user.decorator.ts`
- Test: `apps/api/src/auth/jwt.guard.spec.ts`

**Interfaces:**
- Consomme : `ApiException` / `authRequired` (Task 2.1), `Reflector` de `@nestjs/core`, `JwtService` de `@nestjs/jwt`.
- Produit (consommé par les Features 3, 4, 5 et 6) :
  - `const AUTH_COOKIE_NAME = 'token'`, `const AUTH_COOKIE_MAX_AGE_MS = 2592000000` (30 jours), `authCookieOptions(): CookieOptions`, `authCookieClearOptions(): CookieOptions` (`apps/api/src/auth/cookie.ts`) ;
  - `const IS_PUBLIC_KEY = 'isPublic'` et `Public(): CustomDecorator<string>` (`apps/api/src/auth/public.decorator.ts`) ;
  - `interface AuthUser { id: string; email: string }`, `interface AuthenticatedRequest extends Request { user?: AuthUser }` et `class JwtAuthGuard implements CanActivate` (`apps/api/src/auth/jwt.guard.ts`) — enregistrée en `APP_GUARD` global en Task 2.5 ;
  - `currentUserFactory(data, ctx): AuthUser` et `CurrentUser()` (`apps/api/src/auth/current-user.decorator.ts`).

- [ ] **Étape 1: écrire le test qui échoue**

  Créer `apps/api/src/auth/jwt.guard.spec.ts` :

  ```ts
  import type { ExecutionContext } from '@nestjs/common';
  import type { Reflector } from '@nestjs/core';
  import { JwtService } from '@nestjs/jwt';
  import { currentUserFactory } from './current-user.decorator';
  import { AUTH_COOKIE_NAME, authCookieOptions } from './cookie';
  import { JwtAuthGuard, type AuthenticatedRequest } from './jwt.guard';

  const jwt = new JwtService({ secret: 'secret-test' });

  function contextFor(
    cookies: Record<string, string | undefined>,
    type: 'http' | 'ws' = 'http',
  ): { context: ExecutionContext; request: AuthenticatedRequest } {
    const request = { cookies } as unknown as AuthenticatedRequest;
    const context = {
      getType: () => type,
      getHandler: () => undefined,
      getClass: () => undefined,
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
    return { context, request };
  }

  function guardWith(isPublic: boolean): JwtAuthGuard {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(isPublic),
    } as unknown as Reflector;
    return new JwtAuthGuard(reflector, jwt);
  }

  describe('JwtAuthGuard', () => {
    it('refuse AUTH_REQUIRED quand le cookie token est absent', () => {
      const { context } = contextFor({});

      expect(() => guardWith(false).canActivate(context)).toThrow(
        expect.objectContaining({ code: 'AUTH_REQUIRED' }) as unknown as Error,
      );
    });

    it('refuse AUTH_REQUIRED quand le cookie token est invalide', () => {
      const { context } = contextFor({ [AUTH_COOKIE_NAME]: 'nimporte.quoi.ici' });

      expect(() => guardWith(false).canActivate(context)).toThrow(
        expect.objectContaining({ code: 'AUTH_REQUIRED' }) as unknown as Error,
      );
    });

    it('refuse AUTH_REQUIRED quand le token est signé avec un autre secret', () => {
      const autre = new JwtService({ secret: 'autre-secret' }).sign({
        sub: 'u1',
        email: 'test@suivi.local',
      });
      const { context } = contextFor({ [AUTH_COOKIE_NAME]: autre });

      expect(() => guardWith(false).canActivate(context)).toThrow(
        expect.objectContaining({ code: 'AUTH_REQUIRED' }) as unknown as Error,
      );
    });

    it('accepte un token valide et pose req.user = { id, email }', () => {
      const token = jwt.sign({ sub: 'u1', email: 'test@suivi.local' });
      const { context, request } = contextFor({ [AUTH_COOKIE_NAME]: token });

      expect(guardWith(false).canActivate(context)).toBe(true);
      expect(request.user).toEqual({ id: 'u1', email: 'test@suivi.local' });
    });

    it('laisse passer une route marquée @Public() sans cookie', () => {
      const { context } = contextFor({});

      expect(guardWith(true).canActivate(context)).toBe(true);
    });

    it("laisse passer les contextes non HTTP (les sockets s'authentifient en Feature 5)", () => {
      const { context } = contextFor({}, 'ws');

      expect(guardWith(false).canActivate(context)).toBe(true);
    });
  });

  describe('cookie', () => {
    it('produit un cookie httpOnly, sameSite lax, 30 jours, non secure hors production', () => {
      const previous = process.env.NODE_ENV;
      process.env.NODE_ENV = 'test';

      expect(authCookieOptions()).toEqual({
        httpOnly: true,
        sameSite: 'lax',
        secure: false,
        path: '/',
        maxAge: 30 * 24 * 60 * 60 * 1000,
      });

      process.env.NODE_ENV = previous;
    });

    it('produit un cookie secure en production', () => {
      const previous = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      expect(authCookieOptions().secure).toBe(true);

      process.env.NODE_ENV = previous;
    });
  });

  describe('currentUserFactory', () => {
    it("retourne l'utilisateur posé par la garde", () => {
      const { context, request } = contextFor({});
      request.user = { id: 'u1', email: 'test@suivi.local' };

      expect(currentUserFactory(undefined, context)).toEqual({
        id: 'u1',
        email: 'test@suivi.local',
      });
    });

    it('lève AUTH_REQUIRED si aucune garde n\'a posé req.user', () => {
      const { context } = contextFor({});

      expect(() => currentUserFactory(undefined, context)).toThrow(
        expect.objectContaining({ code: 'AUTH_REQUIRED' }) as unknown as Error,
      );
    });
  });
  ```

- [ ] **Étape 2: lancer le test (FAIL)**

  ```bash
  pnpm --filter @suivi/api test:unit -- jwt.guard.spec
  ```

  Résultat attendu : **FAIL** — `Cannot find module './current-user.decorator'`.

- [ ] **Étape 3: implémenter le cookie et le décorateur `@Public()`**

  Créer `apps/api/src/auth/cookie.ts` :

  ```ts
  import type { CookieOptions } from 'express';

  /** Nom du cookie JWT httpOnly (contrat partagé) — lu aussi par le middleware Next. */
  export const AUTH_COOKIE_NAME = 'token';

  /** 30 jours, en millisecondes (unité attendue par express `res.cookie`). */
  export const AUTH_COOKIE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

  function baseOptions(): CookieOptions {
    return {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
    };
  }

  export function authCookieOptions(): CookieOptions {
    return { ...baseOptions(), maxAge: AUTH_COOKIE_MAX_AGE_MS };
  }

  /** Mêmes attributs SANS maxAge : express `clearCookie` pose sa propre expiration. */
  export function authCookieClearOptions(): CookieOptions {
    return baseOptions();
  }
  ```

  Créer `apps/api/src/auth/public.decorator.ts` :

  ```ts
  import { type CustomDecorator, SetMetadata } from '@nestjs/common';

  export const IS_PUBLIC_KEY = 'isPublic';

  /**
   * Marque une route comme accessible sans cookie JWT, malgré la garde globale
   * `JwtAuthGuard` (APP_GUARD). Utilisé par `POST /api/auth/login`,
   * `POST /api/auth/logout` et `GET /api/health` uniquement.
   */
  export const Public = (): CustomDecorator<string> => SetMetadata(IS_PUBLIC_KEY, true);
  ```

- [ ] **Étape 4: implémenter la garde et `@CurrentUser()`**

  Créer `apps/api/src/auth/jwt.guard.ts` :

  ```ts
  import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
  import { Reflector } from '@nestjs/core';
  import { JwtService } from '@nestjs/jwt';
  import type { Request } from 'express';
  import { authRequired } from '../common/api.exception';
  import { AUTH_COOKIE_NAME } from './cookie';
  import { IS_PUBLIC_KEY } from './public.decorator';

  export interface AuthUser {
    id: string;
    email: string;
  }

  export interface AuthenticatedRequest extends Request {
    user?: AuthUser;
  }

  interface JwtPayload {
    sub: string;
    email: string;
  }

  /**
   * Garde globale (APP_GUARD) : lit le cookie httpOnly `token`, vérifie le JWT
   * et pose `req.user`. Les routes marquées `@Public()` sont laissées passer.
   * Les contextes non HTTP (WebSocket) sont ignorés : le handshake Socket.IO
   * est authentifié par `ws-jwt` en Feature 5.
   */
  @Injectable()
  export class JwtAuthGuard implements CanActivate {
    constructor(
      private readonly reflector: Reflector,
      private readonly jwt: JwtService,
    ) {}

    canActivate(context: ExecutionContext): boolean {
      if (context.getType() !== 'http') {
        return true;
      }

      const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
        context.getHandler(),
        context.getClass(),
      ]);
      if (isPublic) {
        return true;
      }

      const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
      const cookies = request.cookies as Record<string, string | undefined> | undefined;
      const token = cookies?.[AUTH_COOKIE_NAME];
      if (!token) {
        throw authRequired();
      }

      try {
        const payload = this.jwt.verify<JwtPayload>(token);
        request.user = { id: payload.sub, email: payload.email };
        return true;
      } catch {
        throw authRequired('Session expirée, reconnectez-vous.');
      }
    }
  }
  ```

  Créer `apps/api/src/auth/current-user.decorator.ts` :

  ```ts
  import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
  import { authRequired } from '../common/api.exception';
  import type { AuthUser, AuthenticatedRequest } from './jwt.guard';

  /** Factory exportée à part pour être testable unitairement. */
  export function currentUserFactory(_data: unknown, context: ExecutionContext): AuthUser {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.user) {
      throw authRequired();
    }
    return request.user;
  }

  /** Usage : `me(@CurrentUser() user: AuthUser)`. */
  export const CurrentUser = createParamDecorator(currentUserFactory);
  ```

- [ ] **Étape 5: relancer le test (PASS)**

  ```bash
  pnpm --filter @suivi/api test:unit -- jwt.guard.spec
  ```

  Résultat attendu : **PASS** — `Tests: 10 passed, 10 total`.

- [ ] **Étape 6: commit**

  ```bash
  git add apps/api/src/auth/cookie.ts apps/api/src/auth/public.decorator.ts apps/api/src/auth/jwt.guard.ts apps/api/src/auth/current-user.decorator.ts apps/api/src/auth/jwt.guard.spec.ts
  git commit -m "feat(api): JwtAuthGuard (cookie token), decorateurs @Public et @CurrentUser"
  ```

> À vérifier à l'exécution : la modification de `process.env.NODE_ENV` dans le test des cookies — sous jest, `NODE_ENV` vaut `test`, la remise en état est faite par le test lui-même. Si un lint interdit l'écriture de `process.env.NODE_ENV`, remplacer les deux tests par un appel à une variante `authCookieOptions({ production: boolean })` sans rien changer d'autre à la logique.

---

### Task 2.5: `AuthModule` + `AuthController` (login / logout / me), garde globale, health public

**Files:**
- Create: `apps/api/src/auth/auth.controller.ts`, `apps/api/src/auth/auth.module.ts`, `apps/api/src/auth/jwt-secret.ts`
- Modify: `apps/api/src/app.module.ts`, `apps/api/src/health/health.controller.ts`
- Test: `apps/api/test/auth.e2e-spec.ts`

**Interfaces:**
- Consomme : `AuthService` (Task 2.3), `JwtAuthGuard` / `@Public()` / `@CurrentUser()` / `authCookieOptions()` / `authCookieClearOptions()` (Task 2.4), `parseOrThrow` (Task 2.2), `loginSchema` de `@suivi/shared`, `setupApp` (Task 2.1).
- Produit :
  - `POST /api/auth/login` → `200 { user: UserDTO }` + `Set-Cookie: token=...` ; `401 AUTH_INVALID` ; `422 VALIDATION_FAILED` ;
  - `POST /api/auth/logout` → `204` + effacement du cookie (route `@Public()` : la déconnexion doit aboutir même si le JWT a expiré) ;
  - `GET /api/auth/me` → `200 { user: UserDTO }` ; `401 AUTH_REQUIRED` ;
  - `class AuthModule` (importe `JwtModule` en global, enregistre `JwtAuthGuard` en `APP_GUARD`, exporte `AuthService` et `JwtModule` pour la Feature 5) ;
  - `export function jwtSecret(): string`.

- [ ] **Étape 1: écrire les tests e2e qui échouent**

  Créer `apps/api/test/auth.e2e-spec.ts` :

  ```ts
  import type { INestApplication } from '@nestjs/common';
  import { Test } from '@nestjs/testing';
  import request from 'supertest';
  import * as argon2 from 'argon2';
  import { AppModule } from '../src/app.module';
  import { setupApp } from '../src/app.setup';
  import { PrismaService } from '../src/prisma/prisma.service';

  describe('Auth (e2e)', () => {
    let app: INestApplication;
    let prisma: PrismaService;

    beforeAll(async () => {
      const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
      app = setupApp(moduleRef.createNestApplication());
      await app.init();
      prisma = app.get(PrismaService);
    });

    afterAll(async () => {
      await app.close();
    });

    beforeEach(async () => {
      await prisma.rowEvent.deleteMany();
      await prisma.user.deleteMany();
      await prisma.user.create({
        data: {
          email: 'test@suivi.local',
          passwordHash: await argon2.hash('motdepasse'),
          displayName: 'Testeur',
          cursorColor: '#FF0000',
        },
      });
    }, 30000);

    async function login(): Promise<string[]> {
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'test@suivi.local', password: 'motdepasse' })
        .expect(200);
      return res.get('Set-Cookie') as unknown as string[];
    }

    it('POST /api/auth/login : identifiants valides → 200 + cookie httpOnly token', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'test@suivi.local', password: 'motdepasse' })
        .expect(200);

      expect(res.body.user).toMatchObject({
        email: 'test@suivi.local',
        displayName: 'Testeur',
        cursorColor: '#FF0000',
      });
      expect(res.body.user.passwordHash).toBeUndefined();

      const cookies = res.get('Set-Cookie') as unknown as string[];
      const token = cookies.find((c) => c.startsWith('token='));
      expect(token).toBeDefined();
      expect(token).toContain('HttpOnly');
      expect(token).toContain('SameSite=Lax');
      expect(token).toContain('Max-Age=2592000');
      expect(token).not.toContain('Secure');
    });

    it("POST /api/auth/login : e-mail en majuscules → accepté (normalisation)", async () => {
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'TEST@Suivi.Local', password: 'motdepasse' })
        .expect(200);
    });

    it('POST /api/auth/login : mauvais mot de passe → 401 AUTH_INVALID', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'test@suivi.local', password: 'mauvais-mot-de-passe' })
        .expect(401);

      expect(res.body).toEqual({
        code: 'AUTH_INVALID',
        message: 'E-mail ou mot de passe incorrect.',
      });
      expect(res.get('Set-Cookie')).toBeUndefined();
    });

    it('POST /api/auth/login : e-mail inconnu → 401 AUTH_INVALID', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'inconnu@suivi.local', password: 'motdepasse' })
        .expect(401);

      expect(res.body.code).toBe('AUTH_INVALID');
    });

    it('POST /api/auth/login : corps invalide → 422 VALIDATION_FAILED avec details', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'pas-un-email', password: '' })
        .expect(422);

      expect(res.body.code).toBe('VALIDATION_FAILED');
      expect(res.body.message).toBe('Données invalides.');
      expect(Array.isArray(res.body.details)).toBe(true);
      expect(res.body.details.length).toBeGreaterThan(0);
    });

    it('GET /api/auth/me : sans cookie → 401 AUTH_REQUIRED', async () => {
      const res = await request(app.getHttpServer()).get('/api/auth/me').expect(401);

      expect(res.body).toEqual({ code: 'AUTH_REQUIRED', message: 'Connexion requise.' });
    });

    it('GET /api/auth/me : cookie invalide → 401 AUTH_REQUIRED', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/auth/me')
        .set('Cookie', ['token=nimporte.quoi.ici'])
        .expect(401);

      expect(res.body.code).toBe('AUTH_REQUIRED');
    });

    it("GET /api/auth/me : avec cookie → 200 et l'utilisateur courant", async () => {
      const cookie = await login();

      const res = await request(app.getHttpServer())
        .get('/api/auth/me')
        .set('Cookie', cookie)
        .expect(200);

      expect(res.body.user).toMatchObject({
        email: 'test@suivi.local',
        displayName: 'Testeur',
      });
    });

    it('POST /api/auth/logout : 204 et efface le cookie', async () => {
      const cookie = await login();

      const res = await request(app.getHttpServer())
        .post('/api/auth/logout')
        .set('Cookie', cookie)
        .expect(204);

      const cookies = res.get('Set-Cookie') as unknown as string[];
      expect(cookies.some((c) => c.startsWith('token=;'))).toBe(true);
    });

    it('POST /api/auth/logout : réussit aussi sans cookie (route publique)', async () => {
      await request(app.getHttpServer()).post('/api/auth/logout').expect(204);
    });

    it('GET /api/health reste accessible sans cookie (@Public)', async () => {
      const res = await request(app.getHttpServer()).get('/api/health').expect(200);

      expect(res.body).toEqual({ status: 'ok' });
    });

    it('une route protégée inconnue renvoie bien le format ApiError', async () => {
      const res = await request(app.getHttpServer()).get('/api/inexistant').expect(404);

      expect(res.body).toEqual({ code: 'NOT_FOUND', message: 'Ressource introuvable.' });
    });
  });
  ```

- [ ] **Étape 2: lancer les tests (FAIL)**

  ```bash
  pnpm --filter @suivi/api test:e2e -- auth.e2e-spec
  ```

  Résultat attendu : **FAIL** — tous les appels `/api/auth/*` répondent 404 (`expected 200 "OK", got 404 "Not Found"`) : `AuthController` n'existe pas.

- [ ] **Étape 3: implémenter le secret JWT**

  Créer `apps/api/src/auth/jwt-secret.ts` :

  ```ts
  /**
   * Secret de signature des JWT. Obligatoire en production ; en dev/test, un
   * secret par défaut évite d'imposer un `.env` pour lancer les tests unitaires.
   */
  export function jwtSecret(): string {
    const secret = process.env.JWT_SECRET;
    if (secret && secret.length > 0) {
      return secret;
    }
    if (process.env.NODE_ENV === 'production') {
      throw new Error('JWT_SECRET est obligatoire en production (apps/api/.env).');
    }
    return 'dev-secret-non-securise';
  }
  ```

- [ ] **Étape 4: implémenter le contrôleur**

  Créer `apps/api/src/auth/auth.controller.ts` :

  ```ts
  import { Body, Controller, Get, HttpCode, HttpStatus, Post, Res } from '@nestjs/common';
  import type { Response } from 'express';
  import type { z } from 'zod';
  import { loginSchema, type UserDTO } from '@suivi/shared';
  import { parseOrThrow } from '../common/api-error';
  import { AuthService } from './auth.service';
  import { AUTH_COOKIE_NAME, authCookieClearOptions, authCookieOptions } from './cookie';
  import { CurrentUser } from './current-user.decorator';
  import type { AuthUser } from './jwt.guard';
  import { Public } from './public.decorator';

  type LoginInput = z.infer<typeof loginSchema>;

  @Controller('auth')
  export class AuthController {
    constructor(private readonly auth: AuthService) {}

    @Public()
    @Post('login')
    @HttpCode(HttpStatus.OK)
    async login(
      @Body() rawBody: unknown,
      @Res({ passthrough: true }) res: Response,
    ): Promise<{ user: UserDTO }> {
      const body: LoginInput = parseOrThrow(loginSchema, rawBody);
      const user = await this.auth.validateCredentials(body.email, body.password);
      res.cookie(AUTH_COOKIE_NAME, this.auth.signToken(user), authCookieOptions());
      return { user };
    }

    @Public()
    @Post('logout')
    @HttpCode(HttpStatus.NO_CONTENT)
    logout(@Res({ passthrough: true }) res: Response): void {
      res.clearCookie(AUTH_COOKIE_NAME, authCookieClearOptions());
    }

    @Get('me')
    async me(@CurrentUser() current: AuthUser): Promise<{ user: UserDTO }> {
      return { user: await this.auth.getUser(current.id) };
    }
  }
  ```

- [ ] **Étape 5: implémenter le module et le brancher**

  Créer `apps/api/src/auth/auth.module.ts` :

  ```ts
  import { Module } from '@nestjs/common';
  import { APP_GUARD } from '@nestjs/core';
  import { JwtModule } from '@nestjs/jwt';
  import { AuthController } from './auth.controller';
  import { AuthService } from './auth.service';
  import { JwtAuthGuard } from './jwt.guard';
  import { jwtSecret } from './jwt-secret';

  @Module({
    imports: [
      JwtModule.registerAsync({
        global: true,
        useFactory: () => ({
          secret: jwtSecret(),
          signOptions: { expiresIn: '30d' },
        }),
      }),
    ],
    controllers: [AuthController],
    providers: [AuthService, { provide: APP_GUARD, useClass: JwtAuthGuard }],
    exports: [AuthService, JwtModule],
  })
  export class AuthModule {}
  ```

  Remplacer `apps/api/src/app.module.ts` par (les modules des features suivantes s'ajouteront à `imports`) :

  ```ts
  import { Module } from '@nestjs/common';
  import { AuthModule } from './auth/auth.module';
  import { HealthModule } from './health/health.module';
  import { PrismaModule } from './prisma/prisma.module';

  @Module({
    imports: [PrismaModule, HealthModule, AuthModule],
  })
  export class AppModule {}
  ```

  Remplacer `apps/api/src/health/health.controller.ts` par (la garde est globale : sans `@Public()`, la sonde de santé exigerait un cookie) :

  ```ts
  import { Controller, Get } from '@nestjs/common';
  import { Public } from '../auth/public.decorator';

  @Public()
  @Controller('health')
  export class HealthController {
    @Get()
    getHealth(): { status: 'ok' } {
      return { status: 'ok' };
    }
  }
  ```

- [ ] **Étape 6: relancer les tests (PASS)**

  ```bash
  pnpm --filter @suivi/api test:e2e -- auth.e2e-spec
  ```

  Résultat attendu : **PASS** — `Tests: 12 passed, 12 total`.

- [ ] **Étape 7: vérifier que le health e2e passe toujours**

  ```bash
  pnpm --filter @suivi/api test:e2e -- health.e2e-spec
  ```

  Résultat attendu : **PASS** (3 tests) — la garde globale ne casse pas la sonde grâce à `@Public()`.

- [ ] **Étape 8: commit**

  ```bash
  git add apps/api/src/auth apps/api/src/app.module.ts apps/api/src/health/health.controller.ts apps/api/test/auth.e2e-spec.ts
  git commit -m "feat(api): routes auth login/logout/me, garde JWT globale, health public"
  ```

> À vérifier à l'exécution : le type de retour de `res.get('Set-Cookie')` de supertest 7 (`string[]` selon les versions, d'où le `as unknown as string[]`). Si TypeScript le typait déjà `string[]`, retirer simplement les casts.

---

### Task 2.6: `UsersModule` — liste, création de membre, mise à jour de son profil

**Files:**
- Create: `apps/api/src/users/users.service.ts`, `apps/api/src/users/users.controller.ts`, `apps/api/src/users/users.module.ts`
- Modify: `apps/api/src/app.module.ts`
- Test: `apps/api/test/users.e2e-spec.ts`

**Interfaces:**
- Consomme : `PrismaService`, `toUserDTO` / `normalizeEmail` (Task 2.3), `parseOrThrow` (Task 2.2), `validationFailed` (Task 2.1), `@CurrentUser()` + `AuthUser` (Task 2.4), `createUserSchema` / `updateMeSchema` / `UserDTO` de `@suivi/shared`.
- Produit :
  - `GET /api/users` → `200 UserDTO[]` (tri par `displayName`) ;
  - `POST /api/users` → `201 UserDTO` ; e-mail déjà utilisé → `422 VALIDATION_FAILED` ;
  - `PATCH /api/users/me` → `200 UserDTO` (`displayName` / `cursorColor` / `password`) ;
  - `class UsersService` : `list(): Promise<UserDTO[]>`, `create(input: CreateUserInput): Promise<UserDTO>`, `updateMe(id: string, input: UpdateMeInput): Promise<UserDTO>` ;
  - `class UsersModule` (exporte `UsersService` — consommé par la Feature 3 et par la présence en Feature 5).

- [ ] **Étape 1: écrire les tests e2e qui échouent**

  Créer `apps/api/test/users.e2e-spec.ts` :

  ```ts
  import type { INestApplication } from '@nestjs/common';
  import { Test } from '@nestjs/testing';
  import request from 'supertest';
  import * as argon2 from 'argon2';
  import { AppModule } from '../src/app.module';
  import { setupApp } from '../src/app.setup';
  import { PrismaService } from '../src/prisma/prisma.service';

  describe('Users (e2e)', () => {
    let app: INestApplication;
    let prisma: PrismaService;
    let cookie: string[];

    beforeAll(async () => {
      const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
      app = setupApp(moduleRef.createNestApplication());
      await app.init();
      prisma = app.get(PrismaService);
    });

    afterAll(async () => {
      await app.close();
    });

    beforeEach(async () => {
      await prisma.rowEvent.deleteMany();
      await prisma.user.deleteMany();
      await prisma.user.create({
        data: {
          email: 'test@suivi.local',
          passwordHash: await argon2.hash('motdepasse'),
          displayName: 'Testeur',
          cursorColor: '#FF0000',
        },
      });
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'test@suivi.local', password: 'motdepasse' })
        .expect(200);
      cookie = res.get('Set-Cookie') as unknown as string[];
    }, 30000);

    it('GET /api/users : sans cookie → 401 AUTH_REQUIRED', async () => {
      const res = await request(app.getHttpServer()).get('/api/users').expect(401);

      expect(res.body.code).toBe('AUTH_REQUIRED');
    });

    it('GET /api/users : liste les membres triés par nom, sans hash', async () => {
      await request(app.getHttpServer())
        .post('/api/users')
        .set('Cookie', cookie)
        .send({
          email: 'aline@suivi.local',
          displayName: 'Aline',
          password: 'motdepasse',
          cursorColor: '#2ECC71',
        })
        .expect(201);

      const res = await request(app.getHttpServer())
        .get('/api/users')
        .set('Cookie', cookie)
        .expect(200);

      expect(res.body.map((u: { displayName: string }) => u.displayName)).toEqual([
        'Aline',
        'Testeur',
      ]);
      expect(Object.keys(res.body[0]).sort()).toEqual([
        'cursorColor',
        'displayName',
        'email',
        'id',
      ]);
    });

    it('POST /api/users : crée un membre, e-mail normalisé et mot de passe hashé', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/users')
        .set('Cookie', cookie)
        .send({
          email: '  Pierre@Suivi.Local ',
          displayName: 'Pierre',
          password: 'motdepasse',
          cursorColor: '#8E44AD',
        })
        .expect(201);

      expect(res.body).toMatchObject({
        email: 'pierre@suivi.local',
        displayName: 'Pierre',
        cursorColor: '#8E44AD',
      });

      const created = await prisma.user.findUniqueOrThrow({
        where: { email: 'pierre@suivi.local' },
      });
      expect(created.passwordHash).not.toBe('motdepasse');
      await expect(argon2.verify(created.passwordHash, 'motdepasse')).resolves.toBe(true);
    });

    it('POST /api/users : le nouveau membre peut se connecter', async () => {
      await request(app.getHttpServer())
        .post('/api/users')
        .set('Cookie', cookie)
        .send({
          email: 'pierre@suivi.local',
          displayName: 'Pierre',
          password: 'motdepasse',
          cursorColor: '#8E44AD',
        })
        .expect(201);

      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'pierre@suivi.local', password: 'motdepasse' })
        .expect(200);
    });

    it('POST /api/users : e-mail déjà utilisé → 422 VALIDATION_FAILED', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/users')
        .set('Cookie', cookie)
        .send({
          email: 'TEST@suivi.local',
          displayName: 'Doublon',
          password: 'motdepasse',
          cursorColor: '#8E44AD',
        })
        .expect(422);

      expect(res.body).toMatchObject({
        code: 'VALIDATION_FAILED',
        message: 'Cette adresse e-mail est déjà utilisée.',
        details: [{ path: 'email', message: 'Cette adresse e-mail est déjà utilisée.' }],
      });
    });

    it('POST /api/users : corps invalide → 422 VALIDATION_FAILED', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/users')
        .set('Cookie', cookie)
        .send({
          email: 'nouveau@suivi.local',
          displayName: 'Nouveau',
          password: 'court',
          cursorColor: 'rouge',
        })
        .expect(422);

      expect(res.body.code).toBe('VALIDATION_FAILED');
      expect(res.body.details).toEqual(
        expect.arrayContaining([
          { path: 'password', message: 'Mot de passe : 8 caractères minimum' },
        ]),
      );
    });

    it('PATCH /api/users/me : modifie nom et couleur de curseur', async () => {
      const res = await request(app.getHttpServer())
        .patch('/api/users/me')
        .set('Cookie', cookie)
        .send({ displayName: 'Quentin D.', cursorColor: '#3498DB' })
        .expect(200);

      expect(res.body).toMatchObject({ displayName: 'Quentin D.', cursorColor: '#3498DB' });
    });

    it('PATCH /api/users/me : change le mot de passe (nouvelle connexion possible)', async () => {
      await request(app.getHttpServer())
        .patch('/api/users/me')
        .set('Cookie', cookie)
        .send({ password: 'nouveaumotdepasse' })
        .expect(200);

      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'test@suivi.local', password: 'nouveaumotdepasse' })
        .expect(200);

      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'test@suivi.local', password: 'motdepasse' })
        .expect(401);
    });

    it('PATCH /api/users/me : corps vide → 422 VALIDATION_FAILED', async () => {
      const res = await request(app.getHttpServer())
        .patch('/api/users/me')
        .set('Cookie', cookie)
        .send({})
        .expect(422);

      expect(res.body.code).toBe('VALIDATION_FAILED');
    });

    it('PATCH /api/users/me : sans cookie → 401 AUTH_REQUIRED', async () => {
      const res = await request(app.getHttpServer())
        .patch('/api/users/me')
        .send({ displayName: 'X' })
        .expect(401);

      expect(res.body.code).toBe('AUTH_REQUIRED');
    });
  });
  ```

- [ ] **Étape 2: lancer les tests (FAIL)**

  ```bash
  pnpm --filter @suivi/api test:e2e -- users.e2e-spec
  ```

  Résultat attendu : **FAIL** — le premier test passe (401 par la garde globale) mais toutes les routes `/api/users` répondent 404 : `UsersController` n'existe pas.

- [ ] **Étape 3: implémenter le service**

  Créer `apps/api/src/users/users.service.ts` :

  ```ts
  import { Injectable } from '@nestjs/common';
  import { Prisma } from '@prisma/client';
  import * as argon2 from 'argon2';
  import type { z } from 'zod';
  import { createUserSchema, updateMeSchema, type UserDTO } from '@suivi/shared';
  import { validationFailed } from '../common/api.exception';
  import { PrismaService } from '../prisma/prisma.service';
  import { normalizeEmail, toUserDTO } from './user.mapper';

  export type CreateUserInput = z.infer<typeof createUserSchema>;
  export type UpdateMeInput = z.infer<typeof updateMeSchema>;

  const EMAIL_DEJA_UTILISE = 'Cette adresse e-mail est déjà utilisée.';

  @Injectable()
  export class UsersService {
    constructor(private readonly prisma: PrismaService) {}

    async list(): Promise<UserDTO[]> {
      const users = await this.prisma.user.findMany({ orderBy: { displayName: 'asc' } });
      return users.map(toUserDTO);
    }

    async create(input: CreateUserInput): Promise<UserDTO> {
      const email = normalizeEmail(input.email);
      const existing = await this.prisma.user.findUnique({ where: { email } });
      if (existing) {
        throw validationFailed(EMAIL_DEJA_UTILISE, [
          { path: 'email', message: EMAIL_DEJA_UTILISE },
        ]);
      }

      try {
        const user = await this.prisma.user.create({
          data: {
            email,
            displayName: input.displayName,
            cursorColor: input.cursorColor,
            passwordHash: await argon2.hash(input.password),
          },
        });
        return toUserDTO(user);
      } catch (error) {
        // Course entre deux créations simultanées : contrainte unique Postgres.
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          throw validationFailed(EMAIL_DEJA_UTILISE, [
            { path: 'email', message: EMAIL_DEJA_UTILISE },
          ]);
        }
        throw error;
      }
    }

    async updateMe(id: string, input: UpdateMeInput): Promise<UserDTO> {
      const data: Prisma.UserUpdateInput = {};
      if (input.displayName !== undefined) {
        data.displayName = input.displayName;
      }
      if (input.cursorColor !== undefined) {
        data.cursorColor = input.cursorColor;
      }
      if (input.password !== undefined) {
        data.passwordHash = await argon2.hash(input.password);
      }
      const user = await this.prisma.user.update({ where: { id }, data });
      return toUserDTO(user);
    }
  }
  ```

- [ ] **Étape 4: implémenter le contrôleur et le module**

  Créer `apps/api/src/users/users.controller.ts` :

  ```ts
  import { Body, Controller, Get, HttpCode, HttpStatus, Patch, Post } from '@nestjs/common';
  import { createUserSchema, updateMeSchema, type UserDTO } from '@suivi/shared';
  import { parseOrThrow } from '../common/api-error';
  import { CurrentUser } from '../auth/current-user.decorator';
  import type { AuthUser } from '../auth/jwt.guard';
  import {
    UsersService,
    type CreateUserInput,
    type UpdateMeInput,
  } from './users.service';

  @Controller('users')
  export class UsersController {
    constructor(private readonly users: UsersService) {}

    @Get()
    list(): Promise<UserDTO[]> {
      return this.users.list();
    }

    @Post()
    @HttpCode(HttpStatus.CREATED)
    create(@Body() rawBody: unknown): Promise<UserDTO> {
      const body: CreateUserInput = parseOrThrow(createUserSchema, rawBody);
      return this.users.create(body);
    }

    @Patch('me')
    updateMe(
      @CurrentUser() current: AuthUser,
      @Body() rawBody: unknown,
    ): Promise<UserDTO> {
      const body: UpdateMeInput = parseOrThrow(updateMeSchema, rawBody);
      return this.users.updateMe(current.id, body);
    }
  }
  ```

  Créer `apps/api/src/users/users.module.ts` :

  ```ts
  import { Module } from '@nestjs/common';
  import { UsersController } from './users.controller';
  import { UsersService } from './users.service';

  @Module({
    controllers: [UsersController],
    providers: [UsersService],
    exports: [UsersService],
  })
  export class UsersModule {}
  ```

  Remplacer `apps/api/src/app.module.ts` par :

  ```ts
  import { Module } from '@nestjs/common';
  import { AuthModule } from './auth/auth.module';
  import { HealthModule } from './health/health.module';
  import { PrismaModule } from './prisma/prisma.module';
  import { UsersModule } from './users/users.module';

  @Module({
    imports: [PrismaModule, HealthModule, AuthModule, UsersModule],
  })
  export class AppModule {}
  ```

- [ ] **Étape 5: relancer les tests (PASS)**

  ```bash
  pnpm --filter @suivi/api test:e2e -- users.e2e-spec
  ```

  Résultat attendu : **PASS** — `Tests: 10 passed, 10 total`.

- [ ] **Étape 6: commit**

  ```bash
  git add apps/api/src/users apps/api/src/app.module.ts apps/api/test/users.e2e-spec.ts
  git commit -m "feat(api): UsersModule (liste, creation membre argon2, PATCH /users/me)"
  ```

---

### Task 2.7: Client HTTP typé du front (`lib/api.ts`) + harnais Playwright

**Files:**
- Create: `apps/web/src/lib/api.ts`, `apps/web/playwright.config.ts`, `apps/web/e2e/global-setup.ts`, `apps/web/e2e/api-client.spec.ts`
- Modify: `apps/web/package.json` (devDependency `@playwright/test`, script `test:e2e`), `.gitignore`
- Test: `apps/web/e2e/api-client.spec.ts`

**Interfaces:**
- Consomme : `ApiError`, `ErrorCode` de `@suivi/shared` (types seulement) ; les routes de la Task 2.5.
- Produit (consommé par TOUTES les features web suivantes) :
  - `const apiBaseUrl: string` (= `process.env.NEXT_PUBLIC_API_URL ?? ''`) ;
  - `function serverApiBaseUrl(): string` (URL absolue utilisable depuis un Server Component) ;
  - `type ApiErrorCode = ErrorCode | 'INTERNAL'` ;
  - `class ApiRequestError extends Error { code: ApiErrorCode; status: number; details?: unknown }` ;
  - `apiUrl(path: string): string` (= `` `${apiBaseUrl}/api${path}` ``) et `apiFetch<T>(path: string, init?: RequestInit): Promise<T>` — **les appelants passent un chemin sans le préfixe `/api`** ;
  - `apiGet<T>(path, init?)`, `apiPost<T>(path, body?, init?)`, `apiPatch<T>(path, body?, init?)`, `apiDel<T>(path, init?)` ;
  - `const api = { get, post, patch, del }` ;
  - harnais Playwright **unique du dépôt** : `apps/web/playwright.config.ts` (webServer api + web, `baseURL = E2E_WEB_URL ?? http://localhost:3000`, `projects: [chromium]`), script `pnpm --filter @suivi/web test:e2e`. Les Features 6, 7 et 8 déposent leurs specs dans `apps/web/e2e/` **sans modifier ce fichier**.

- [ ] **Étape 1: installer Playwright dans `apps/web` et déclarer son script**

  ```bash
  pnpm --filter @suivi/web add -D @playwright/test@^1.49.0
  pnpm --filter @suivi/web exec playwright install chromium
  ```

  Dans `apps/web/package.json`, ajouter au bloc `scripts` :

  ```json
  "test:e2e": "playwright test"
  ```

  Ajouter les dossiers de rapport à `.gitignore` :

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
  apps/web/playwright-report/
  apps/web/test-results/
  ```

- [ ] **Étape 2: écrire le test qui échoue**

  Le client HTTP est du TypeScript pur : il est testé avec le *runner* Playwright (aucun navigateur, `fetch` global remplacé par un bouchon), ce qui évite d'introduire un second runner côté web.

  Créer `apps/web/e2e/api-client.spec.ts` :

  ```ts
  import { expect, test } from '@playwright/test';
  import { ApiRequestError, api, apiFetch } from '../src/lib/api';

  interface Call {
    url: string;
    init: RequestInit;
  }

  const realFetch = globalThis.fetch;

  function stubFetch(response: Response): Call[] {
    const calls: Call[] = [];
    globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), init: init ?? {} });
      return Promise.resolve(response);
    }) as typeof fetch;
    return calls;
  }

  test.afterEach(() => {
    globalThis.fetch = realFetch;
  });

  function json(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  test('api.get envoie GET avec credentials include', async () => {
    const calls = stubFetch(json({ user: { id: 'u1' } }));

    const result = await api.get<{ user: { id: string } }>('/auth/me');

    expect(result).toEqual({ user: { id: 'u1' } });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('/api/auth/me');
    expect(calls[0].init.method).toBe('GET');
    expect(calls[0].init.credentials).toBe('include');
  });

  test('api.post sérialise le corps en JSON et pose Content-Type', async () => {
    const calls = stubFetch(json({ user: { id: 'u1' } }));

    await api.post('/auth/login', { email: 'a@b.fr', password: 'x' });

    expect(calls[0].init.method).toBe('POST');
    expect(calls[0].init.body).toBe('{"email":"a@b.fr","password":"x"}');
    expect(new Headers(calls[0].init.headers).get('Content-Type')).toBe('application/json');
  });

  test('une réponse 204 renvoie undefined sans tenter de parser le corps', async () => {
    stubFetch(new Response(null, { status: 204 }));

    await expect(api.del('/rows/r1')).resolves.toBeUndefined();
  });

  test('une ApiError du serveur devient une ApiRequestError typée', async () => {
    stubFetch(
      json(
        { code: 'AUTH_INVALID', message: 'E-mail ou mot de passe incorrect.' },
        401,
      ),
    );

    const error = await api.post('/auth/login', {}).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiRequestError);
    const api_error = error as ApiRequestError;
    expect(api_error.code).toBe('AUTH_INVALID');
    expect(api_error.message).toBe('E-mail ou mot de passe incorrect.');
    expect(api_error.status).toBe(401);
  });

  test('les details du serveur sont conservés (422 VALIDATION_FAILED)', async () => {
    stubFetch(
      json(
        {
          code: 'VALIDATION_FAILED',
          message: 'Données invalides.',
          details: [{ path: 'email', message: 'Adresse e-mail invalide' }],
        },
        422,
      ),
    );

    const error = (await api
      .post('/users', {})
      .catch((e: unknown) => e)) as ApiRequestError;

    expect(error.code).toBe('VALIDATION_FAILED');
    expect(error.details).toEqual([{ path: 'email', message: 'Adresse e-mail invalide' }]);
  });

  test('un corps non JSON est traduit par le code déduit du statut', async () => {
    stubFetch(new Response('<html>Bad Gateway</html>', { status: 502 }));

    const error = (await apiFetch('/rows').catch((e: unknown) => e)) as ApiRequestError;

    expect(error.code).toBe('INTERNAL');
    expect(error.message).toBe('Une erreur est survenue. Réessayez.');
    expect(error.status).toBe(502);
  });

  test('un 401 sans corps exploitable est traduit en AUTH_REQUIRED', async () => {
    stubFetch(new Response('', { status: 401 }));

    const error = (await apiFetch('/auth/me').catch((e: unknown) => e)) as ApiRequestError;

    expect(error.code).toBe('AUTH_REQUIRED');
  });

  test('une panne réseau devient une ApiRequestError INTERNAL de statut 0', async () => {
    globalThis.fetch = (() => Promise.reject(new Error('ECONNREFUSED'))) as typeof fetch;

    const error = (await apiFetch('/auth/me').catch((e: unknown) => e)) as ApiRequestError;

    expect(error.code).toBe('INTERNAL');
    expect(error.status).toBe(0);
    expect(error.message).toBe('Serveur injoignable. Vérifiez votre connexion.');
  });
  ```

- [ ] **Étape 3: créer la configuration Playwright et lancer le test (FAIL)**

  Créer `apps/web/playwright.config.ts` — **c'est le seul fichier de configuration
  Playwright du dépôt ; aucune feature ultérieure ne le recrée ni ne le modifie** :

  ```ts
  import { defineConfig, devices } from '@playwright/test';

  /**
   * Harnais e2e du front. Les deux serveurs de dev sont démarrés par Playwright
   * (réutilisés s'ils tournent déjà). `cwd: '../..'` : les commandes pnpm sont
   * lancées depuis la racine du monorepo. La base doit être migrée ;
   * `globalSetup` rejoue le seed idempotent pour garantir l'utilisateur initial.
   */
  const WEB_URL = process.env.E2E_WEB_URL ?? 'http://localhost:3000';
  const API_URL = process.env.E2E_API_URL ?? 'http://localhost:3001';

  export default defineConfig({
    testDir: './e2e',
    globalSetup: './e2e/global-setup.ts',
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
    webServer: [
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
    ],
  });
  ```

  Créer `apps/web/e2e/global-setup.ts` :

  ```ts
  import { execSync } from 'node:child_process';

  /**
   * Le seed de la Feature 1 est idempotent : il garantit la présence de
   * l'utilisateur initial (quentin.durant49@orange.fr / changeme) utilisé par
   * les scénarios de connexion, sans rien dupliquer.
   */
  export default function globalSetup(): void {
    execSync('pnpm --filter @suivi/api exec prisma db seed', { stdio: 'inherit', cwd: '../..' });
  }
  ```

  Puis :

  ```bash
  pnpm --filter @suivi/web test:e2e -- api-client
  ```

  Résultat attendu : **FAIL** — `Cannot find module '../apps/web/src/lib/api'` (le client n'existe pas encore).

- [ ] **Étape 4: implémenter le client HTTP**

  Créer `apps/web/src/lib/api.ts` :

  ```ts
  import type { ApiError, ErrorCode } from '@suivi/shared';

  /**
   * Base des appels côté navigateur. En production le front et l'API sont sur
   * la même origine (derrière Apache) : la chaîne vide donne des URL relatives.
   */
  export const apiBaseUrl: string = process.env.NEXT_PUBLIC_API_URL ?? '';

  /**
   * URL complète d'un chemin d'API. Convention figée par `_contracts.md`
   * (§ « Client HTTP web ») : les appelants passent un chemin SANS le préfixe
   * `/api` (`'/auth/login'`, `'/columns'`, `'/rows?month=2026-08'`), et c'est
   * cette fonction qui ajoute le préfixe global de l'API.
   */
  export function apiUrl(path: string): string {
    return `${apiBaseUrl}/api${path}`;
  }

  /**
   * Base des appels côté serveur (Server Components) : `fetch` exige alors une
   * URL absolue, et `apiBaseUrl` est vide en production. Le préfixe `/api`
   * n'est PAS inclus : les appelants écrivent `` `${serverApiBaseUrl()}/api/auth/me` ``.
   * En production, renseigner `API_INTERNAL_URL=http://127.0.0.1:3001`.
   */
  export function serverApiBaseUrl(): string {
    const internal = process.env.API_INTERNAL_URL;
    if (internal) {
      return internal;
    }
    const publicUrl = process.env.NEXT_PUBLIC_API_URL;
    if (publicUrl) {
      return publicUrl;
    }
    return 'http://localhost:3001';
  }

  /** `ErrorCode` du contrat, élargi au code technique 'INTERNAL' (erreur serveur/réseau). */
  export type ApiErrorCode = ErrorCode | 'INTERNAL';

  export class ApiRequestError extends Error {
    readonly code: ApiErrorCode;
    readonly status: number;
    readonly details?: unknown;

    constructor(code: ApiErrorCode, message: string, status: number, details?: unknown) {
      super(message);
      this.name = 'ApiRequestError';
      this.code = code;
      this.status = status;
      this.details = details;
    }
  }

  const STATUS_TO_CODE: Record<number, ApiErrorCode> = {
    400: 'VALIDATION_FAILED',
    401: 'AUTH_REQUIRED',
    404: 'NOT_FOUND',
    409: 'VERSION_CONFLICT',
    422: 'VALIDATION_FAILED',
  };

  function isApiError(value: unknown): value is ApiError {
    if (typeof value !== 'object' || value === null) {
      return false;
    }
    const candidate = value as { code?: unknown; message?: unknown };
    return typeof candidate.code === 'string' && typeof candidate.message === 'string';
  }

  export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    if (init.body !== undefined && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }

    let response: Response;
    try {
      response = await fetch(apiUrl(path), {
        credentials: 'include',
        ...init,
        headers,
      });
    } catch {
      throw new ApiRequestError(
        'INTERNAL',
        'Serveur injoignable. Vérifiez votre connexion.',
        0,
      );
    }

    if (response.status === 204) {
      return undefined as T;
    }

    const text = await response.text();
    let parsed: unknown;
    try {
      parsed = text.length > 0 ? JSON.parse(text) : undefined;
    } catch {
      parsed = undefined;
    }

    if (!response.ok) {
      if (isApiError(parsed)) {
        throw new ApiRequestError(parsed.code, parsed.message, response.status, parsed.details);
      }
      throw new ApiRequestError(
        STATUS_TO_CODE[response.status] ?? 'INTERNAL',
        'Une erreur est survenue. Réessayez.',
        response.status,
      );
    }

    return parsed as T;
  }

  export function apiGet<T>(path: string, init?: RequestInit): Promise<T> {
    return apiFetch<T>(path, { ...init, method: 'GET' });
  }

  export function apiPost<T>(path: string, body?: unknown, init?: RequestInit): Promise<T> {
    return apiFetch<T>(path, {
      ...init,
      method: 'POST',
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  export function apiPatch<T>(path: string, body?: unknown, init?: RequestInit): Promise<T> {
    return apiFetch<T>(path, {
      ...init,
      method: 'PATCH',
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  export function apiDel<T>(path: string, init?: RequestInit): Promise<T> {
    return apiFetch<T>(path, { ...init, method: 'DELETE' });
  }

  export const api = {
    get: apiGet,
    post: apiPost,
    patch: apiPatch,
    del: apiDel,
  } as const;
  ```

- [ ] **Étape 5: relancer le test (PASS)**

  ```bash
  pnpm --filter @suivi/web test:e2e -- api-client
  ```

  Résultat attendu : **PASS** — `8 passed`.

- [ ] **Étape 6: commit**

  ```bash
  git add apps/web/src/lib/api.ts apps/web/playwright.config.ts apps/web/e2e/global-setup.ts apps/web/e2e/api-client.spec.ts apps/web/package.json .gitignore pnpm-lock.yaml
  git commit -m "feat(web): client HTTP typé (ApiError -> ApiRequestError) et harnais Playwright"
  ```

> À vérifier à l'exécution : le runner Playwright transpile `apps/web/src/lib/api.ts` avec esbuild ; l'import `import type { ApiError, ErrorCode } from '@suivi/shared'` est purement typé, donc effacé à la compilation et jamais résolu à l'exécution. Si une version d'esbuild conservait l'import, ajouter `"paths": { "@suivi/shared": ["./packages/shared/src/index.ts"] }` dans un `tsconfig.json` racine lu par Playwright.

---

### Task 2.8: Page `/login` et middleware Next de protection des routes

**Files:**
- Create: `apps/web/src/app/login/page.tsx`, `apps/web/src/middleware.ts`
- Test: `apps/web/e2e/login.spec.ts`

**Interfaces:**
- Consomme : `api.post`, `ApiRequestError` (Task 2.7) ; `POST /api/auth/login` (Task 2.5) ; `UserDTO` de `@suivi/shared`.
- Produit :
  - route `/login` (client component) : champs « Adresse e-mail » / « Mot de passe », bouton « Se connecter », message d'erreur en français dans un conteneur `role="alert"`, redirection vers `/` après succès ;
  - `middleware.ts` : toute requête de page sans cookie `token` est redirigée vers `/login` (exceptions : `/login`, `_next/static`, `_next/image`, `favicon.ico`, fichiers d'images).

- [ ] **Étape 1: écrire le test qui échoue**

  Créer `apps/web/e2e/login.spec.ts` :

  ```ts
  import { expect, test } from '@playwright/test';

  const EMAIL = 'quentin.durant49@orange.fr';
  const MOT_DE_PASSE = 'changeme';

  test('mot de passe incorrect : message en français, on reste sur /login', async ({ page }) => {
    await page.goto('/login');

    await page.getByLabel('Adresse e-mail').fill(EMAIL);
    await page.getByLabel('Mot de passe').fill('mauvais-mot-de-passe');
    await page.getByRole('button', { name: 'Se connecter' }).click();

    await expect(page.getByRole('alert')).toHaveText('E-mail ou mot de passe incorrect.');
    await expect(page).toHaveURL(/\/login$/);
  });

  test('bon mot de passe : redirection vers /', async ({ page }) => {
    await page.goto('/login');

    await page.getByLabel('Adresse e-mail').fill(EMAIL);
    await page.getByLabel('Mot de passe').fill(MOT_DE_PASSE);
    await page.getByRole('button', { name: 'Se connecter' }).click();

    await expect(page).toHaveURL('http://localhost:3000/');
  });

  test('accès direct à / sans cookie : redirection vers /login', async ({ page }) => {
    await page.goto('/');

    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('button', { name: 'Se connecter' })).toBeVisible();
  });
  ```

- [ ] **Étape 2: lancer le test (FAIL)**

  ```bash
  pnpm --filter @suivi/web test:e2e -- login
  ```

  Résultat attendu : **FAIL** — les trois tests échouent : `/login` renvoie la page 404 de Next (`getByLabel('Adresse e-mail')` introuvable, timeout du locator) et `/` ne redirige pas.

- [ ] **Étape 3: implémenter la page de connexion**

  Créer `apps/web/src/app/login/page.tsx` :

  ```tsx
  'use client';

  import { useRouter } from 'next/navigation';
  import { useState, type FormEvent } from 'react';
  import type { UserDTO } from '@suivi/shared';
  import { ApiRequestError, api } from '../../lib/api';

  export default function LoginPage() {
    const router = useRouter();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [pending, setPending] = useState(false);

    async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
      event.preventDefault();
      setError(null);
      setPending(true);
      try {
        await api.post<{ user: UserDTO }>('/auth/login', { email, password });
        router.replace('/');
        router.refresh();
      } catch (caught) {
        setError(
          caught instanceof ApiRequestError
            ? caught.message
            : 'Connexion impossible. Réessayez.',
        );
        setPending(false);
      }
    }

    return (
      <main
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        <form
          onSubmit={handleSubmit}
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '0.75rem',
            width: '20rem',
            padding: '2rem',
            border: '1px solid #d5d8dc',
            borderRadius: '0.5rem',
          }}
        >
          <h1 style={{ margin: 0, fontSize: '1.25rem' }}>Suivi commandes</h1>

          <label htmlFor="email">Adresse e-mail</label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          <label htmlFor="password">Mot de passe</label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          {error !== null && (
            <p role="alert" style={{ color: '#c0392b', margin: 0 }}>
              {error}
            </p>
          )}

          <button type="submit" disabled={pending}>
            {pending ? 'Connexion…' : 'Se connecter'}
          </button>
        </form>
      </main>
    );
  }
  ```

- [ ] **Étape 4: implémenter le middleware**

  Créer `apps/web/src/middleware.ts` :

  ```ts
  import { NextResponse, type NextRequest } from 'next/server';

  /** Nom du cookie posé par POST /api/auth/login (contrat partagé). */
  const AUTH_COOKIE_NAME = 'token';

  export function middleware(request: NextRequest): NextResponse {
    if (request.cookies.get(AUTH_COOKIE_NAME)) {
      return NextResponse.next();
    }
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.search = '';
    return NextResponse.redirect(url);
  }

  export const config = {
    // Tout sauf /login, les assets Next et les fichiers statiques.
    matcher: [
      '/((?!login|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
    ],
  };
  ```

- [ ] **Étape 5: relancer le test (PASS)**

  ```bash
  pnpm --filter @suivi/web test:e2e -- login
  ```

  Résultat attendu : **PASS** — `3 passed`. (Le 2e test atteint `/` : la page d'accueil du socle s'affiche, l'en-tête authentifié arrive en Task 2.9.)

- [ ] **Étape 6: commit**

  ```bash
  git add apps/web/src/app/login/page.tsx apps/web/src/middleware.ts apps/web/e2e/login.spec.ts
  git commit -m "feat(web): page /login (erreurs en francais) et middleware de protection"
  ```

> À vérifier à l'exécution : le cookie posé par l'API sur `localhost:3001` est bien envoyé au front sur `localhost:3000` (les cookies ignorent le port, et `SameSite=Lax` autorise localhost→localhost). Si le navigateur le refuse, vérifier que `APP_URL=http://localhost:3000` est bien lu par `enableCors` (Task 2.1) et que l'appel part avec `credentials: 'include'`.

---

### Task 2.9: Layout authentifié `(app)` + bouton de déconnexion

**Files:**
- Create: `apps/web/src/app/(app)/layout.tsx`, `apps/web/src/components/LogoutButton.tsx`
- Modify: `apps/web/src/app/page.tsx` → déplacé en `apps/web/src/app/(app)/page.tsx`, `apps/web/.env.example`
- Test: `apps/web/e2e/session.spec.ts`

**Interfaces:**
- Consomme : `serverApiBaseUrl()`, `api.post` (Task 2.7) ; `GET /api/auth/me`, `POST /api/auth/logout` (Task 2.5) ; `UserDTO` de `@suivi/shared` ; `cookies()` et `redirect()` de Next 15.
- Produit :
  - `apps/web/src/app/(app)/layout.tsx` (Server Component) : récupère l'utilisateur courant via `GET /api/auth/me` en transmettant le cookie, redirige vers `/login` si la session est invalide, affiche le `displayName` et le bouton de déconnexion ; c'est le layout dans lequel les Features 4, 6 et 7 poseront la grille, les onglets de mois, la recherche et la barre de présence ;
  - `export function LogoutButton(): JSX.Element` (`apps/web/src/components/LogoutButton.tsx`) ;
  - variable d'environnement documentée `API_INTERNAL_URL` (URL serveur→API en production).

- [ ] **Étape 1: écrire le test qui échoue**

  Créer `apps/web/e2e/session.spec.ts` :

  ```ts
  import { expect, test } from '@playwright/test';

  const EMAIL = 'quentin.durant49@orange.fr';
  const MOT_DE_PASSE = 'changeme';

  async function seConnecter(page: import('@playwright/test').Page): Promise<void> {
    await page.goto('/login');
    await page.getByLabel('Adresse e-mail').fill(EMAIL);
    await page.getByLabel('Mot de passe').fill(MOT_DE_PASSE);
    await page.getByRole('button', { name: 'Se connecter' }).click();
    await expect(page).toHaveURL('http://localhost:3000/');
  }

  test("l'en-tête affiche le nom de l'utilisateur connecté", async ({ page }) => {
    await seConnecter(page);

    await expect(page.getByTestId('current-user')).toHaveText('Quentin');
  });

  test('la déconnexion ramène sur /login et interdit le retour sur /', async ({ page }) => {
    await seConnecter(page);

    await page.getByRole('button', { name: 'Se déconnecter' }).click();
    await expect(page).toHaveURL(/\/login$/);

    await page.goto('/');
    await expect(page).toHaveURL(/\/login$/);
  });

  test('un cookie token invalide est rejeté par le layout (retour /login)', async ({
    page,
    context,
  }) => {
    await context.addCookies([
      {
        name: 'token',
        value: 'nimporte.quoi.ici',
        domain: 'localhost',
        path: '/',
      },
    ]);

    await page.goto('/');

    await expect(page).toHaveURL(/\/login$/);
  });
  ```

- [ ] **Étape 2: lancer le test (FAIL)**

  ```bash
  pnpm --filter @suivi/web test:e2e -- session
  ```

  Résultat attendu : **FAIL** — `getByTestId('current-user')` introuvable (timeout) et le 3e test échoue : le middleware laisse passer un cookie présent mais invalide, et rien ne le vérifie côté page.

- [ ] **Étape 3: déplacer la page d'accueil dans le groupe de routes `(app)`**

  ```bash
  mkdir -p "apps/web/src/app/(app)"
  git mv apps/web/src/app/page.tsx "apps/web/src/app/(app)/page.tsx"
  ```

  Puis remplacer le contenu de `apps/web/src/app/(app)/page.tsx` par (la constante `SHARED_READY` du socle a été retirée de `@suivi/shared` en Feature 1 ; la grille AG Grid la remplacera en Feature 4) :

  ```tsx
  export default function HomePage() {
    return <p>Grille du mois courant (Feature 4).</p>;
  }
  ```

  Le groupe `(app)` ne change pas l'URL : la page reste servie sur `/`, mais hérite désormais du layout authentifié.

- [ ] **Étape 4: implémenter le bouton de déconnexion**

  Créer `apps/web/src/components/LogoutButton.tsx` :

  ```tsx
  'use client';

  import { useRouter } from 'next/navigation';
  import { useState } from 'react';
  import { api } from '../lib/api';

  export function LogoutButton() {
    const router = useRouter();
    const [pending, setPending] = useState(false);

    async function handleClick(): Promise<void> {
      setPending(true);
      try {
        await api.post<void>('/auth/logout');
      } finally {
        router.replace('/login');
        router.refresh();
      }
    }

    return (
      <button type="button" onClick={handleClick} disabled={pending}>
        Se déconnecter
      </button>
    );
  }
  ```

- [ ] **Étape 5: implémenter le layout authentifié**

  Créer `apps/web/src/app/(app)/layout.tsx` :

  ```tsx
  import { cookies } from 'next/headers';
  import { redirect } from 'next/navigation';
  import type { ReactNode } from 'react';
  import type { UserDTO } from '@suivi/shared';
  import { LogoutButton } from '../../components/LogoutButton';
  import { serverApiBaseUrl } from '../../lib/api';

  /**
   * Vérifie la session côté serveur : le middleware ne contrôle que la
   * PRÉSENCE du cookie, jamais sa validité (il ne peut pas vérifier la
   * signature JWT). C'est ce fetch qui tranche.
   */
  async function fetchCurrentUser(): Promise<UserDTO | null> {
    const cookieStore = await cookies();
    const token = cookieStore.get('token');
    if (!token) {
      return null;
    }
    const response = await fetch(`${serverApiBaseUrl()}/api/auth/me`, {
      headers: { cookie: `token=${token.value}` },
      cache: 'no-store',
    });
    if (!response.ok) {
      return null;
    }
    const body = (await response.json()) as { user: UserDTO };
    return body.user;
  }

  export default async function AppLayout({ children }: { children: ReactNode }) {
    const user = await fetchCurrentUser();
    if (!user) {
      redirect('/login');
    }

    return (
      <div style={{ fontFamily: 'system-ui, sans-serif' }}>
        <header
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '1rem',
            padding: '0.75rem 1rem',
            borderBottom: '1px solid #d5d8dc',
          }}
        >
          <strong style={{ marginRight: 'auto' }}>Suivi commandes</strong>
          <span
            data-testid="current-user"
            style={{ color: user.cursorColor, fontWeight: 600 }}
          >
            {user.displayName}
          </span>
          <LogoutButton />
        </header>
        <main style={{ padding: '1rem' }}>{children}</main>
      </div>
    );
  }
  ```

- [ ] **Étape 6: documenter la variable d'environnement serveur**

  Remplacer `apps/web/.env.example` par :

  ```
  # Copier en apps/web/.env.local
  # Appels depuis le navigateur. En production : laisser vide (meme origine).
  NEXT_PUBLIC_API_URL=http://localhost:3001

  # Appels depuis les Server Components (URL absolue obligatoire).
  # En production : http://127.0.0.1:3001
  API_INTERNAL_URL=http://localhost:3001
  ```

- [ ] **Étape 7: relancer le test (PASS)**

  ```bash
  pnpm --filter @suivi/web test:e2e -- session
  ```

  Résultat attendu : **PASS** — `3 passed`.

- [ ] **Étape 8: vérifier que le build web passe toujours**

  ```bash
  pnpm --filter @suivi/web build
  ```

  Résultat attendu : `Compiled successfully`, routes `/` et `/login` listées, code de sortie 0.

- [ ] **Étape 9: commit**

  ```bash
  git add "apps/web/src/app/(app)" apps/web/src/components/LogoutButton.tsx apps/web/.env.example apps/web/e2e/session.spec.ts
  git commit -m "feat(web): layout authentifie (app) avec /auth/me et bouton de deconnexion"
  ```

> À vérifier à l'exécution : dans Next 15, `cookies()` est asynchrone (`await cookies()`). Si le build signale un usage synchrone attendu, retirer le `await` — le reste du fichier est inchangé.

---

### Task 2.10: Vérification complète du périmètre et fin de feature (merge dans `develop`)

**Files:** aucun fichier nouveau — exécution de toutes les suites, puis merge gitflow.

**Interfaces:**
- Consomme : l'intégralité des tests des Tasks 2.1 à 2.9.
- Produit : branche `develop` contenant la Feature 2 complète, poussée sur GitHub. Les features suivantes disposent de `ApiException`, `ApiExceptionFilter`, `parseOrThrow`, `JwtAuthGuard` (globale), `@Public()`, `@CurrentUser()`, `AuthService`, `UsersService`, `toUserDTO`, du client web `lib/api.ts` et du harnais Playwright.

- [ ] **Étape 1: lancer TOUS les tests unitaires de l'API**

  ```bash
  pnpm --filter @suivi/api test:unit
  ```

  Résultat attendu : **PASS** — suites `api-exception.filter.spec` (6), `api-error.spec` (4), `auth.service.spec` (6), `jwt.guard.spec` (10) + les suites de la Feature 1 (`prisma.service.spec`). Aucun test rouge.

- [ ] **Étape 2: lancer TOUS les tests e2e de l'API**

  ```bash
  pnpm --filter @suivi/api test:e2e
  ```

  Résultat attendu : **PASS** — `health.e2e-spec` (3), `auth.e2e-spec` (12), `users.e2e-spec` (10) et `seed.e2e-spec` de la Feature 1.

- [ ] **Étape 3: lancer les tests du package partagé et le lint**

  ```bash
  pnpm --filter @suivi/shared test
  pnpm lint
  ```

  Résultat attendu : `tsc --noEmit` en code 0 et ESLint en code 0.

- [ ] **Étape 4: lancer les builds**

  ```bash
  pnpm build
  ```

  Résultat attendu : `@suivi/api` produit `dist/main.js`, `@suivi/web` affiche `Compiled successfully`.

- [ ] **Étape 5: lancer TOUTE la suite Playwright**

  ```bash
  pnpm --filter @suivi/web test:e2e
  ```

  Résultat attendu : **PASS** — `14 passed` (8 `api-client`, 3 `login`, 3 `session`).

- [ ] **Étape 6: vérifier qu'il ne reste rien à commiter**

  ```bash
  git status --short
  ```

  Résultat attendu : sortie vide (les `.env` locaux sont ignorés par git).

- [ ] **Étape 7: merge gitflow et push**

  ```bash
  git checkout develop && git merge --no-ff feature/auth -m "merge: feature/auth"
  git push origin develop
  ```

  Résultat attendu : merge commit créé sur `develop`, push accepté. La Feature 3 démarrera par `git checkout develop && git pull && git checkout -b feature/<nom>` sur un `develop` disposant d'une API authentifiée et d'un front connecté.

---

## Récapitulatif de ce que les features suivantes peuvent utiliser

| Élément | Où | Signature / valeur |
|---|---|---|
| Exception métier | `apps/api/src/common/api.exception.ts` | `new ApiException(code: ErrorCode, message: string, status: HttpStatus, details?: unknown)` ; `authInvalid()`, `authRequired(message?)`, `validationFailed(message, details?)`, `notFound(message?)` |
| Filtre global | `apps/api/src/common/api-exception.filter.ts` | `class ApiExceptionFilter` (déjà branché dans `setupApp`) ; `interface ApiErrorBody { code: ErrorCode \| 'INTERNAL'; message: string; details?: unknown }` |
| Validation (mécanisme unique) | `apps/api/src/common/api-error.ts` | `parseOrThrow(schema, input)` → 422 `VALIDATION_FAILED` + `details: {path, message}[]` |
| Setup HTTP | `apps/api/src/app.setup.ts` | `setupApp(app)` = préfixe `api` + cookie-parser + CORS crédentialisé + filtre global |
| Garde globale | `apps/api/src/auth/jwt.guard.ts` | `class JwtAuthGuard` (APP_GUARD) ; `interface AuthUser { id: string; email: string }` ; `interface AuthenticatedRequest` |
| Route publique | `apps/api/src/auth/public.decorator.ts` | `Public()` / `IS_PUBLIC_KEY` |
| Utilisateur courant | `apps/api/src/auth/current-user.decorator.ts` | `@CurrentUser() user: AuthUser` ; `currentUserFactory(data, ctx)` |
| Cookie | `apps/api/src/auth/cookie.ts` | `AUTH_COOKIE_NAME = 'token'`, `AUTH_COOKIE_MAX_AGE_MS`, `authCookieOptions()`, `authCookieClearOptions()` |
| Secret JWT | `apps/api/src/auth/jwt-secret.ts` | `jwtSecret(): string` (JwtModule est global, `JwtService` injectable partout) |
| Service auth | `apps/api/src/auth/auth.service.ts` | `validateCredentials(email, password)`, `getUser(id)`, `signToken(user)` (payload `{ sub, email }`) |
| Mapper | `apps/api/src/users/user.mapper.ts` | `toUserDTO(user: User): UserDTO`, `normalizeEmail(email: string): string` |
| Service membres | `apps/api/src/users/users.service.ts` | `list()`, `create(input)`, `updateMe(id, input)` ; `UsersModule` exporte `UsersService` |
| Client HTTP web | `apps/web/src/lib/api.ts` | `api.get/post/patch/del`, `apiFetch<T>`, `ApiRequestError { code, status, details }`, `apiBaseUrl`, `serverApiBaseUrl()` |
| Protection front | `apps/web/src/middleware.ts` + `apps/web/src/app/(app)/layout.tsx` | cookie absent → `/login` ; session invalide → `/login` ; en-tête `data-testid="current-user"` |
| Harnais e2e front (unique) | `apps/web/playwright.config.ts`, `apps/web/e2e/` | `pnpm --filter @suivi/web test:e2e` (webServer api + web, `baseURL = E2E_WEB_URL ?? http://localhost:3000`, seed idempotent en `globalSetup`) |
