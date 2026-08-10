# Section 08 — Paramètres (interface)

## Feature 8 — Paramètres (branche `feature/settings-ui`)

**But:** livrer la page `/parametres` à trois onglets (Colonnes · Listes & couleurs · Équipe) qui pilote entièrement la configuration du tableau via l'API existante, avec ses cas d'erreur (`COLUMN_HAS_DATA`, `CHOICE_IN_USE`, `VALIDATION_FAILED`, `NOT_FOUND`, `AUTH_REQUIRED`) traités en français.

**Dépend de:**

- **Feature 0 — Socle monorepo** : workspace pnpm, `tsconfig.base.json` (strict), `apps/web` Next.js 15 avec `transpilePackages: ['@suivi/shared']`, scripts racine `pnpm lint` / `pnpm test`.
- **Feature 1 — Schéma & seed** : types `@suivi/shared` (`ColumnDTO`, `ChoiceDTO`, `UserDTO`, `ColumnType`, `ErrorCode`) et base seedée (16 colonnes dont `statut` libellée `INSTALLATION`, 83 choix, utilisateur `quentin.durant49@orange.fr` / `changeme`).
- **Feature 2 — Auth** : page `/login`, cookie JWT httpOnly `token`, `GET /api/auth/me`.
- **Feature 3 — Colonnes & listes (CRUD)** : toutes les routes consommées ici (`/columns`, `/columns/:id/choices`, `/choices/:id`).
- **Feature 4 — Lignes** : `POST /api/rows`, `PATCH /api/rows/:id`, `DELETE /api/rows/:id` (utilisées uniquement par le test Playwright pour fabriquer et nettoyer son jeu de données).
- **Feature 6 — Grille & client HTTP** : layout `apps/web/src/app/(app)/layout.tsx` (qui porte la navigation vers `/parametres`), rendu des cellules de type liste dans AG Grid, et surtout le client HTTP `apps/web/src/lib/api.ts`.
- **Feature 7 — Temps réel côté web** : abonnement à `config.changed` `{ scope: 'columns' | 'choices' | 'users' }` qui recharge la config des grilles ouvertes. **Cette feature-ci n'émet rien elle-même** : elle appelle l'API, et c'est la Feature 5 (Task 5.6, `RealtimeEmitter.emitConfigChanged` branché dans `ColumnsService` / `ChoicesService` / `UsersService`) qui émet `config.changed`. Aucun code socket n'est écrit ici.

### Contrat consommé de `apps/web/src/lib/api.ts` (Feature 6)

Toutes les tâches ci-dessous s'appuient exactement sur ces deux exports :

```ts
export class ApiRequestError extends Error {
  readonly status: number;   // code HTTP
  readonly code: ErrorCode;  // champ `code` du corps JSON { code, message }
  readonly details?: unknown;
}

export function apiFetch<T>(chemin: string, init?: RequestInit): Promise<T>;
```

- `chemin` est relatif au préfixe global `/api` (donc `apiFetch('/columns')` → `GET <NEXT_PUBLIC_API_URL>/api/columns`) ;
- `apiFetch` pose `credentials: 'include'` et `Content-Type: application/json` quand `init.body` est une chaîne ;
- une réponse `204` résout `undefined` ;
- une réponse non-2xx rejette une `ApiRequestError`.

Les noms et signatures ci-dessus sont figés par `_contracts.md` § « Client HTTP web (apps/web/src/lib/api.ts) » : ils ne sont ni à vérifier ni à adapter. Les composants de cette feature ne dépendent toutefois **jamais** de la classe `ApiRequestError` elle-même : ils passent par le garde de type structurel `estErreurApi` (Task 8.1), qui ne teste que la présence de `status` / `code` / `message`.

### Décision de périmètre : le **type** d'une colonne est toujours modifiable

Les contrats définissent `PATCH /columns/:id` avec le corps `{label?, type?, position?, width?, visible?}` — **`type` en fait partie**. L'interface affiche donc le type dans un `<select>` **actif** : au changement, elle émet `PATCH /columns/:id { type }` puis rafraîchit la colonne dans le store. Le changement de type **ne convertit jamais les valeurs déjà saisies** (elles sont conservées telles quelles et réinterprétées par le nouveau type) ; pour prévenir l'utilisateur, un toast d'avertissement français « Les valeurs existantes ne sont pas converties » est affiché après un changement réussi. Aucune requête « compter les lignes » n'est faite côté client.

### Fichiers de la feature

| Fichier | Rôle |
|---|---|
| `apps/web/src/app/(app)/parametres/page.tsx` | Page + barre d'onglets (contrats §Arborescence) |
| `apps/web/src/app/(app)/parametres/colonnes.tsx` | Onglet Colonnes |
| `apps/web/src/app/(app)/parametres/listes.tsx` | Onglet Listes & couleurs |
| `apps/web/src/app/(app)/parametres/equipe.tsx` | Onglet Équipe |
| `apps/web/src/app/(app)/parametres/messages.ts` | Traduction française des `ErrorCode` (fichier additionnel co-localisé — il ne remplace aucun fichier nommé dans les contrats) |
| `apps/web/src/app/(app)/parametres/__tests__/*.test.tsx` | Tests unitaires Vitest + Testing Library |
| `apps/web/e2e/parametres.spec.ts` | Test Playwright de bout en bout |

---

### Task 8.1: Branche de feature, harnais de test web (Vitest + Testing Library) et messages d'erreur français

**Files:**
- Create: `apps/web/src/app/(app)/parametres/messages.ts`
- Modify: `apps/web/vitest.config.ts` (élargir `include`), `apps/web/vitest.setup.ts` (ajouter l'import `jest-dom`), `apps/web/package.json` (dépendance `@testing-library/jest-dom`)
- Aucune modification de `apps/web/playwright.config.ts` (créé par la Feature 2, Task 2.7) ni des scripts `test` / `test:watch` / `test:e2e` (déjà posés par les Features 2 et 6)
- Test: `apps/web/src/app/(app)/parametres/__tests__/messages.test.ts`

**Interfaces:**
- Consomme : `ErrorCode` de `@suivi/shared` (Feature 1) ; `tsconfig.base.json` (Feature 0) ; le harnais Vitest de la Feature 6 (Task 6.1) et le harnais Playwright de la Feature 2 (Task 2.7).
- Produit :
  - `export interface ErreurApi { status: number; code: ErrorCode; message: string; details?: unknown }` ;
  - `export function estErreurApi(err: unknown): err is ErreurApi` ;
  - `export function aCodeErreur(err: unknown, code: ErrorCode): boolean` ;
  - `export function messageErreurApi(err: unknown): string` (message utilisateur en français, un par `ErrorCode`).

- [ ] **Étape 1: créer la branche de feature**

  ```bash
  git checkout develop && git pull && git checkout -b feature/settings-ui
  ```

  Résultat attendu : `Switched to a new branch 'feature/settings-ui'`.

- [ ] **Étape 2: compléter le harnais de test web existant**

  Vitest (config + setup + scripts `test` / `test:watch`) vient de la **Feature 6,
  Task 6.1** ; Playwright (`apps/web/playwright.config.ts`, `e2e/global-setup.ts`,
  script `test:e2e`) vient de la **Feature 2, Task 2.7**. **Ne rien recréer.**
  Les specs de cette feature sont nommées `*.test.ts(x)` : la seule adaptation
  nécessaire est d'élargir le `include` de Vitest.

  Seule dépendance à ajouter :

  ```bash
  pnpm --filter @suivi/web add -D @testing-library/jest-dom@^6.6.3
  ```

  Modifier `apps/web/vitest.config.ts` — **une seule ligne change** (`include`), tout
  le reste (le plugin React et surtout l'alias `@suivi/shared`) est conservé tel quel.
  Contenu final :

  ```ts
  import { fileURLToPath } from 'node:url';
  import react from '@vitejs/plugin-react';
  import { defineConfig } from 'vitest/config';

  export default defineConfig({
    plugins: [react()],
    resolve: {
      alias: {
        // Le package est publié en source TypeScript : on pointe le fichier
        // directement pour que Vite le transpile comme du code local.
        '@suivi/shared': fileURLToPath(
          new URL('../../packages/shared/src/index.ts', import.meta.url),
        ),
      },
    },
    test: {
      environment: 'jsdom',
      setupFiles: ['./vitest.setup.ts'],
      include: [
        'src/**/*.spec.ts',
        'src/**/*.spec.tsx',
        'src/**/*.test.ts',
        'src/**/*.test.tsx',
      ],
      restoreMocks: true,
    },
  });
  ```

  Modifier `apps/web/vitest.setup.ts` — **ajouter la première ligne** au fichier
  existant, sans rien retirer. Contenu final :

  ```ts
  import '@testing-library/jest-dom/vitest';
  import { afterEach } from 'vitest';
  import { cleanup } from '@testing-library/react';

  afterEach(() => {
    cleanup();
  });
  ```

  Les scripts `"test": "vitest run"`, `"test:watch": "vitest"` et
  `"test:e2e": "playwright test"` sont déjà dans `apps/web/package.json` : ne pas y toucher.

- [ ] **Étape 3: écrire le test qui échoue — `apps/web/src/app/(app)/parametres/__tests__/messages.test.ts`**

  ```ts
  import { describe, expect, it } from 'vitest';

  import { aCodeErreur, estErreurApi, messageErreurApi } from '../messages';

  const erreur = (code: string, status = 409): unknown => ({
    status,
    code,
    message: 'message brut du serveur',
  });

  describe('messages — traduction française des ErrorCode', () => {
    it('reconnaît la forme structurelle d’une erreur API', () => {
      expect(estErreurApi(erreur('NOT_FOUND', 404))).toBe(true);
      expect(estErreurApi(new Error('réseau'))).toBe(false);
      expect(estErreurApi(null)).toBe(false);
      expect(estErreurApi('boum')).toBe(false);
    });

    it('aCodeErreur ne répond vrai que pour le code exact', () => {
      expect(aCodeErreur(erreur('COLUMN_HAS_DATA'), 'COLUMN_HAS_DATA')).toBe(true);
      expect(aCodeErreur(erreur('COLUMN_HAS_DATA'), 'CHOICE_IN_USE')).toBe(false);
      expect(aCodeErreur(new Error('réseau'), 'CHOICE_IN_USE')).toBe(false);
    });

    it('COLUMN_HAS_DATA parle de données existantes', () => {
      expect(messageErreurApi(erreur('COLUMN_HAS_DATA'))).toContain('données');
    });

    it('CHOICE_IN_USE conseille l’archivage', () => {
      const message = messageErreurApi(erreur('CHOICE_IN_USE'));
      expect(message).toContain('archiv');
      expect(message).toContain('utilisée');
    });

    it('AUTH_REQUIRED invite à se reconnecter', () => {
      expect(messageErreurApi(erreur('AUTH_REQUIRED', 401))).toContain('reconnecter');
    });

    it('VALIDATION_FAILED parle de champs invalides', () => {
      expect(messageErreurApi(erreur('VALIDATION_FAILED', 422))).toContain('invalides');
    });

    it('retombe sur un message générique pour une erreur non API', () => {
      expect(messageErreurApi(new Error('offline'))).toContain('Une erreur est survenue');
    });

    it('retombe sur le message du serveur pour un code inconnu', () => {
      expect(messageErreurApi({ status: 500, code: 'CODE_INCONNU', message: 'panne' })).toBe('panne');
    });
  });
  ```

- [ ] **Étape 4: lancer le test (échec attendu)**

  ```bash
  pnpm --filter @suivi/web test -- messages.test.ts
  ```

  Résultat attendu : **FAIL** — `Failed to resolve import "../messages"` (le fichier n'existe pas encore).

- [ ] **Étape 5: implémenter — `apps/web/src/app/(app)/parametres/messages.ts`**

  ```ts
  import type { ErrorCode } from '@suivi/shared';

  /**
   * Forme structurelle d'une erreur remontée par `apiFetch` (lib/api.ts, Feature 6).
   * On ne dépend pas de la classe elle-même : un objet { status, code, message }
   * suffit, ce qui rend les tests indépendants de l'implémentation du client HTTP.
   */
  export interface ErreurApi {
    status: number;
    code: ErrorCode;
    message: string;
    details?: unknown;
  }

  export function estErreurApi(err: unknown): err is ErreurApi {
    if (typeof err !== 'object' || err === null) {
      return false;
    }
    const candidat = err as Record<string, unknown>;
    return (
      typeof candidat.status === 'number' &&
      typeof candidat.code === 'string' &&
      typeof candidat.message === 'string'
    );
  }

  export function aCodeErreur(err: unknown, code: ErrorCode): boolean {
    return estErreurApi(err) && err.code === code;
  }

  const MESSAGES: Record<ErrorCode, string> = {
    AUTH_INVALID: 'Email ou mot de passe incorrect.',
    AUTH_REQUIRED: 'Votre session a expiré : veuillez vous reconnecter.',
    VALIDATION_FAILED: 'Données invalides : vérifiez les champs saisis.',
    NOT_FOUND: 'Élément introuvable : il vient peut-être d’être supprimé par un collègue.',
    VERSION_CONFLICT: 'Modifié par un collègue entre-temps : la valeur affichée a été rechargée.',
    COLUMN_HAS_DATA: 'Cette colonne contient déjà des données.',
    CHOICE_IN_USE:
      'Cette valeur est utilisée par des lignes existantes. Conseil : archivez-la plutôt que de la supprimer — les lignes la conservent et elle n’est plus proposée à la saisie.',
    LOCKED: 'Cette cellule est en cours d’édition par un collègue.',
  };

  export function messageErreurApi(err: unknown): string {
    if (!estErreurApi(err)) {
      return 'Une erreur est survenue. Vérifiez votre connexion puis réessayez.';
    }
    const traduction: string | undefined = MESSAGES[err.code];
    return traduction ?? err.message;
  }
  ```

- [ ] **Étape 6: relancer le test (PASS)**

  ```bash
  pnpm --filter @suivi/web test -- messages.test.ts
  ```

  Résultat attendu : **PASS** — 8 tests verts.

- [ ] **Étape 7: commit**

  ```bash
  git add apps/web/vitest.config.ts apps/web/vitest.setup.ts apps/web/package.json "apps/web/src/app/(app)/parametres/messages.ts" "apps/web/src/app/(app)/parametres/__tests__/messages.test.ts" pnpm-lock.yaml
  git commit -m "test: collecte des specs *.test.ts(x) + messages d'erreur francais des parametres"
  ```

> À vérifier à l'exécution : la version majeure de Vitest installée (`^3.0.0`) et sa compatibilité avec `@vitejs/plugin-react` ; si `@testing-library/jest-dom/vitest` n'est pas résolu, utiliser `import '@testing-library/jest-dom'` dans `vitest.setup.ts` (même effet avec `globals: true`).

---

### Task 8.2: Page `/parametres` et barre d'onglets

**Files:**
- Create: `apps/web/src/app/(app)/parametres/page.tsx`, `apps/web/src/app/(app)/parametres/colonnes.tsx`, `apps/web/src/app/(app)/parametres/listes.tsx`, `apps/web/src/app/(app)/parametres/equipe.tsx`
- Test: `apps/web/src/app/(app)/parametres/__tests__/page.test.tsx`

**Interfaces:**
- Consomme : rien d'externe (les trois onglets sont créés ici sous forme minimale et remplis par les tâches 8.3 à 8.10).
- Produit :
  - `export type OngletParametres = 'colonnes' | 'listes' | 'equipe'` ;
  - `export default function ParametresPage(): JSX.Element` (composant client, `role="tablist"` + `role="tabpanel"`) ;
  - `export default function ColonnesTab()`, `ListesTab()`, `EquipeTab()` (versions minimales).

- [ ] **Étape 1: écrire le test qui échoue — `apps/web/src/app/(app)/parametres/__tests__/page.test.tsx`**

  ```tsx
  import { render, screen } from '@testing-library/react';
  import userEvent from '@testing-library/user-event';
  import { describe, expect, it, vi } from 'vitest';

  vi.mock('../colonnes', () => ({ default: () => <div>PANNEAU COLONNES</div> }));
  vi.mock('../listes', () => ({ default: () => <div>PANNEAU LISTES</div> }));
  vi.mock('../equipe', () => ({ default: () => <div>PANNEAU EQUIPE</div> }));

  import ParametresPage from '../page';

  describe('ParametresPage — onglets', () => {
    it('affiche les trois onglets et ouvre « Colonnes » par défaut', () => {
      render(<ParametresPage />);

      expect(screen.getByRole('heading', { name: 'Paramètres' })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: 'Colonnes' })).toHaveAttribute('aria-selected', 'true');
      expect(screen.getByRole('tab', { name: 'Listes & couleurs' })).toHaveAttribute('aria-selected', 'false');
      expect(screen.getByRole('tab', { name: 'Équipe' })).toHaveAttribute('aria-selected', 'false');
      expect(screen.getByText('PANNEAU COLONNES')).toBeInTheDocument();
    });

    it('bascule sur « Listes & couleurs » puis « Équipe »', async () => {
      const utilisateur = userEvent.setup();
      render(<ParametresPage />);

      await utilisateur.click(screen.getByRole('tab', { name: 'Listes & couleurs' }));
      expect(screen.getByText('PANNEAU LISTES')).toBeInTheDocument();
      expect(screen.queryByText('PANNEAU COLONNES')).not.toBeInTheDocument();

      await utilisateur.click(screen.getByRole('tab', { name: 'Équipe' }));
      expect(screen.getByText('PANNEAU EQUIPE')).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: 'Équipe' })).toHaveAttribute('aria-selected', 'true');
    });
  });
  ```

- [ ] **Étape 2: lancer le test (échec attendu)**

  ```bash
  pnpm --filter @suivi/web test -- page.test.tsx
  ```

  Résultat attendu : **FAIL** — `Failed to resolve import "../page"`.

- [ ] **Étape 3: implémenter la page — `apps/web/src/app/(app)/parametres/page.tsx`**

  ```tsx
  'use client';

  import { useState } from 'react';

  import ColonnesTab from './colonnes';
  import EquipeTab from './equipe';
  import ListesTab from './listes';

  export type OngletParametres = 'colonnes' | 'listes' | 'equipe';

  const ONGLETS: { id: OngletParametres; libelle: string }[] = [
    { id: 'colonnes', libelle: 'Colonnes' },
    { id: 'listes', libelle: 'Listes & couleurs' },
    { id: 'equipe', libelle: 'Équipe' },
  ];

  export default function ParametresPage() {
    const [onglet, setOnglet] = useState<OngletParametres>('colonnes');

    return (
      <main>
        <h1>Paramètres</h1>

        <div role="tablist" aria-label="Sections des paramètres">
          {ONGLETS.map((element) => (
            <button
              key={element.id}
              type="button"
              role="tab"
              id={`onglet-${element.id}`}
              aria-controls={`panneau-${element.id}`}
              aria-selected={onglet === element.id}
              onClick={() => setOnglet(element.id)}
            >
              {element.libelle}
            </button>
          ))}
        </div>

        <div role="tabpanel" id={`panneau-${onglet}`} aria-labelledby={`onglet-${onglet}`}>
          {onglet === 'colonnes' && <ColonnesTab />}
          {onglet === 'listes' && <ListesTab />}
          {onglet === 'equipe' && <EquipeTab />}
        </div>
      </main>
    );
  }
  ```

- [ ] **Étape 4: créer les trois onglets en version minimale**

  `apps/web/src/app/(app)/parametres/colonnes.tsx` :

  ```tsx
  'use client';

  export default function ColonnesTab() {
    return <section aria-label="Colonnes" />;
  }
  ```

  `apps/web/src/app/(app)/parametres/listes.tsx` :

  ```tsx
  'use client';

  export default function ListesTab() {
    return <section aria-label="Listes et couleurs" />;
  }
  ```

  `apps/web/src/app/(app)/parametres/equipe.tsx` :

  ```tsx
  'use client';

  export default function EquipeTab() {
    return <section aria-label="Équipe" />;
  }
  ```

- [ ] **Étape 5: relancer le test (PASS)**

  ```bash
  pnpm --filter @suivi/web test -- page.test.tsx
  ```

  Résultat attendu : **PASS** — 2 tests verts.

- [ ] **Étape 6: commit**

  ```bash
  git add "apps/web/src/app/(app)/parametres"
  git commit -m "feat: page parametres avec onglets colonnes/listes/equipe"
  ```

---

### Task 8.3: Onglet Colonnes — chargement, tableau, ajout de colonne, erreur `AUTH_REQUIRED`

**Files:**
- Modify: `apps/web/src/app/(app)/parametres/colonnes.tsx`
- Test: `apps/web/src/app/(app)/parametres/__tests__/colonnes.test.tsx`

**Interfaces:**
- Consomme : `apiFetch<T>(chemin, init?)` de `../../../lib/api` ; `messageErreurApi(err)` de `./messages` ; `ColumnDTO`, `ColumnType` de `@suivi/shared` ; routes `GET /api/columns`, `POST /api/columns {label, type}` et `PATCH /api/columns/:id {type}` (changement de type, sans conversion des valeurs).
- Produit :
  - `export const TYPES_COLONNE: { valeur: ColumnType; libelle: string }[]` (7 entrées, libellés français) ;
  - `export function trierParPosition<T extends { position: number }>(items: readonly T[]): T[]` (réutilisé par `listes.tsx`) ;
  - `ColonnesTab` affichant une ligne `data-testid="colonne-<key>"` par colonne.

- [ ] **Étape 1: écrire le test qui échoue — `apps/web/src/app/(app)/parametres/__tests__/colonnes.test.tsx`**

  ```tsx
  import { render, screen, waitFor } from '@testing-library/react';
  import userEvent from '@testing-library/user-event';
  import type { ColumnDTO } from '@suivi/shared';
  import { beforeEach, describe, expect, it, vi } from 'vitest';

  vi.mock('../../../../lib/api', () => ({ apiFetch: vi.fn() }));

  import { apiFetch } from '../../../../lib/api';
  import ColonnesTab, { trierParPosition } from '../colonnes';

  const apiFetchMock = vi.mocked(apiFetch);

  function colonne(partiel: Partial<ColumnDTO> & { id: string; key: string; label: string }): ColumnDTO {
    return {
      type: 'TEXT',
      position: 0,
      width: 150,
      visible: true,
      choices: [],
      ...partiel,
    };
  }

  const CLIENT = colonne({ id: 'c1', key: 'client', label: 'CLIENT', position: 1, width: 220 });
  const STATUT = colonne({ id: 'c2', key: 'statut', label: 'INSTALLATION', position: 0, type: 'SELECT', width: 150 });

  beforeEach(() => {
    apiFetchMock.mockReset();
  });

  describe('ColonnesTab — lecture et ajout', () => {
    it('trierParPosition ordonne sans muter la source', () => {
      const source = [CLIENT, STATUT];
      expect(trierParPosition(source).map((c) => c.key)).toEqual(['statut', 'client']);
      expect(source.map((c) => c.key)).toEqual(['client', 'statut']);
    });

    it('charge GET /columns et affiche les colonnes triées par position', async () => {
      apiFetchMock.mockResolvedValueOnce([CLIENT, STATUT]);

      render(<ColonnesTab />);

      await waitFor(() => expect(screen.getByText('CLIENT')).toBeInTheDocument());
      expect(apiFetchMock).toHaveBeenCalledWith('/columns');

      const lignes = screen.getAllByRole('row').slice(1);
      expect(lignes[0]).toHaveAttribute('data-testid', 'colonne-statut');
      expect(lignes[1]).toHaveAttribute('data-testid', 'colonne-client');
    });

    it('rend le select de type actif ; le changer envoie PATCH /columns/:id {type} et avertit', async () => {
      const utilisateur = userEvent.setup();
      apiFetchMock
        .mockResolvedValueOnce([STATUT])
        .mockResolvedValueOnce({ ...STATUT, type: 'NUMBER' });

      render(<ColonnesTab />);

      const select = await screen.findByLabelText('Type de la colonne INSTALLATION');
      expect(select).not.toBeDisabled();
      expect(select).toHaveValue('SELECT');

      await utilisateur.selectOptions(select, 'NUMBER');

      await waitFor(() =>
        expect(apiFetchMock).toHaveBeenLastCalledWith('/columns/c2', {
          method: 'PATCH',
          body: JSON.stringify({ type: 'NUMBER' }),
        }),
      );
      expect(await screen.findByRole('status')).toHaveTextContent(
        'Les valeurs existantes ne sont pas converties',
      );
      expect(select).toHaveValue('NUMBER');
    });

    it('ajoute une colonne via POST /columns et l’affiche', async () => {
      const utilisateur = userEvent.setup();
      const creee = colonne({ id: 'c3', key: 'suivi_sav', label: 'SUIVI SAV', position: 2, type: 'LONGTEXT' });
      apiFetchMock.mockResolvedValueOnce([STATUT, CLIENT]).mockResolvedValueOnce(creee);

      render(<ColonnesTab />);
      await screen.findByText('CLIENT');

      await utilisateur.type(screen.getByLabelText('Libellé'), 'SUIVI SAV');
      await utilisateur.selectOptions(screen.getByLabelText('Type'), 'LONGTEXT');
      await utilisateur.click(screen.getByRole('button', { name: 'Ajouter la colonne' }));

      await waitFor(() =>
        expect(apiFetchMock).toHaveBeenLastCalledWith('/columns', {
          method: 'POST',
          body: JSON.stringify({ label: 'SUIVI SAV', type: 'LONGTEXT' }),
        }),
      );
      expect(await screen.findByText('SUIVI SAV')).toBeInTheDocument();
      expect(screen.getByLabelText('Libellé')).toHaveValue('');
    });

    it('refuse un libellé vide sans appeler l’API', async () => {
      const utilisateur = userEvent.setup();
      apiFetchMock.mockResolvedValueOnce([STATUT]);

      render(<ColonnesTab />);
      await screen.findByText('INSTALLATION');

      await utilisateur.click(screen.getByRole('button', { name: 'Ajouter la colonne' }));

      expect(screen.getByRole('alert')).toHaveTextContent('Le libellé de la colonne est obligatoire.');
      expect(apiFetchMock).toHaveBeenCalledTimes(1);
    });

    it('affiche un message français quand la session a expiré (AUTH_REQUIRED)', async () => {
      apiFetchMock.mockRejectedValueOnce({ status: 401, code: 'AUTH_REQUIRED', message: 'Non authentifié' });

      render(<ColonnesTab />);

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Votre session a expiré : veuillez vous reconnecter.',
      );
    });
  });
  ```

- [ ] **Étape 2: lancer le test (échec attendu)**

  ```bash
  pnpm --filter @suivi/web test -- colonnes.test.tsx
  ```

  Résultat attendu : **FAIL** — `The requested module '../colonnes' does not provide an export named 'trierParPosition'`, puis les rendus échouent (aucun tableau affiché).

- [ ] **Étape 3: implémenter — contenu complet de `apps/web/src/app/(app)/parametres/colonnes.tsx`**

  ```tsx
  'use client';

  import type { ColumnDTO, ColumnType } from '@suivi/shared';
  import { useCallback, useEffect, useState, type FormEvent } from 'react';

  import { apiFetch } from '../../../lib/api';
  import { messageErreurApi } from './messages';

  export const TYPES_COLONNE: { valeur: ColumnType; libelle: string }[] = [
    { valeur: 'TEXT', libelle: 'Texte' },
    { valeur: 'LONGTEXT', libelle: 'Texte long' },
    { valeur: 'DATE', libelle: 'Date' },
    { valeur: 'TIME', libelle: 'Heure' },
    { valeur: 'NUMBER', libelle: 'Nombre' },
    { valeur: 'SELECT', libelle: 'Liste' },
    { valeur: 'LINK', libelle: 'Lien' },
  ];

  export function trierParPosition<T extends { position: number }>(items: readonly T[]): T[] {
    return [...items].sort((a, b) => a.position - b.position);
  }

  export default function ColonnesTab() {
    const [colonnes, setColonnes] = useState<ColumnDTO[]>([]);
    const [chargement, setChargement] = useState(true);
    const [erreur, setErreur] = useState<string | null>(null);
    const [avertissement, setAvertissement] = useState<string | null>(null);
    const [nouveauLabel, setNouveauLabel] = useState('');
    const [nouveauType, setNouveauType] = useState<ColumnType>('TEXT');

    const charger = useCallback(async (): Promise<void> => {
      setChargement(true);
      try {
        const donnees = await apiFetch<ColumnDTO[]>('/columns');
        setColonnes(trierParPosition(donnees));
        setErreur(null);
      } catch (err) {
        setErreur(messageErreurApi(err));
      } finally {
        setChargement(false);
      }
    }, []);

    useEffect(() => {
      void charger();
    }, [charger]);

    const changerType = async (id: string, type: ColumnType): Promise<void> => {
      try {
        const misAJour = await apiFetch<ColumnDTO>(`/columns/${id}`, {
          method: 'PATCH',
          body: JSON.stringify({ type }),
        });
        setColonnes((precedentes) =>
          trierParPosition(precedentes.map((c) => (c.id === misAJour.id ? misAJour : c))),
        );
        setErreur(null);
        // Le changement de type ne convertit jamais les valeurs déjà saisies.
        setAvertissement('Les valeurs existantes ne sont pas converties.');
      } catch (err) {
        setErreur(messageErreurApi(err));
      }
    };

    const ajouter = async (evenement: FormEvent<HTMLFormElement>): Promise<void> => {
      evenement.preventDefault();
      const label = nouveauLabel.trim();
      if (label === '') {
        setErreur('Le libellé de la colonne est obligatoire.');
        return;
      }
      try {
        const creee = await apiFetch<ColumnDTO>('/columns', {
          method: 'POST',
          body: JSON.stringify({ label, type: nouveauType }),
        });
        setColonnes((precedentes) => trierParPosition([...precedentes, creee]));
        setNouveauLabel('');
        setNouveauType('TEXT');
        setErreur(null);
      } catch (err) {
        setErreur(messageErreurApi(err));
      }
    };

    return (
      <section aria-label="Colonnes">
        {erreur !== null && <p role="alert">{erreur}</p>}
        {avertissement !== null && <p role="status">{avertissement}</p>}
        {chargement && <p>Chargement des colonnes…</p>}

        <table>
          <caption>Colonnes du tableau</caption>
          <thead>
            <tr>
              <th scope="col">Libellé</th>
              <th scope="col">Type</th>
              <th scope="col">Visible</th>
              <th scope="col">Largeur (px)</th>
              <th scope="col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {colonnes.map((colonne) => (
              <tr key={colonne.id} data-testid={`colonne-${colonne.key}`}>
                <td>{colonne.label}</td>
                <td>
                  <select
                    aria-label={`Type de la colonne ${colonne.label}`}
                    value={colonne.type}
                    onChange={(evenement) => {
                      void changerType(colonne.id, evenement.target.value as ColumnType);
                    }}
                  >
                    {TYPES_COLONNE.map((type) => (
                      <option key={type.valeur} value={type.valeur}>
                        {type.libelle}
                      </option>
                    ))}
                  </select>
                </td>
                <td>{colonne.visible ? 'Oui' : 'Non'}</td>
                <td>{colonne.width}</td>
                <td />
              </tr>
            ))}
          </tbody>
        </table>

        <p>
          Le type d’une colonne est modifiable à tout moment. Attention : l’API ne convertit pas
          les valeurs déjà saisies — elles sont conservées telles quelles et réinterprétées par le
          nouveau type.
        </p>

        <form
          onSubmit={(evenement) => {
            void ajouter(evenement);
          }}
        >
          <h3>Ajouter une colonne</h3>
          <label htmlFor="nouvelle-colonne-label">Libellé</label>
          <input
            id="nouvelle-colonne-label"
            value={nouveauLabel}
            onChange={(evenement) => setNouveauLabel(evenement.target.value)}
          />
          <label htmlFor="nouvelle-colonne-type">Type</label>
          <select
            id="nouvelle-colonne-type"
            value={nouveauType}
            onChange={(evenement) => setNouveauType(evenement.target.value as ColumnType)}
          >
            {TYPES_COLONNE.map((type) => (
              <option key={type.valeur} value={type.valeur}>
                {type.libelle}
              </option>
            ))}
          </select>
          <button type="submit">Ajouter la colonne</button>
        </form>
      </section>
    );
  }
  ```

- [ ] **Étape 4: relancer le test (PASS)**

  ```bash
  pnpm --filter @suivi/web test -- colonnes.test.tsx
  ```

  Résultat attendu : **PASS** — 6 tests verts.

- [ ] **Étape 5: commit**

  ```bash
  git add "apps/web/src/app/(app)/parametres/colonnes.tsx" "apps/web/src/app/(app)/parametres/__tests__/colonnes.test.tsx"
  git commit -m "feat: onglet colonnes - liste, ajout et message de session expiree"
  ```

> À vérifier à l'exécution : `vi.mocked(apiFetch)` exige que le chemin du `vi.mock` résolve vers le même fichier que l'import du composant (`../../../lib/api` depuis `parametres/`, `../../../../lib/api` depuis `parametres/__tests__/`). Si Vitest se plaint de ne pas trouver le module, vérifier d'abord que `apps/web/src/lib/api.ts` existe bien (livré par la Feature 6).

---

### Task 8.4: Onglet Colonnes — renommage inline, largeur, visibilité (et `NOT_FOUND`)

**Files:**
- Modify: `apps/web/src/app/(app)/parametres/colonnes.tsx`
- Test: `apps/web/src/app/(app)/parametres/__tests__/colonnes.test.tsx`

**Interfaces:**
- Consomme : `PATCH /api/columns/:id` avec `{label?}`, `{width?}` ou `{visible?}` → `200 ColumnDTO` ; `404 NOT_FOUND`.
- Produit : dans `ColonnesTab`, les handlers `patchColonne`, `demarrerEdition`, `validerEdition`, `annulerEdition`, `changerLargeur`, `validerLargeur`, `basculerVisible` ; libellés accessibles `Renommer <label>`, `Nouveau libellé de <label>`, `Valider le libellé de <label>`, `Largeur de <label>`, `Colonne <label> visible`.

- [ ] **Étape 1: écrire les tests qui échouent — ajouter ce `describe` à la fin de `__tests__/colonnes.test.tsx`**

  ```tsx
  describe('ColonnesTab — renommage, largeur, visibilité', () => {
    it('renomme une colonne en inline (Entrée) et envoie PATCH { label }', async () => {
      const utilisateur = userEvent.setup();
      apiFetchMock
        .mockResolvedValueOnce([CLIENT])
        .mockResolvedValueOnce({ ...CLIENT, label: 'CLIENT FINAL' });

      render(<ColonnesTab />);
      await utilisateur.click(await screen.findByRole('button', { name: 'Renommer CLIENT' }));

      const champ = screen.getByLabelText('Nouveau libellé de CLIENT');
      await utilisateur.clear(champ);
      await utilisateur.type(champ, 'CLIENT FINAL{Enter}');

      await waitFor(() =>
        expect(apiFetchMock).toHaveBeenLastCalledWith('/columns/c1', {
          method: 'PATCH',
          body: JSON.stringify({ label: 'CLIENT FINAL' }),
        }),
      );
      expect(await screen.findByText('CLIENT FINAL')).toBeInTheDocument();
    });

    it('annule le renommage avec Échap sans appeler l’API', async () => {
      const utilisateur = userEvent.setup();
      apiFetchMock.mockResolvedValueOnce([CLIENT]);

      render(<ColonnesTab />);
      await utilisateur.click(await screen.findByRole('button', { name: 'Renommer CLIENT' }));
      await utilisateur.type(screen.getByLabelText('Nouveau libellé de CLIENT'), 'PERDU{Escape}');

      expect(screen.getByText('CLIENT')).toBeInTheDocument();
      expect(apiFetchMock).toHaveBeenCalledTimes(1);
    });

    it('bascule la visibilité et envoie PATCH { visible }', async () => {
      const utilisateur = userEvent.setup();
      apiFetchMock
        .mockResolvedValueOnce([CLIENT])
        .mockResolvedValueOnce({ ...CLIENT, visible: false });

      render(<ColonnesTab />);
      await utilisateur.click(await screen.findByLabelText('Colonne CLIENT visible'));

      await waitFor(() =>
        expect(apiFetchMock).toHaveBeenLastCalledWith('/columns/c1', {
          method: 'PATCH',
          body: JSON.stringify({ visible: false }),
        }),
      );
    });

    it('enregistre la largeur à la sortie du champ', async () => {
      const utilisateur = userEvent.setup();
      apiFetchMock
        .mockResolvedValueOnce([CLIENT])
        .mockResolvedValueOnce({ ...CLIENT, width: 300 });

      render(<ColonnesTab />);
      const champ = await screen.findByLabelText('Largeur de CLIENT');
      await utilisateur.clear(champ);
      await utilisateur.type(champ, '300');
      await utilisateur.tab();

      await waitFor(() =>
        expect(apiFetchMock).toHaveBeenLastCalledWith('/columns/c1', {
          method: 'PATCH',
          body: JSON.stringify({ width: 300 }),
        }),
      );
    });

    it('refuse une largeur hors bornes sans appeler l’API', async () => {
      const utilisateur = userEvent.setup();
      apiFetchMock.mockResolvedValueOnce([CLIENT]);

      render(<ColonnesTab />);
      const champ = await screen.findByLabelText('Largeur de CLIENT');
      await utilisateur.clear(champ);
      await utilisateur.type(champ, '9');
      await utilisateur.tab();

      expect(screen.getByRole('alert')).toHaveTextContent(
        'La largeur doit être comprise entre 40 et 1000 pixels.',
      );
      expect(apiFetchMock).toHaveBeenCalledTimes(1);
    });

    it('affiche NOT_FOUND en français et recharge la liste', async () => {
      const utilisateur = userEvent.setup();
      apiFetchMock
        .mockResolvedValueOnce([CLIENT])
        .mockRejectedValueOnce({ status: 404, code: 'NOT_FOUND', message: 'Colonne introuvable' })
        .mockResolvedValueOnce([]);

      render(<ColonnesTab />);
      await utilisateur.click(await screen.findByLabelText('Colonne CLIENT visible'));

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Élément introuvable : il vient peut-être d’être supprimé par un collègue.',
      );
      await waitFor(() => expect(apiFetchMock).toHaveBeenLastCalledWith('/columns'));
    });
  });
  ```

- [ ] **Étape 2: lancer les tests (échec attendu)**

  ```bash
  pnpm --filter @suivi/web test -- colonnes.test.tsx
  ```

  Résultat attendu : **FAIL** — `Unable to find an accessible element with the role "button" and name "Renommer CLIENT"` (et les autres libellés absents).

- [ ] **Étape 3: implémenter — nouveaux états et handlers**

  Dans `colonnes.tsx`, ajouter ces deux états juste après `const [nouveauType, ...]` :

  ```tsx
    const [editionId, setEditionId] = useState<string | null>(null);
    const [editionLabel, setEditionLabel] = useState('');
  ```

  Puis insérer ce bloc complet entre le `useEffect` et la fonction `ajouter` :

  ```tsx
    const patchColonne = useCallback(
      async (
        id: string,
        corps: Partial<Pick<ColumnDTO, 'label' | 'position' | 'width' | 'visible'>>,
      ): Promise<void> => {
        try {
          const misAJour = await apiFetch<ColumnDTO>(`/columns/${id}`, {
            method: 'PATCH',
            body: JSON.stringify(corps),
          });
          setColonnes((precedentes) =>
            trierParPosition(precedentes.map((c) => (c.id === misAJour.id ? misAJour : c))),
          );
          setErreur(null);
        } catch (err) {
          setErreur(messageErreurApi(err));
          await charger();
        }
      },
      [charger],
    );

    const demarrerEdition = (colonne: ColumnDTO): void => {
      setEditionId(colonne.id);
      setEditionLabel(colonne.label);
    };

    const annulerEdition = (): void => {
      setEditionId(null);
      setEditionLabel('');
    };

    const validerEdition = async (colonne: ColumnDTO): Promise<void> => {
      const label = editionLabel.trim();
      annulerEdition();
      if (label === '' || label === colonne.label) {
        return;
      }
      await patchColonne(colonne.id, { label });
    };

    const changerLargeur = (id: string, saisie: string): void => {
      const largeur = Number.parseInt(saisie, 10);
      setColonnes((precedentes) =>
        precedentes.map((c) => (c.id === id ? { ...c, width: Number.isNaN(largeur) ? 0 : largeur } : c)),
      );
    };

    const validerLargeur = async (colonne: ColumnDTO): Promise<void> => {
      if (colonne.width < 40 || colonne.width > 1000) {
        setErreur('La largeur doit être comprise entre 40 et 1000 pixels.');
        return;
      }
      await patchColonne(colonne.id, { width: colonne.width });
    };

    const basculerVisible = async (colonne: ColumnDTO, visible: boolean): Promise<void> => {
      setColonnes((precedentes) =>
        precedentes.map((c) => (c.id === colonne.id ? { ...c, visible } : c)),
      );
      await patchColonne(colonne.id, { visible });
    };
  ```

- [ ] **Étape 4: implémenter — remplacer intégralement le `<tbody>` de `colonnes.tsx`**

  ```tsx
          <tbody>
            {colonnes.map((colonne) => (
              <tr key={colonne.id} data-testid={`colonne-${colonne.key}`}>
                <td>
                  {editionId === colonne.id ? (
                    <>
                      <input
                        aria-label={`Nouveau libellé de ${colonne.label}`}
                        value={editionLabel}
                        autoFocus
                        onChange={(evenement) => setEditionLabel(evenement.target.value)}
                        onKeyDown={(evenement) => {
                          if (evenement.key === 'Enter') {
                            evenement.preventDefault();
                            void validerEdition(colonne);
                          }
                          if (evenement.key === 'Escape') {
                            evenement.preventDefault();
                            annulerEdition();
                          }
                        }}
                      />
                      <button
                        type="button"
                        aria-label={`Valider le libellé de ${colonne.label}`}
                        onClick={() => {
                          void validerEdition(colonne);
                        }}
                      >
                        ✓
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      aria-label={`Renommer ${colonne.label}`}
                      onClick={() => demarrerEdition(colonne)}
                    >
                      {colonne.label}
                    </button>
                  )}
                </td>
                <td>
                  <select
                    aria-label={`Type de la colonne ${colonne.label}`}
                    value={colonne.type}
                    onChange={(evenement) => {
                      void changerType(colonne.id, evenement.target.value as ColumnType);
                    }}
                  >
                    {TYPES_COLONNE.map((type) => (
                      <option key={type.valeur} value={type.valeur}>
                        {type.libelle}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <input
                    type="checkbox"
                    aria-label={`Colonne ${colonne.label} visible`}
                    checked={colonne.visible}
                    onChange={(evenement) => {
                      void basculerVisible(colonne, evenement.target.checked);
                    }}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    aria-label={`Largeur de ${colonne.label}`}
                    value={String(colonne.width)}
                    min={40}
                    max={1000}
                    onChange={(evenement) => changerLargeur(colonne.id, evenement.target.value)}
                    onBlur={() => {
                      void validerLargeur(colonne);
                    }}
                  />
                </td>
                <td />
              </tr>
            ))}
          </tbody>
  ```

  Note : le texte affiché du libellé est désormais porté par le bouton « Renommer … », donc `screen.getByText('CLIENT')` continue de fonctionner.

- [ ] **Étape 5: relancer les tests (PASS)**

  ```bash
  pnpm --filter @suivi/web test -- colonnes.test.tsx
  ```

  Résultat attendu : **PASS** — 12 tests verts (6 de la tâche 8.3 + 6 nouveaux).

- [ ] **Étape 6: commit**

  ```bash
  git add "apps/web/src/app/(app)/parametres/colonnes.tsx" "apps/web/src/app/(app)/parametres/__tests__/colonnes.test.tsx"
  git commit -m "feat: onglet colonnes - renommage inline, largeur et visibilite"
  ```

---

### Task 8.5: Onglet Colonnes — réordonnancement par glisser-déposer HTML5

**Files:**
- Modify: `apps/web/src/app/(app)/parametres/colonnes.tsx`
- Test: `apps/web/src/app/(app)/parametres/__tests__/colonnes.test.tsx`

**Interfaces:**
- Consomme : `PATCH /api/columns/:id { position }` (réordonnancement transactionnel côté serveur, Feature 3 Task 3.5), puis `GET /api/columns` pour reprendre les positions faisant foi.
- Produit : `export function deplacerElement<T>(items: readonly T[], depuis: number, vers: number): T[]` (réutilisé par `listes.tsx`) ; lignes `<tr draggable>` avec `onDragStart` / `onDragOver` / `onDrop`.

- [ ] **Étape 1: écrire les tests qui échouent — ajouter ce `describe` à la fin de `__tests__/colonnes.test.tsx`**

  ```tsx
  function dataTransferFactice(): DataTransfer {
    const donnees = new Map<string, string>();
    return {
      effectAllowed: 'none',
      dropEffect: 'none',
      setData: (type: string, valeur: string) => {
        donnees.set(type, valeur);
      },
      getData: (type: string) => donnees.get(type) ?? '',
    } as unknown as DataTransfer;
  }

  describe('ColonnesTab — glisser-déposer', () => {
    it('deplacerElement déplace un élément sans muter la source', () => {
      const source = ['a', 'b', 'c'];
      expect(deplacerElement(source, 0, 2)).toEqual(['b', 'c', 'a']);
      expect(deplacerElement(source, 2, 0)).toEqual(['c', 'a', 'b']);
      expect(deplacerElement(source, 0, 9)).toEqual(['a', 'b', 'c']);
      expect(source).toEqual(['a', 'b', 'c']);
    });

    it('déposer la 2e ligne sur la 1re envoie PATCH { position: 0 } puis recharge', async () => {
      apiFetchMock
        .mockResolvedValueOnce([STATUT, CLIENT])
        .mockResolvedValueOnce({ ...CLIENT, position: 0 })
        .mockResolvedValueOnce([{ ...CLIENT, position: 0 }, { ...STATUT, position: 1 }]);

      render(<ColonnesTab />);
      await screen.findByText('CLIENT');

      const lignes = screen.getAllByRole('row').slice(1);
      const transfert = dataTransferFactice();
      fireEvent.dragStart(lignes[1], { dataTransfer: transfert });
      fireEvent.dragOver(lignes[0], { dataTransfer: transfert });
      fireEvent.drop(lignes[0], { dataTransfer: transfert });

      await waitFor(() =>
        expect(apiFetchMock).toHaveBeenNthCalledWith(2, '/columns/c1', {
          method: 'PATCH',
          body: JSON.stringify({ position: 0 }),
        }),
      );
      await waitFor(() => expect(apiFetchMock).toHaveBeenLastCalledWith('/columns'));
      await waitFor(() => {
        const apres = screen.getAllByRole('row').slice(1);
        expect(apres[0]).toHaveAttribute('data-testid', 'colonne-client');
      });
    });

    it('déposer une ligne sur elle-même n’appelle pas l’API', async () => {
      apiFetchMock.mockResolvedValueOnce([STATUT, CLIENT]);

      render(<ColonnesTab />);
      await screen.findByText('CLIENT');

      const lignes = screen.getAllByRole('row').slice(1);
      const transfert = dataTransferFactice();
      fireEvent.dragStart(lignes[0], { dataTransfer: transfert });
      fireEvent.drop(lignes[0], { dataTransfer: transfert });

      expect(apiFetchMock).toHaveBeenCalledTimes(1);
    });
  });
  ```

  Compléter les imports en tête du fichier de test :

  ```tsx
  import { fireEvent, render, screen, waitFor } from '@testing-library/react';
  import ColonnesTab, { deplacerElement, trierParPosition } from '../colonnes';
  ```

- [ ] **Étape 2: lancer les tests (échec attendu)**

  ```bash
  pnpm --filter @suivi/web test -- colonnes.test.tsx
  ```

  Résultat attendu : **FAIL** — `does not provide an export named 'deplacerElement'`.

- [ ] **Étape 3: implémenter — fonction pure + état + handlers**

  Ajouter dans `colonnes.tsx`, juste après `trierParPosition` :

  ```tsx
  export function deplacerElement<T>(items: readonly T[], depuis: number, vers: number): T[] {
    const copie = [...items];
    if (depuis < 0 || depuis >= copie.length || vers < 0 || vers >= copie.length) {
      return copie;
    }
    const [element] = copie.splice(depuis, 1);
    copie.splice(vers, 0, element);
    return copie;
  }
  ```

  Ajouter l'état, après `const [editionLabel, ...]` :

  ```tsx
    const [indexGlisse, setIndexGlisse] = useState<number | null>(null);
  ```

  Ajouter les handlers, juste après `basculerVisible` :

  ```tsx
    const commencerGlisse = (index: number) => (evenement: DragEvent<HTMLTableRowElement>): void => {
      setIndexGlisse(index);
      evenement.dataTransfer.effectAllowed = 'move';
      evenement.dataTransfer.setData('text/plain', String(index));
    };

    const survolerGlisse = (evenement: DragEvent<HTMLTableRowElement>): void => {
      evenement.preventDefault();
      evenement.dataTransfer.dropEffect = 'move';
    };

    const deposer = (index: number) => async (
      evenement: DragEvent<HTMLTableRowElement>,
    ): Promise<void> => {
      evenement.preventDefault();
      const brut = evenement.dataTransfer.getData('text/plain');
      const depuis = indexGlisse ?? Number.parseInt(brut, 10);
      setIndexGlisse(null);
      if (Number.isNaN(depuis) || depuis === index) {
        return;
      }
      const reordonnees = deplacerElement(colonnes, depuis, index).map((colonne, rang) => ({
        ...colonne,
        position: rang,
      }));
      setColonnes(reordonnees);
      await patchColonne(reordonnees[index].id, { position: index });
      await charger();
    };
  ```

  Compléter l'import React en tête de fichier :

  ```tsx
  import { useCallback, useEffect, useState, type DragEvent, type FormEvent } from 'react';
  ```

- [ ] **Étape 4: implémenter — rendre les lignes déplaçables**

  Remplacer la ligne d'ouverture du `<tr>` dans le `<tbody>` par :

  ```tsx
              <tr
                key={colonne.id}
                data-testid={`colonne-${colonne.key}`}
                draggable
                onDragStart={commencerGlisse(colonnes.indexOf(colonne))}
                onDragOver={survolerGlisse}
                onDrop={(evenement) => {
                  void deposer(colonnes.indexOf(colonne))(evenement);
                }}
                onDragEnd={() => setIndexGlisse(null)}
              >
  ```

  Et ajouter, comme première cellule de la ligne (avant la cellule du libellé) :

  ```tsx
                <td aria-hidden="true" title="Glisser pour réordonner">
                  ⠿
                </td>
  ```

  Ajouter l'en-tête correspondant dans le `<thead>`, avant `Libellé` :

  ```tsx
              <th scope="col">
                <span className="sr-only">Ordre</span>
              </th>
  ```

- [ ] **Étape 5: relancer les tests (PASS)**

  ```bash
  pnpm --filter @suivi/web test -- colonnes.test.tsx
  ```

  Résultat attendu : **PASS** — 15 tests verts.

- [ ] **Étape 6: commit**

  ```bash
  git add "apps/web/src/app/(app)/parametres/colonnes.tsx" "apps/web/src/app/(app)/parametres/__tests__/colonnes.test.tsx"
  git commit -m "feat: onglet colonnes - reordonnancement par drag HTML5"
  ```

> À vérifier à l'exécution : le glisser-déposer natif dans un vrai navigateur — sur certains moteurs, le `drop` n'est déclenché que si `dragover` a bien appelé `preventDefault()` (c'est le cas ici) ; vérifier également que la poignée `⠿` reste saisissable sur écran tactile (repli : bouton « monter / descendre » si nécessaire, hors périmètre v1).

---

### Task 8.6: Onglet Colonnes — suppression, double dialogue et `COLUMN_HAS_DATA`

**Files:**
- Modify: `apps/web/src/app/(app)/parametres/colonnes.tsx`
- Test: `apps/web/src/app/(app)/parametres/__tests__/colonnes.test.tsx`

**Interfaces:**
- Consomme : `DELETE /api/columns/:id` → `204` ; `409 COLUMN_HAS_DATA` si des lignes ont une valeur ; `DELETE /api/columns/:id?force=true` → `204` (purge du JSONB côté serveur).
- Produit : machine à états `EtatSuppression = { phase: 'aucune' } | { phase: 'confirmation'; colonne } | { phase: 'forcage'; colonne }` et deux `role="dialog"` distincts.

- [ ] **Étape 1: écrire les tests qui échouent — ajouter ce `describe` à la fin de `__tests__/colonnes.test.tsx`**

  ```tsx
  describe('ColonnesTab — suppression', () => {
    it('supprime une colonne vide après confirmation', async () => {
      const utilisateur = userEvent.setup();
      apiFetchMock.mockResolvedValueOnce([CLIENT]).mockResolvedValueOnce(undefined);

      render(<ColonnesTab />);
      await utilisateur.click(await screen.findByRole('button', { name: 'Supprimer CLIENT' }));

      const dialogue = screen.getByRole('dialog');
      expect(dialogue).toHaveTextContent('Supprimer la colonne « CLIENT » ?');
      await utilisateur.click(within(dialogue).getByRole('button', { name: 'Supprimer' }));

      await waitFor(() =>
        expect(apiFetchMock).toHaveBeenLastCalledWith('/columns/c1', { method: 'DELETE' }),
      );
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(screen.queryByText('CLIENT')).not.toBeInTheDocument();
    });

    it('annule la suppression sans appeler l’API', async () => {
      const utilisateur = userEvent.setup();
      apiFetchMock.mockResolvedValueOnce([CLIENT]);

      render(<ColonnesTab />);
      await utilisateur.click(await screen.findByRole('button', { name: 'Supprimer CLIENT' }));
      await utilisateur.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Annuler' }));

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(apiFetchMock).toHaveBeenCalledTimes(1);
    });

    it('sur 409 COLUMN_HAS_DATA, ouvre le second dialogue puis supprime avec ?force=true', async () => {
      const utilisateur = userEvent.setup();
      apiFetchMock
        .mockResolvedValueOnce([CLIENT])
        .mockRejectedValueOnce({
          status: 409,
          code: 'COLUMN_HAS_DATA',
          message: 'La colonne contient des données',
        })
        .mockResolvedValueOnce(undefined);

      render(<ColonnesTab />);
      await utilisateur.click(await screen.findByRole('button', { name: 'Supprimer CLIENT' }));
      await utilisateur.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Supprimer' }));

      const forcage = await screen.findByRole('dialog');
      expect(forcage).toHaveTextContent('contient déjà des données');
      expect(forcage).toHaveTextContent('effacera définitivement ces valeurs dans toutes les lignes');

      await utilisateur.click(
        within(forcage).getByRole('button', { name: 'Supprimer quand même avec les données' }),
      );

      await waitFor(() =>
        expect(apiFetchMock).toHaveBeenLastCalledWith('/columns/c1?force=true', { method: 'DELETE' }),
      );
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(screen.queryByText('CLIENT')).not.toBeInTheDocument();
    });

    it('affiche une erreur et ferme le dialogue si la suppression forcée échoue', async () => {
      const utilisateur = userEvent.setup();
      apiFetchMock
        .mockResolvedValueOnce([CLIENT])
        .mockRejectedValueOnce({ status: 409, code: 'COLUMN_HAS_DATA', message: 'données' })
        .mockRejectedValueOnce({ status: 404, code: 'NOT_FOUND', message: 'introuvable' });

      render(<ColonnesTab />);
      await utilisateur.click(await screen.findByRole('button', { name: 'Supprimer CLIENT' }));
      await utilisateur.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Supprimer' }));
      await utilisateur.click(
        within(await screen.findByRole('dialog')).getByRole('button', {
          name: 'Supprimer quand même avec les données',
        }),
      );

      expect(await screen.findByRole('alert')).toHaveTextContent('Élément introuvable');
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });
  ```

  Compléter les imports du fichier de test :

  ```tsx
  import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
  ```

- [ ] **Étape 2: lancer les tests (échec attendu)**

  ```bash
  pnpm --filter @suivi/web test -- colonnes.test.tsx
  ```

  Résultat attendu : **FAIL** — `Unable to find an accessible element with the role "button" and name "Supprimer CLIENT"`.

- [ ] **Étape 3: implémenter — état et handlers de suppression**

  Ajouter en haut de `colonnes.tsx`, après `deplacerElement` :

  ```tsx
  type EtatSuppression =
    | { phase: 'aucune' }
    | { phase: 'confirmation'; colonne: ColumnDTO }
    | { phase: 'forcage'; colonne: ColumnDTO };
  ```

  Ajouter l'état, après `const [indexGlisse, ...]` :

  ```tsx
    const [suppression, setSuppression] = useState<EtatSuppression>({ phase: 'aucune' });
  ```

  Ajouter les handlers, après `deposer` :

  ```tsx
    const confirmerSuppression = async (force: boolean): Promise<void> => {
      if (suppression.phase === 'aucune') {
        return;
      }
      const cible = suppression.colonne;
      try {
        await apiFetch<void>(`/columns/${cible.id}${force ? '?force=true' : ''}`, {
          method: 'DELETE',
        });
        setColonnes((precedentes) => precedentes.filter((c) => c.id !== cible.id));
        setSuppression({ phase: 'aucune' });
        setErreur(null);
      } catch (err) {
        if (!force && aCodeErreur(err, 'COLUMN_HAS_DATA')) {
          setSuppression({ phase: 'forcage', colonne: cible });
          return;
        }
        setErreur(messageErreurApi(err));
        setSuppression({ phase: 'aucune' });
      }
    };
  ```

  Compléter l'import des messages :

  ```tsx
  import { aCodeErreur, messageErreurApi } from './messages';
  ```

- [ ] **Étape 4: implémenter — bouton de suppression et les deux dialogues**

  Remplacer la dernière cellule du `<tbody>` (`<td />`) par :

  ```tsx
                <td>
                  <button
                    type="button"
                    aria-label={`Supprimer ${colonne.label}`}
                    onClick={() => setSuppression({ phase: 'confirmation', colonne })}
                  >
                    Supprimer
                  </button>
                </td>
  ```

  Ajouter juste avant la balise fermante `</section>` :

  ```tsx
        {suppression.phase === 'confirmation' && (
          <div role="dialog" aria-modal="true" aria-label="Confirmer la suppression de la colonne">
            <p>Supprimer la colonne « {suppression.colonne.label} » ?</p>
            <p>Cette action est définitive et ne peut pas être annulée.</p>
            <button type="button" onClick={() => setSuppression({ phase: 'aucune' })}>
              Annuler
            </button>
            <button
              type="button"
              onClick={() => {
                void confirmerSuppression(false);
              }}
            >
              Supprimer
            </button>
          </div>
        )}

        {suppression.phase === 'forcage' && (
          <div role="dialog" aria-modal="true" aria-label="La colonne contient des données">
            <p>
              La colonne « {suppression.colonne.label} » contient déjà des données. La supprimer
              effacera définitivement ces valeurs dans toutes les lignes, y compris les archives.
            </p>
            <button type="button" onClick={() => setSuppression({ phase: 'aucune' })}>
              Annuler
            </button>
            <button
              type="button"
              onClick={() => {
                void confirmerSuppression(true);
              }}
            >
              Supprimer quand même avec les données
            </button>
          </div>
        )}
  ```

- [ ] **Étape 5: relancer les tests (PASS)**

  ```bash
  pnpm --filter @suivi/web test -- colonnes.test.tsx
  ```

  Résultat attendu : **PASS** — 19 tests verts.

- [ ] **Étape 6: commit**

  ```bash
  git add "apps/web/src/app/(app)/parametres/colonnes.tsx" "apps/web/src/app/(app)/parametres/__tests__/colonnes.test.tsx"
  git commit -m "feat: onglet colonnes - suppression avec garde-fou COLUMN_HAS_DATA et force=true"
  ```

---

### Task 8.7: Onglet Listes & couleurs — sélecteur de colonne, pastilles et couleurs

**Files:**
- Modify: `apps/web/src/app/(app)/parametres/listes.tsx`
- Test: `apps/web/src/app/(app)/parametres/__tests__/listes.test.tsx`

**Interfaces:**
- Consomme : `GET /api/columns` (les `ColumnDTO` portent déjà `choices: ChoiceDTO[]`) ; `PATCH /api/choices/:id { bgColor?, textColor?, bold? }` → `200 ChoiceDTO` ; `trierParPosition` de `./colonnes` ; `messageErreurApi` de `./messages`.
- Produit :
  - `export const FOND_DEFAUT = '#ffffff'` et `export const TEXTE_DEFAUT = '#000000'` ;
  - `export function hexPourInput(hex: string | null, defaut: string): string` ;
  - `export function stylePastille(choix: Pick<ChoiceDTO, 'bgColor' | 'textColor' | 'bold'>): CSSProperties` ;
  - `ListesTab` avec le champ `<select id="selecteur-colonne">` étiqueté « Colonne de type liste » et une pastille `data-testid="pastille-<id>"` par choix (aperçu live).

- [ ] **Étape 1: écrire le test qui échoue — `apps/web/src/app/(app)/parametres/__tests__/listes.test.tsx`**

  ```tsx
  import { fireEvent, render, screen, waitFor } from '@testing-library/react';
  import userEvent from '@testing-library/user-event';
  import type { ChoiceDTO, ColumnDTO } from '@suivi/shared';
  import { beforeEach, describe, expect, it, vi } from 'vitest';

  vi.mock('../../../../lib/api', () => ({ apiFetch: vi.fn() }));

  import { apiFetch } from '../../../../lib/api';
  import ListesTab, { hexPourInput, stylePastille } from '../listes';

  const apiFetchMock = vi.mocked(apiFetch);

  function choix(partiel: Partial<ChoiceDTO> & { id: string; label: string }): ChoiceDTO {
    return {
      columnId: 'col-statut',
      bgColor: null,
      textColor: null,
      bold: false,
      position: 0,
      archived: false,
      ...partiel,
    };
  }

  const NEW = choix({
    id: 'ch1',
    label: 'NEW',
    bgColor: '#FFFF00',
    textColor: '#FF0000',
    bold: true,
    position: 0,
  });
  const CLOTUREE = choix({
    id: 'ch2',
    label: 'CLOTUREE',
    bgColor: '#A6A6A6',
    textColor: '#ABEBC6',
    position: 1,
  });

  const COLONNE_STATUT: ColumnDTO = {
    id: 'col-statut',
    key: 'statut',
    label: 'INSTALLATION',
    type: 'SELECT',
    position: 11,
    width: 150,
    visible: true,
    choices: [CLOTUREE, NEW],
  };

  const COLONNE_TECH: ColumnDTO = {
    id: 'col-tech',
    key: 'tech',
    label: 'TECH',
    type: 'SELECT',
    position: 8,
    width: 130,
    visible: true,
    choices: [choix({ id: 'ch3', label: 'DIRECT', columnId: 'col-tech', textColor: '#009ADF', bold: true })],
  };

  const COLONNE_CLIENT: ColumnDTO = {
    id: 'col-client',
    key: 'client',
    label: 'CLIENT',
    type: 'TEXT',
    position: 1,
    width: 220,
    visible: true,
    choices: [],
  };

  beforeEach(() => {
    apiFetchMock.mockReset();
  });

  describe('ListesTab — sélection, pastilles et couleurs', () => {
    it('hexPourInput normalise en minuscules et retombe sur le défaut', () => {
      expect(hexPourInput('#FFFF00', '#ffffff')).toBe('#ffff00');
      expect(hexPourInput(null, '#ffffff')).toBe('#ffffff');
      expect(hexPourInput('rouge', '#000000')).toBe('#000000');
    });

    it('stylePastille traduit fond, texte et gras', () => {
      expect(stylePastille(NEW)).toMatchObject({
        backgroundColor: '#FFFF00',
        color: '#FF0000',
        fontWeight: 700,
      });
      expect(stylePastille(choix({ id: 'x', label: 'A DISTANCE' }))).toMatchObject({
        backgroundColor: 'transparent',
        color: 'inherit',
        fontWeight: 400,
      });
    });

    it('ne propose que les colonnes de type liste, dans l’ordre des positions', async () => {
      apiFetchMock.mockResolvedValueOnce([COLONNE_CLIENT, COLONNE_STATUT, COLONNE_TECH]);

      render(<ListesTab />);

      const selecteur = await screen.findByLabelText('Colonne de type liste');
      const options = Array.from(selecteur.querySelectorAll('option')).map((o) => o.textContent);
      expect(options).toEqual(['TECH', 'INSTALLATION']);
    });

    it('affiche les choix de la colonne sélectionnée, triés, avec leur pastille', async () => {
      apiFetchMock.mockResolvedValueOnce([COLONNE_STATUT]);

      render(<ListesTab />);

      const pastille = await screen.findByTestId('pastille-ch1');
      expect(pastille).toHaveTextContent('NEW');
      expect(pastille).toHaveStyle({ backgroundColor: '#FFFF00', color: '#FF0000' });

      const elements = screen.getAllByTestId(/^pastille-/);
      expect(elements.map((e) => e.getAttribute('data-testid'))).toEqual([
        'pastille-ch1',
        'pastille-ch2',
      ]);
    });

    it('met à jour la pastille immédiatement puis enregistre la couleur de fond', async () => {
      apiFetchMock
        .mockResolvedValueOnce([COLONNE_STATUT])
        .mockResolvedValueOnce({ ...NEW, bgColor: '#00ff00' });

      render(<ListesTab />);
      const champ = await screen.findByLabelText('Couleur de fond de NEW');

      fireEvent.change(champ, { target: { value: '#00ff00' } });
      expect(screen.getByTestId('pastille-ch1')).toHaveStyle({ backgroundColor: '#00ff00' });
      expect(apiFetchMock).toHaveBeenCalledTimes(1);

      fireEvent.blur(champ);
      await waitFor(() =>
        expect(apiFetchMock).toHaveBeenLastCalledWith('/choices/ch1', {
          method: 'PATCH',
          body: JSON.stringify({ bgColor: '#00ff00' }),
        }),
      );
    });

    it('enregistre la couleur du texte', async () => {
      apiFetchMock
        .mockResolvedValueOnce([COLONNE_STATUT])
        .mockResolvedValueOnce({ ...NEW, textColor: '#123456' });

      render(<ListesTab />);
      const champ = await screen.findByLabelText('Couleur du texte de NEW');

      fireEvent.change(champ, { target: { value: '#123456' } });
      fireEvent.blur(champ);

      await waitFor(() =>
        expect(apiFetchMock).toHaveBeenLastCalledWith('/choices/ch1', {
          method: 'PATCH',
          body: JSON.stringify({ textColor: '#123456' }),
        }),
      );
    });

    it('bascule le gras et envoie PATCH { bold }', async () => {
      const utilisateur = userEvent.setup();
      apiFetchMock
        .mockResolvedValueOnce([COLONNE_STATUT])
        .mockResolvedValueOnce({ ...CLOTUREE, bold: true });

      render(<ListesTab />);
      await utilisateur.click(await screen.findByLabelText('Gras pour CLOTUREE'));

      await waitFor(() =>
        expect(apiFetchMock).toHaveBeenLastCalledWith('/choices/ch2', {
          method: 'PATCH',
          body: JSON.stringify({ bold: true }),
        }),
      );
    });

    it('change de colonne et affiche l’autre liste', async () => {
      const utilisateur = userEvent.setup();
      apiFetchMock.mockResolvedValueOnce([COLONNE_STATUT, COLONNE_TECH]);

      render(<ListesTab />);
      const selecteur = await screen.findByLabelText('Colonne de type liste');
      await utilisateur.selectOptions(selecteur, 'col-statut');

      expect(screen.getByTestId('pastille-ch1')).toBeInTheDocument();
      expect(screen.queryByTestId('pastille-ch3')).not.toBeInTheDocument();
    });
  });
  ```

- [ ] **Étape 2: lancer le test (échec attendu)**

  ```bash
  pnpm --filter @suivi/web test -- listes.test.tsx
  ```

  Résultat attendu : **FAIL** — `does not provide an export named 'hexPourInput'` puis `Unable to find a label with the text of: Colonne de type liste`.

- [ ] **Étape 3: implémenter — contenu complet de `apps/web/src/app/(app)/parametres/listes.tsx`**

  ```tsx
  'use client';

  import type { ChoiceDTO, ColumnDTO } from '@suivi/shared';
  import { useCallback, useEffect, useState, type CSSProperties } from 'react';

  import { apiFetch } from '../../../lib/api';
  import { trierParPosition } from './colonnes';
  import { messageErreurApi } from './messages';

  export const FOND_DEFAUT = '#ffffff';
  export const TEXTE_DEFAUT = '#000000';

  /** `input[type=color]` n'accepte qu'un hex 7 caractères en minuscules. */
  export function hexPourInput(hex: string | null, defaut: string): string {
    if (hex === null || !/^#[0-9a-fA-F]{6}$/.test(hex)) {
      return defaut;
    }
    return hex.toLowerCase();
  }

  export function stylePastille(
    choix: Pick<ChoiceDTO, 'bgColor' | 'textColor' | 'bold'>,
  ): CSSProperties {
    return {
      backgroundColor: choix.bgColor ?? 'transparent',
      color: choix.textColor ?? 'inherit',
      fontWeight: choix.bold ? 700 : 400,
      display: 'inline-block',
      padding: '2px 10px',
      borderRadius: '10px',
      border: '1px solid rgba(0, 0, 0, 0.15)',
    };
  }

  export default function ListesTab() {
    const [colonnes, setColonnes] = useState<ColumnDTO[]>([]);
    const [colonneId, setColonneId] = useState('');
    const [choix, setChoix] = useState<ChoiceDTO[]>([]);
    const [chargement, setChargement] = useState(true);
    const [erreur, setErreur] = useState<string | null>(null);
    const [info, setInfo] = useState<string | null>(null);

    const charger = useCallback(async (): Promise<void> => {
      setChargement(true);
      try {
        const toutes = await apiFetch<ColumnDTO[]>('/columns');
        const listes = trierParPosition(toutes.filter((colonne) => colonne.type === 'SELECT'));
        setColonnes(listes);
        setColonneId((precedent) =>
          listes.some((colonne) => colonne.id === precedent) ? precedent : (listes[0]?.id ?? ''),
        );
        setErreur(null);
      } catch (err) {
        setErreur(messageErreurApi(err));
      } finally {
        setChargement(false);
      }
    }, []);

    useEffect(() => {
      void charger();
    }, [charger]);

    useEffect(() => {
      const courante = colonnes.find((colonne) => colonne.id === colonneId);
      setChoix(courante === undefined ? [] : trierParPosition(courante.choices));
    }, [colonnes, colonneId]);

    /** Aperçu immédiat, avant tout aller-retour réseau. */
    const majLocale = (id: string, modification: Partial<ChoiceDTO>): void => {
      setChoix((precedents) =>
        precedents.map((element) => (element.id === id ? { ...element, ...modification } : element)),
      );
    };

    const enregistrerChoix = async (
      id: string,
      corps: Partial<Pick<ChoiceDTO, 'label' | 'bgColor' | 'textColor' | 'bold' | 'position' | 'archived'>>,
    ): Promise<ChoiceDTO | null> => {
      try {
        const misAJour = await apiFetch<ChoiceDTO>(`/choices/${id}`, {
          method: 'PATCH',
          body: JSON.stringify(corps),
        });
        setColonnes((precedentes) =>
          precedentes.map((colonne) =>
            colonne.id === misAJour.columnId
              ? {
                  ...colonne,
                  choices: colonne.choices.map((element) =>
                    element.id === misAJour.id ? misAJour : element,
                  ),
                }
              : colonne,
          ),
        );
        setErreur(null);
        return misAJour;
      } catch (err) {
        setErreur(messageErreurApi(err));
        await charger();
        return null;
      }
    };

    return (
      <section aria-label="Listes et couleurs">
        {erreur !== null && <p role="alert">{erreur}</p>}
        {info !== null && <p role="status">{info}</p>}
        {chargement && <p>Chargement des listes…</p>}

        <label htmlFor="selecteur-colonne">Colonne de type liste</label>
        <select
          id="selecteur-colonne"
          value={colonneId}
          onChange={(evenement) => {
            setColonneId(evenement.target.value);
            setInfo(null);
          }}
        >
          {colonnes.map((colonne) => (
            <option key={colonne.id} value={colonne.id}>
              {colonne.label}
            </option>
          ))}
        </select>

        <ul>
          {choix.map((element) => (
            <li key={element.id} data-testid={`choix-${element.id}`}>
              <span data-testid={`pastille-${element.id}`} style={stylePastille(element)}>
                {element.label}
              </span>
              <input
                type="color"
                aria-label={`Couleur de fond de ${element.label}`}
                value={hexPourInput(element.bgColor, FOND_DEFAUT)}
                onChange={(evenement) => majLocale(element.id, { bgColor: evenement.target.value })}
                onBlur={() => {
                  void enregistrerChoix(element.id, { bgColor: element.bgColor });
                }}
              />
              <input
                type="color"
                aria-label={`Couleur du texte de ${element.label}`}
                value={hexPourInput(element.textColor, TEXTE_DEFAUT)}
                onChange={(evenement) => majLocale(element.id, { textColor: evenement.target.value })}
                onBlur={() => {
                  void enregistrerChoix(element.id, { textColor: element.textColor });
                }}
              />
              <label>
                <input
                  type="checkbox"
                  aria-label={`Gras pour ${element.label}`}
                  checked={element.bold}
                  onChange={(evenement) => {
                    const gras = evenement.target.checked;
                    majLocale(element.id, { bold: gras });
                    void enregistrerChoix(element.id, { bold: gras });
                  }}
                />
                Gras
              </label>
              {element.archived && <em> (archivée)</em>}
            </li>
          ))}
        </ul>
      </section>
    );
  }
  ```

- [ ] **Étape 4: relancer le test (PASS)**

  ```bash
  pnpm --filter @suivi/web test -- listes.test.tsx
  ```

  Résultat attendu : **PASS** — 8 tests verts.

- [ ] **Étape 5: commit**

  ```bash
  git add "apps/web/src/app/(app)/parametres/listes.tsx" "apps/web/src/app/(app)/parametres/__tests__/listes.test.tsx"
  git commit -m "feat: onglet listes - selecteur de colonne, pastilles et couleurs"
  ```

> À vérifier à l'exécution : le comportement de `input[type=color]` sous jsdom (certaines versions ne conservent pas la valeur assignée). Si un test de couleur échoue avec une valeur vide, remplacer dans le test `fireEvent.change(champ, { target: { value: '#00ff00' } })` par `fireEvent.input(...)`, sans rien changer au composant.

---

### Task 8.8: Onglet Listes — ajout, renommage propagé, archivage et réordonnancement

**Files:**
- Modify: `apps/web/src/app/(app)/parametres/listes.tsx`
- Test: `apps/web/src/app/(app)/parametres/__tests__/listes.test.tsx`

**Interfaces:**
- Consomme : `POST /api/columns/:id/choices { label, bgColor?, textColor?, bold? }` → `201 ChoiceDTO` (`422` si doublon) ; `PATCH /api/choices/:id { label }` (le serveur met à jour en masse les lignes concernées, en transaction) ; `PATCH /api/choices/:id { archived }` ; `PATCH /api/choices/:id { position }` ; `deplacerElement` de `./colonnes`.
- Produit : libellés accessibles `Renommer le choix <label>`, `Nouveau libellé de <label>`, `Archiver <label>` / `Désarchiver <label>`, formulaire « Ajouter une valeur » ; message de confirmation `Renommage propagé aux lignes existantes.`

- [ ] **Étape 1: écrire les tests qui échouent — ajouter ce `describe` à la fin de `__tests__/listes.test.tsx`**

  ```tsx
  function dataTransferFactice(): DataTransfer {
    const donnees = new Map<string, string>();
    return {
      effectAllowed: 'none',
      dropEffect: 'none',
      setData: (type: string, valeur: string) => {
        donnees.set(type, valeur);
      },
      getData: (type: string) => donnees.get(type) ?? '',
    } as unknown as DataTransfer;
  }

  describe('ListesTab — ajout, renommage, archivage, ordre', () => {
    it('ajoute une valeur via POST /columns/:id/choices', async () => {
      const utilisateur = userEvent.setup();
      const cree = choix({ id: 'ch9', label: 'A RAPPELER', position: 2, bgColor: '#00ff00', textColor: '#000000' });
      apiFetchMock.mockResolvedValueOnce([COLONNE_STATUT]).mockResolvedValueOnce(cree);

      render(<ListesTab />);
      await screen.findByTestId('pastille-ch1');

      await utilisateur.type(screen.getByLabelText('Nouvelle valeur'), 'A RAPPELER');
      fireEvent.change(screen.getByLabelText('Couleur de fond de la nouvelle valeur'), {
        target: { value: '#00ff00' },
      });
      await utilisateur.click(screen.getByRole('button', { name: 'Ajouter la valeur' }));

      await waitFor(() =>
        expect(apiFetchMock).toHaveBeenLastCalledWith('/columns/col-statut/choices', {
          method: 'POST',
          body: JSON.stringify({
            label: 'A RAPPELER',
            bgColor: '#00ff00',
            textColor: '#000000',
            bold: false,
          }),
        }),
      );
      expect(await screen.findByTestId('pastille-ch9')).toHaveTextContent('A RAPPELER');
      expect(screen.getByLabelText('Nouvelle valeur')).toHaveValue('');
    });

    it('refuse un doublon (422) avec un message français', async () => {
      const utilisateur = userEvent.setup();
      apiFetchMock
        .mockResolvedValueOnce([COLONNE_STATUT])
        .mockRejectedValueOnce({ status: 422, code: 'VALIDATION_FAILED', message: 'doublon' });

      render(<ListesTab />);
      await screen.findByTestId('pastille-ch1');

      await utilisateur.type(screen.getByLabelText('Nouvelle valeur'), 'NEW');
      await utilisateur.click(screen.getByRole('button', { name: 'Ajouter la valeur' }));

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Données invalides : vérifiez les champs saisis.',
      );
    });

    it('renomme un choix et annonce la propagation aux lignes', async () => {
      const utilisateur = userEvent.setup();
      apiFetchMock
        .mockResolvedValueOnce([COLONNE_STATUT])
        .mockResolvedValueOnce({ ...NEW, label: 'NOUVEAU' });

      render(<ListesTab />);
      await utilisateur.click(await screen.findByRole('button', { name: 'Renommer le choix NEW' }));

      const champ = screen.getByLabelText('Nouveau libellé de NEW');
      await utilisateur.clear(champ);
      await utilisateur.type(champ, 'NOUVEAU{Enter}');

      await waitFor(() =>
        expect(apiFetchMock).toHaveBeenLastCalledWith('/choices/ch1', {
          method: 'PATCH',
          body: JSON.stringify({ label: 'NOUVEAU' }),
        }),
      );
      expect(await screen.findByRole('status')).toHaveTextContent(
        'Renommage propagé aux lignes existantes.',
      );
      expect(screen.getByTestId('pastille-ch1')).toHaveTextContent('NOUVEAU');
    });

    it('archive puis désarchive un choix', async () => {
      const utilisateur = userEvent.setup();
      apiFetchMock
        .mockResolvedValueOnce([COLONNE_STATUT])
        .mockResolvedValueOnce({ ...NEW, archived: true })
        .mockResolvedValueOnce({ ...NEW, archived: false });

      render(<ListesTab />);
      await utilisateur.click(await screen.findByRole('button', { name: 'Archiver NEW' }));

      await waitFor(() =>
        expect(apiFetchMock).toHaveBeenLastCalledWith('/choices/ch1', {
          method: 'PATCH',
          body: JSON.stringify({ archived: true }),
        }),
      );

      await utilisateur.click(await screen.findByRole('button', { name: 'Désarchiver NEW' }));
      await waitFor(() =>
        expect(apiFetchMock).toHaveBeenLastCalledWith('/choices/ch1', {
          method: 'PATCH',
          body: JSON.stringify({ archived: false }),
        }),
      );
    });

    it('réordonne par glisser-déposer et envoie PATCH { position }', async () => {
      apiFetchMock
        .mockResolvedValueOnce([COLONNE_STATUT])
        .mockResolvedValueOnce({ ...CLOTUREE, position: 0 });

      render(<ListesTab />);
      await screen.findByTestId('pastille-ch1');

      const elements = screen.getAllByTestId(/^choix-/);
      const transfert = dataTransferFactice();
      fireEvent.dragStart(elements[1], { dataTransfer: transfert });
      fireEvent.dragOver(elements[0], { dataTransfer: transfert });
      fireEvent.drop(elements[0], { dataTransfer: transfert });

      await waitFor(() =>
        expect(apiFetchMock).toHaveBeenLastCalledWith('/choices/ch2', {
          method: 'PATCH',
          body: JSON.stringify({ position: 0 }),
        }),
      );
    });
  });
  ```

- [ ] **Étape 2: lancer les tests (échec attendu)**

  ```bash
  pnpm --filter @suivi/web test -- listes.test.tsx
  ```

  Résultat attendu : **FAIL** — `Unable to find a label with the text of: Nouvelle valeur`.

- [ ] **Étape 3: implémenter — états, ajout, renommage, archivage, glisser-déposer**

  Compléter les imports de `listes.tsx` :

  ```tsx
  import { useCallback, useEffect, useState, type CSSProperties, type DragEvent, type FormEvent } from 'react';

  import { deplacerElement, trierParPosition } from './colonnes';
  ```

  Ajouter ces états après `const [info, setInfo] = useState<string | null>(null);` :

  ```tsx
    const [nouveauLabel, setNouveauLabel] = useState('');
    const [nouveauFond, setNouveauFond] = useState(FOND_DEFAUT);
    const [nouveauTexte, setNouveauTexte] = useState(TEXTE_DEFAUT);
    const [nouveauGras, setNouveauGras] = useState(false);
    const [editionId, setEditionId] = useState<string | null>(null);
    const [editionLabel, setEditionLabel] = useState('');
    const [indexGlisse, setIndexGlisse] = useState<number | null>(null);
  ```

  Ajouter ces handlers après `enregistrerChoix` :

  ```tsx
    const ajouterValeur = async (evenement: FormEvent<HTMLFormElement>): Promise<void> => {
      evenement.preventDefault();
      const label = nouveauLabel.trim();
      if (label === '') {
        setErreur('Le libellé de la valeur est obligatoire.');
        return;
      }
      if (colonneId === '') {
        setErreur('Sélectionnez d’abord une colonne de type liste.');
        return;
      }
      try {
        const cree = await apiFetch<ChoiceDTO>(`/columns/${colonneId}/choices`, {
          method: 'POST',
          body: JSON.stringify({
            label,
            bgColor: nouveauFond,
            textColor: nouveauTexte,
            bold: nouveauGras,
          }),
        });
        setColonnes((precedentes) =>
          precedentes.map((colonne) =>
            colonne.id === colonneId ? { ...colonne, choices: [...colonne.choices, cree] } : colonne,
          ),
        );
        setNouveauLabel('');
        setNouveauFond(FOND_DEFAUT);
        setNouveauTexte(TEXTE_DEFAUT);
        setNouveauGras(false);
        setErreur(null);
        setInfo(null);
      } catch (err) {
        setErreur(messageErreurApi(err));
      }
    };

    const demarrerEdition = (element: ChoiceDTO): void => {
      setEditionId(element.id);
      setEditionLabel(element.label);
      setInfo(null);
    };

    const annulerEdition = (): void => {
      setEditionId(null);
      setEditionLabel('');
    };

    const validerEdition = async (element: ChoiceDTO): Promise<void> => {
      const label = editionLabel.trim();
      annulerEdition();
      if (label === '' || label === element.label) {
        return;
      }
      const misAJour = await enregistrerChoix(element.id, { label });
      if (misAJour !== null) {
        setInfo('Renommage propagé aux lignes existantes.');
      }
    };

    const basculerArchivage = async (element: ChoiceDTO): Promise<void> => {
      await enregistrerChoix(element.id, { archived: !element.archived });
    };

    const commencerGlisse = (index: number) => (evenement: DragEvent<HTMLLIElement>): void => {
      setIndexGlisse(index);
      evenement.dataTransfer.effectAllowed = 'move';
      evenement.dataTransfer.setData('text/plain', String(index));
    };

    const survolerGlisse = (evenement: DragEvent<HTMLLIElement>): void => {
      evenement.preventDefault();
      evenement.dataTransfer.dropEffect = 'move';
    };

    const deposer = (index: number) => async (evenement: DragEvent<HTMLLIElement>): Promise<void> => {
      evenement.preventDefault();
      const depuis = indexGlisse ?? Number.parseInt(evenement.dataTransfer.getData('text/plain'), 10);
      setIndexGlisse(null);
      if (Number.isNaN(depuis) || depuis === index) {
        return;
      }
      const reordonnes = deplacerElement(choix, depuis, index);
      setChoix(reordonnes.map((element, rang) => ({ ...element, position: rang })));
      await enregistrerChoix(reordonnes[index].id, { position: index });
    };
  ```

- [ ] **Étape 4: implémenter — rendu de la liste (remplacer intégralement le `<ul>…</ul>`) et formulaire d'ajout**

  ```tsx
        <ul>
          {choix.map((element, index) => (
            <li
              key={element.id}
              data-testid={`choix-${element.id}`}
              draggable
              onDragStart={commencerGlisse(index)}
              onDragOver={survolerGlisse}
              onDrop={(evenement) => {
                void deposer(index)(evenement);
              }}
              onDragEnd={() => setIndexGlisse(null)}
            >
              <span aria-hidden="true" title="Glisser pour réordonner">
                ⠿
              </span>
              <span data-testid={`pastille-${element.id}`} style={stylePastille(element)}>
                {element.label}
              </span>

              {editionId === element.id ? (
                <>
                  <input
                    aria-label={`Nouveau libellé de ${element.label}`}
                    value={editionLabel}
                    autoFocus
                    onChange={(evenement) => setEditionLabel(evenement.target.value)}
                    onKeyDown={(evenement) => {
                      if (evenement.key === 'Enter') {
                        evenement.preventDefault();
                        void validerEdition(element);
                      }
                      if (evenement.key === 'Escape') {
                        evenement.preventDefault();
                        annulerEdition();
                      }
                    }}
                  />
                  <button
                    type="button"
                    aria-label={`Valider le libellé de ${element.label}`}
                    onClick={() => {
                      void validerEdition(element);
                    }}
                  >
                    ✓
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  aria-label={`Renommer le choix ${element.label}`}
                  onClick={() => demarrerEdition(element)}
                >
                  Renommer
                </button>
              )}

              <input
                type="color"
                aria-label={`Couleur de fond de ${element.label}`}
                value={hexPourInput(element.bgColor, FOND_DEFAUT)}
                onChange={(evenement) => majLocale(element.id, { bgColor: evenement.target.value })}
                onBlur={() => {
                  void enregistrerChoix(element.id, { bgColor: element.bgColor });
                }}
              />
              <input
                type="color"
                aria-label={`Couleur du texte de ${element.label}`}
                value={hexPourInput(element.textColor, TEXTE_DEFAUT)}
                onChange={(evenement) => majLocale(element.id, { textColor: evenement.target.value })}
                onBlur={() => {
                  void enregistrerChoix(element.id, { textColor: element.textColor });
                }}
              />
              <label>
                <input
                  type="checkbox"
                  aria-label={`Gras pour ${element.label}`}
                  checked={element.bold}
                  onChange={(evenement) => {
                    const gras = evenement.target.checked;
                    majLocale(element.id, { bold: gras });
                    void enregistrerChoix(element.id, { bold: gras });
                  }}
                />
                Gras
              </label>

              <button
                type="button"
                aria-label={`${element.archived ? 'Désarchiver' : 'Archiver'} ${element.label}`}
                onClick={() => {
                  void basculerArchivage(element);
                }}
              >
                {element.archived ? 'Désarchiver' : 'Archiver'}
              </button>
              {element.archived && <em> (archivée)</em>}
            </li>
          ))}
        </ul>

        <form
          onSubmit={(evenement) => {
            void ajouterValeur(evenement);
          }}
        >
          <h3>Ajouter une valeur</h3>
          <label htmlFor="nouvelle-valeur-label">Nouvelle valeur</label>
          <input
            id="nouvelle-valeur-label"
            value={nouveauLabel}
            onChange={(evenement) => setNouveauLabel(evenement.target.value)}
          />
          <input
            type="color"
            aria-label="Couleur de fond de la nouvelle valeur"
            value={nouveauFond}
            onChange={(evenement) => setNouveauFond(evenement.target.value)}
          />
          <input
            type="color"
            aria-label="Couleur du texte de la nouvelle valeur"
            value={nouveauTexte}
            onChange={(evenement) => setNouveauTexte(evenement.target.value)}
          />
          <label>
            <input
              type="checkbox"
              aria-label="Gras pour la nouvelle valeur"
              checked={nouveauGras}
              onChange={(evenement) => setNouveauGras(evenement.target.checked)}
            />
            Gras
          </label>
          <span data-testid="apercu-nouvelle-valeur" style={stylePastille({ bgColor: nouveauFond, textColor: nouveauTexte, bold: nouveauGras })}>
            {nouveauLabel === '' ? 'Aperçu' : nouveauLabel}
          </span>
          <button type="submit">Ajouter la valeur</button>
        </form>
  ```

- [ ] **Étape 5: relancer les tests (PASS)**

  ```bash
  pnpm --filter @suivi/web test -- listes.test.tsx
  ```

  Résultat attendu : **PASS** — 13 tests verts.

- [ ] **Étape 6: commit**

  ```bash
  git add "apps/web/src/app/(app)/parametres/listes.tsx" "apps/web/src/app/(app)/parametres/__tests__/listes.test.tsx"
  git commit -m "feat: onglet listes - ajout, renommage propage, archivage et ordre"
  ```

---

### Task 8.9: Onglet Listes — suppression d'une valeur et refus `CHOICE_IN_USE`

**Files:**
- Modify: `apps/web/src/app/(app)/parametres/listes.tsx`
- Test: `apps/web/src/app/(app)/parametres/__tests__/listes.test.tsx`

**Interfaces:**
- Consomme : `DELETE /api/choices/:id` → `204` ; `409 CHOICE_IN_USE` si des lignes utilisent la valeur ; `aCodeErreur` et `messageErreurApi` de `./messages`.
- Produit : dialogue `role="dialog"` de confirmation, zone d'erreur interne au dialogue et bouton de repli « Archiver à la place » qui envoie `PATCH /choices/:id { archived: true }`.

- [ ] **Étape 1: écrire les tests qui échouent — ajouter ce `describe` à la fin de `__tests__/listes.test.tsx`**

  ```tsx
  describe('ListesTab — suppression', () => {
    it('supprime une valeur inutilisée après confirmation', async () => {
      const utilisateur = userEvent.setup();
      apiFetchMock.mockResolvedValueOnce([COLONNE_STATUT]).mockResolvedValueOnce(undefined);

      render(<ListesTab />);
      await utilisateur.click(await screen.findByRole('button', { name: 'Supprimer NEW' }));

      const dialogue = screen.getByRole('dialog');
      expect(dialogue).toHaveTextContent('Supprimer la valeur « NEW » ?');
      await utilisateur.click(within(dialogue).getByRole('button', { name: 'Supprimer' }));

      await waitFor(() =>
        expect(apiFetchMock).toHaveBeenLastCalledWith('/choices/ch1', { method: 'DELETE' }),
      );
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(screen.queryByTestId('pastille-ch1')).not.toBeInTheDocument();
    });

    it('sur 409 CHOICE_IN_USE, garde le dialogue ouvert et conseille l’archivage', async () => {
      const utilisateur = userEvent.setup();
      apiFetchMock
        .mockResolvedValueOnce([COLONNE_STATUT])
        .mockRejectedValueOnce({
          status: 409,
          code: 'CHOICE_IN_USE',
          message: 'La valeur est utilisée',
        });

      render(<ListesTab />);
      await utilisateur.click(await screen.findByRole('button', { name: 'Supprimer NEW' }));
      await utilisateur.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Supprimer' }));

      const dialogue = await screen.findByRole('dialog');
      expect(dialogue).toHaveTextContent('utilisée par des lignes existantes');
      expect(dialogue).toHaveTextContent('archivez-la plutôt que de la supprimer');
      expect(screen.getByTestId('pastille-ch1')).toBeInTheDocument();
    });

    it('propose « Archiver à la place » et envoie PATCH { archived: true }', async () => {
      const utilisateur = userEvent.setup();
      apiFetchMock
        .mockResolvedValueOnce([COLONNE_STATUT])
        .mockRejectedValueOnce({ status: 409, code: 'CHOICE_IN_USE', message: 'utilisée' })
        .mockResolvedValueOnce({ ...NEW, archived: true });

      render(<ListesTab />);
      await utilisateur.click(await screen.findByRole('button', { name: 'Supprimer NEW' }));
      await utilisateur.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Supprimer' }));
      await utilisateur.click(
        within(await screen.findByRole('dialog')).getByRole('button', { name: 'Archiver à la place' }),
      );

      await waitFor(() =>
        expect(apiFetchMock).toHaveBeenLastCalledWith('/choices/ch1', {
          method: 'PATCH',
          body: JSON.stringify({ archived: true }),
        }),
      );
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });
  ```

  Compléter les imports du fichier de test :

  ```tsx
  import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
  ```

- [ ] **Étape 2: lancer les tests (échec attendu)**

  ```bash
  pnpm --filter @suivi/web test -- listes.test.tsx
  ```

  Résultat attendu : **FAIL** — `Unable to find an accessible element with the role "button" and name "Supprimer NEW"`.

- [ ] **Étape 3: implémenter — état et handlers de suppression**

  Ajouter dans `listes.tsx`, après la fonction `stylePastille` :

  ```tsx
  interface EtatSuppressionChoix {
    choix: ChoiceDTO;
    messageBlocage: string | null;
  }
  ```

  Ajouter l'état, après `const [indexGlisse, ...]` :

  ```tsx
    const [suppression, setSuppression] = useState<EtatSuppressionChoix | null>(null);
  ```

  Ajouter les handlers, après `deposer` :

  ```tsx
    const confirmerSuppression = async (): Promise<void> => {
      if (suppression === null) {
        return;
      }
      const cible = suppression.choix;
      try {
        await apiFetch<void>(`/choices/${cible.id}`, { method: 'DELETE' });
        setColonnes((precedentes) =>
          precedentes.map((colonne) =>
            colonne.id === cible.columnId
              ? { ...colonne, choices: colonne.choices.filter((element) => element.id !== cible.id) }
              : colonne,
          ),
        );
        setSuppression(null);
        setErreur(null);
      } catch (err) {
        if (aCodeErreur(err, 'CHOICE_IN_USE')) {
          setSuppression({ choix: cible, messageBlocage: messageErreurApi(err) });
          return;
        }
        setErreur(messageErreurApi(err));
        setSuppression(null);
      }
    };

    const archiverAuLieuDeSupprimer = async (): Promise<void> => {
      if (suppression === null) {
        return;
      }
      await enregistrerChoix(suppression.choix.id, { archived: true });
      setSuppression(null);
    };
  ```

  Compléter l'import des messages :

  ```tsx
  import { aCodeErreur, messageErreurApi } from './messages';
  ```

- [ ] **Étape 4: implémenter — bouton et dialogue**

  Ajouter, dans le `<li>` de chaque choix, juste après le bouton « Archiver / Désarchiver » :

  ```tsx
              <button
                type="button"
                aria-label={`Supprimer ${element.label}`}
                onClick={() => setSuppression({ choix: element, messageBlocage: null })}
              >
                Supprimer
              </button>
  ```

  Ajouter, juste avant la balise fermante `</section>` :

  ```tsx
        {suppression !== null && (
          <div role="dialog" aria-modal="true" aria-label="Confirmer la suppression de la valeur">
            <p>Supprimer la valeur « {suppression.choix.label} » ?</p>
            {suppression.messageBlocage === null ? (
              <p>Cette action est définitive et ne peut pas être annulée.</p>
            ) : (
              <p role="alert">{suppression.messageBlocage}</p>
            )}
            <button type="button" onClick={() => setSuppression(null)}>
              Annuler
            </button>
            {suppression.messageBlocage === null ? (
              <button
                type="button"
                onClick={() => {
                  void confirmerSuppression();
                }}
              >
                Supprimer
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  void archiverAuLieuDeSupprimer();
                }}
              >
                Archiver à la place
              </button>
            )}
          </div>
        )}
  ```

- [ ] **Étape 5: relancer les tests (PASS)**

  ```bash
  pnpm --filter @suivi/web test -- listes.test.tsx
  ```

  Résultat attendu : **PASS** — 16 tests verts.

- [ ] **Étape 6: commit**

  ```bash
  git add "apps/web/src/app/(app)/parametres/listes.tsx" "apps/web/src/app/(app)/parametres/__tests__/listes.test.tsx"
  git commit -m "feat: onglet listes - suppression avec refus CHOICE_IN_USE et repli archivage"
  ```

---

### Task 8.10: Onglet Équipe — membres, ajout (`VALIDATION_FAILED`) et « mon profil »

**Files:**
- Modify: `apps/web/src/app/(app)/parametres/equipe.tsx`
- Test: `apps/web/src/app/(app)/parametres/__tests__/equipe.test.tsx`

**Interfaces:**
- Consomme : `GET /api/users` → `UserDTO[]` ; `GET /api/auth/me` → `{ user: UserDTO }` ; `POST /api/users { email, displayName, password, cursorColor }` → `201 UserDTO` (`422 VALIDATION_FAILED` si email dupliqué) ; `PATCH /api/users/me { displayName?, cursorColor?, password? }` → `200 UserDTO`.
- Produit :
  - `export const COULEUR_CURSEUR_DEFAUT = '#3498db'` ;
  - `export function initiales(nom: string): string` ;
  - `EquipeTab` avec un avatar `data-testid="avatar-<id>"` par membre, le formulaire d'ajout et le formulaire « Mon profil ».

- [ ] **Étape 1: écrire le test qui échoue — `apps/web/src/app/(app)/parametres/__tests__/equipe.test.tsx`**

  ```tsx
  import { render, screen, waitFor } from '@testing-library/react';
  import userEvent from '@testing-library/user-event';
  import type { UserDTO } from '@suivi/shared';
  import { beforeEach, describe, expect, it, vi } from 'vitest';

  vi.mock('../../../../lib/api', () => ({ apiFetch: vi.fn() }));

  import { apiFetch } from '../../../../lib/api';
  import EquipeTab, { initiales } from '../equipe';

  const apiFetchMock = vi.mocked(apiFetch);

  const QUENTIN: UserDTO = {
    id: 'u1',
    email: 'quentin.durant49@orange.fr',
    displayName: 'Quentin Durant',
    cursorColor: '#3498db',
  };
  const LAURENT: UserDTO = {
    id: 'u2',
    email: 'laurent@example.fr',
    displayName: 'Laurent',
    cursorColor: '#e74c3c',
  };

  function chargementReussi(): void {
    apiFetchMock.mockResolvedValueOnce([QUENTIN, LAURENT]).mockResolvedValueOnce({ user: QUENTIN });
  }

  beforeEach(() => {
    apiFetchMock.mockReset();
  });

  describe('EquipeTab', () => {
    it('initiales gère un nom, deux mots et une chaîne vide', () => {
      expect(initiales('Quentin Durant')).toBe('QD');
      expect(initiales('Laurent')).toBe('LA');
      expect(initiales('   ')).toBe('?');
    });

    it('affiche les membres avec leur avatar coloré et leur email', async () => {
      chargementReussi();

      render(<EquipeTab />);

      expect(await screen.findByText('Laurent')).toBeInTheDocument();
      expect(screen.getByText('laurent@example.fr')).toBeInTheDocument();
      expect(screen.getByTestId('avatar-u2')).toHaveStyle({ backgroundColor: '#e74c3c' });
      expect(screen.getByTestId('avatar-u1')).toHaveTextContent('QD');
      expect(apiFetchMock).toHaveBeenNthCalledWith(1, '/users');
      expect(apiFetchMock).toHaveBeenNthCalledWith(2, '/auth/me');
    });

    it('ajoute un membre via POST /users', async () => {
      const utilisateur = userEvent.setup();
      chargementReussi();
      apiFetchMock.mockResolvedValueOnce({
        id: 'u3',
        email: 'marco@example.fr',
        displayName: 'Marco',
        cursorColor: '#2ecc71',
      });

      render(<EquipeTab />);
      await screen.findByText('Laurent');

      await utilisateur.type(screen.getByLabelText('Email'), 'marco@example.fr');
      await utilisateur.type(screen.getByLabelText('Nom affiché'), 'Marco');
      await utilisateur.type(screen.getByLabelText('Mot de passe initial'), 'motdepasse1');
      await utilisateur.click(screen.getByRole('button', { name: 'Ajouter le membre' }));

      await waitFor(() =>
        expect(apiFetchMock).toHaveBeenLastCalledWith('/users', {
          method: 'POST',
          body: JSON.stringify({
            email: 'marco@example.fr',
            displayName: 'Marco',
            password: 'motdepasse1',
            cursorColor: '#3498db',
          }),
        }),
      );
      expect(await screen.findByText('Marco')).toBeInTheDocument();
      expect(screen.getByRole('status')).toHaveTextContent('Membre « Marco » ajouté.');
    });

    it('refuse un mot de passe trop court sans appeler l’API', async () => {
      const utilisateur = userEvent.setup();
      chargementReussi();

      render(<EquipeTab />);
      await screen.findByText('Laurent');

      await utilisateur.type(screen.getByLabelText('Email'), 'marco@example.fr');
      await utilisateur.type(screen.getByLabelText('Nom affiché'), 'Marco');
      await utilisateur.type(screen.getByLabelText('Mot de passe initial'), 'court');
      await utilisateur.click(screen.getByRole('button', { name: 'Ajouter le membre' }));

      expect(screen.getByRole('alert')).toHaveTextContent(
        'Le mot de passe initial doit contenir au moins 8 caractères.',
      );
      expect(apiFetchMock).toHaveBeenCalledTimes(2);
    });

    it('traduit un 422 VALIDATION_FAILED en conseil sur l’email déjà utilisé', async () => {
      const utilisateur = userEvent.setup();
      chargementReussi();
      apiFetchMock.mockRejectedValueOnce({
        status: 422,
        code: 'VALIDATION_FAILED',
        message: 'email déjà utilisé',
      });

      render(<EquipeTab />);
      await screen.findByText('Laurent');

      await utilisateur.type(screen.getByLabelText('Email'), 'laurent@example.fr');
      await utilisateur.type(screen.getByLabelText('Nom affiché'), 'Laurent bis');
      await utilisateur.type(screen.getByLabelText('Mot de passe initial'), 'motdepasse1');
      await utilisateur.click(screen.getByRole('button', { name: 'Ajouter le membre' }));

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'cette adresse email est peut-être déjà utilisée',
      );
    });

    it('enregistre le profil sans mot de passe quand le champ est vide', async () => {
      const utilisateur = userEvent.setup();
      chargementReussi();
      apiFetchMock.mockResolvedValueOnce({ ...QUENTIN, displayName: 'Quentin D.' });

      render(<EquipeTab />);
      const champ = await screen.findByLabelText('Mon nom affiché');
      await utilisateur.clear(champ);
      await utilisateur.type(champ, 'Quentin D.');
      await utilisateur.click(screen.getByRole('button', { name: 'Enregistrer mon profil' }));

      await waitFor(() =>
        expect(apiFetchMock).toHaveBeenLastCalledWith('/users/me', {
          method: 'PATCH',
          body: JSON.stringify({ displayName: 'Quentin D.', cursorColor: '#3498db' }),
        }),
      );
      expect(screen.getByRole('status')).toHaveTextContent('Profil enregistré.');
    });

    it('envoie le nouveau mot de passe quand il est saisi et confirmé', async () => {
      const utilisateur = userEvent.setup();
      chargementReussi();
      apiFetchMock.mockResolvedValueOnce(QUENTIN);

      render(<EquipeTab />);
      await screen.findByLabelText('Mon nom affiché');

      await utilisateur.type(screen.getByLabelText('Nouveau mot de passe'), 'nouveaumdp1');
      await utilisateur.type(screen.getByLabelText('Confirmation du nouveau mot de passe'), 'nouveaumdp1');
      await utilisateur.click(screen.getByRole('button', { name: 'Enregistrer mon profil' }));

      await waitFor(() =>
        expect(apiFetchMock).toHaveBeenLastCalledWith('/users/me', {
          method: 'PATCH',
          body: JSON.stringify({
            displayName: 'Quentin Durant',
            cursorColor: '#3498db',
            password: 'nouveaumdp1',
          }),
        }),
      );
    });

    it('refuse deux mots de passe différents', async () => {
      const utilisateur = userEvent.setup();
      chargementReussi();

      render(<EquipeTab />);
      await screen.findByLabelText('Mon nom affiché');

      await utilisateur.type(screen.getByLabelText('Nouveau mot de passe'), 'nouveaumdp1');
      await utilisateur.type(screen.getByLabelText('Confirmation du nouveau mot de passe'), 'nouveaumdp2');
      await utilisateur.click(screen.getByRole('button', { name: 'Enregistrer mon profil' }));

      expect(screen.getByRole('alert')).toHaveTextContent(
        'Les deux mots de passe ne correspondent pas.',
      );
      expect(apiFetchMock).toHaveBeenCalledTimes(2);
    });
  });
  ```

- [ ] **Étape 2: lancer le test (échec attendu)**

  ```bash
  pnpm --filter @suivi/web test -- equipe.test.tsx
  ```

  Résultat attendu : **FAIL** — `does not provide an export named 'initiales'`.

- [ ] **Étape 3: implémenter — contenu complet de `apps/web/src/app/(app)/parametres/equipe.tsx`**

  ```tsx
  'use client';

  import type { UserDTO } from '@suivi/shared';
  import { useCallback, useEffect, useState, type FormEvent } from 'react';

  import { apiFetch } from '../../../lib/api';
  import { aCodeErreur, messageErreurApi } from './messages';

  export const COULEUR_CURSEUR_DEFAUT = '#3498db';

  export function initiales(nom: string): string {
    const mots = nom.trim().split(/\s+/).filter((mot) => mot.length > 0);
    if (mots.length === 0) {
      return '?';
    }
    if (mots.length === 1) {
      return mots[0].slice(0, 2).toUpperCase();
    }
    return `${mots[0].charAt(0)}${mots[1].charAt(0)}`.toUpperCase();
  }

  export default function EquipeTab() {
    const [membres, setMembres] = useState<UserDTO[]>([]);
    const [moi, setMoi] = useState<UserDTO | null>(null);
    const [erreur, setErreur] = useState<string | null>(null);
    const [info, setInfo] = useState<string | null>(null);

    const [email, setEmail] = useState('');
    const [nom, setNom] = useState('');
    const [motDePasse, setMotDePasse] = useState('');
    const [couleur, setCouleur] = useState(COULEUR_CURSEUR_DEFAUT);

    const [profilNom, setProfilNom] = useState('');
    const [profilCouleur, setProfilCouleur] = useState(COULEUR_CURSEUR_DEFAUT);
    const [profilMotDePasse, setProfilMotDePasse] = useState('');
    const [profilConfirmation, setProfilConfirmation] = useState('');

    const charger = useCallback(async (): Promise<void> => {
      try {
        const liste = await apiFetch<UserDTO[]>('/users');
        setMembres(liste);
        const session = await apiFetch<{ user: UserDTO }>('/auth/me');
        setMoi(session.user);
        setProfilNom(session.user.displayName);
        setProfilCouleur(session.user.cursorColor.toLowerCase());
        setErreur(null);
      } catch (err) {
        setErreur(messageErreurApi(err));
      }
    }, []);

    useEffect(() => {
      void charger();
    }, [charger]);

    const ajouterMembre = async (evenement: FormEvent<HTMLFormElement>): Promise<void> => {
      evenement.preventDefault();
      setInfo(null);
      if (!email.includes('@')) {
        setErreur('Saisissez une adresse email valide.');
        return;
      }
      if (nom.trim() === '') {
        setErreur('Le nom affiché est obligatoire.');
        return;
      }
      if (motDePasse.length < 8) {
        setErreur('Le mot de passe initial doit contenir au moins 8 caractères.');
        return;
      }
      try {
        const cree = await apiFetch<UserDTO>('/users', {
          method: 'POST',
          body: JSON.stringify({
            email: email.trim(),
            displayName: nom.trim(),
            password: motDePasse,
            cursorColor: couleur,
          }),
        });
        setMembres((precedents) => [...precedents, cree]);
        setEmail('');
        setNom('');
        setMotDePasse('');
        setCouleur(COULEUR_CURSEUR_DEFAUT);
        setErreur(null);
        setInfo(`Membre « ${cree.displayName} » ajouté.`);
      } catch (err) {
        if (aCodeErreur(err, 'VALIDATION_FAILED')) {
          setErreur(
            'Impossible d’ajouter ce membre : cette adresse email est peut-être déjà utilisée, ou un champ est invalide.',
          );
          return;
        }
        setErreur(messageErreurApi(err));
      }
    };

    const enregistrerProfil = async (evenement: FormEvent<HTMLFormElement>): Promise<void> => {
      evenement.preventDefault();
      setInfo(null);
      if (profilNom.trim() === '') {
        setErreur('Le nom affiché est obligatoire.');
        return;
      }
      if (profilMotDePasse !== '' && profilMotDePasse.length < 8) {
        setErreur('Le nouveau mot de passe doit contenir au moins 8 caractères.');
        return;
      }
      if (profilMotDePasse !== profilConfirmation) {
        setErreur('Les deux mots de passe ne correspondent pas.');
        return;
      }
      const corps: { displayName: string; cursorColor: string; password?: string } = {
        displayName: profilNom.trim(),
        cursorColor: profilCouleur,
      };
      if (profilMotDePasse !== '') {
        corps.password = profilMotDePasse;
      }
      try {
        const misAJour = await apiFetch<UserDTO>('/users/me', {
          method: 'PATCH',
          body: JSON.stringify(corps),
        });
        setMoi(misAJour);
        setMembres((precedents) =>
          precedents.map((membre) => (membre.id === misAJour.id ? misAJour : membre)),
        );
        setProfilMotDePasse('');
        setProfilConfirmation('');
        setErreur(null);
        setInfo('Profil enregistré.');
      } catch (err) {
        setErreur(messageErreurApi(err));
      }
    };

    return (
      <section aria-label="Équipe">
        {erreur !== null && <p role="alert">{erreur}</p>}
        {info !== null && <p role="status">{info}</p>}

        <h3>Membres</h3>
        <ul>
          {membres.map((membre) => (
            <li key={membre.id}>
              <span
                data-testid={`avatar-${membre.id}`}
                aria-hidden="true"
                style={{
                  backgroundColor: membre.cursorColor,
                  color: '#ffffff',
                  display: 'inline-block',
                  width: '2rem',
                  height: '2rem',
                  lineHeight: '2rem',
                  textAlign: 'center',
                  borderRadius: '50%',
                }}
              >
                {initiales(membre.displayName)}
              </span>
              <strong>{membre.displayName}</strong>
              <span>{membre.email}</span>
              {moi !== null && moi.id === membre.id && <em> (vous)</em>}
            </li>
          ))}
        </ul>

        <form
          onSubmit={(evenement) => {
            void ajouterMembre(evenement);
          }}
        >
          <h3>Ajouter un membre</h3>
          <label htmlFor="membre-email">Email</label>
          <input
            id="membre-email"
            type="email"
            value={email}
            onChange={(evenement) => setEmail(evenement.target.value)}
          />
          <label htmlFor="membre-nom">Nom affiché</label>
          <input id="membre-nom" value={nom} onChange={(evenement) => setNom(evenement.target.value)} />
          <label htmlFor="membre-mdp">Mot de passe initial</label>
          <input
            id="membre-mdp"
            type="password"
            value={motDePasse}
            onChange={(evenement) => setMotDePasse(evenement.target.value)}
          />
          <label htmlFor="membre-couleur">Couleur du curseur</label>
          <input
            id="membre-couleur"
            type="color"
            value={couleur}
            onChange={(evenement) => setCouleur(evenement.target.value)}
          />
          <button type="submit">Ajouter le membre</button>
        </form>

        <form
          onSubmit={(evenement) => {
            void enregistrerProfil(evenement);
          }}
        >
          <h3>Mon profil</h3>
          <label htmlFor="profil-nom">Mon nom affiché</label>
          <input
            id="profil-nom"
            value={profilNom}
            onChange={(evenement) => setProfilNom(evenement.target.value)}
          />
          <label htmlFor="profil-couleur">Ma couleur de curseur</label>
          <input
            id="profil-couleur"
            type="color"
            value={profilCouleur}
            onChange={(evenement) => setProfilCouleur(evenement.target.value)}
          />
          <label htmlFor="profil-mdp">Nouveau mot de passe</label>
          <input
            id="profil-mdp"
            type="password"
            value={profilMotDePasse}
            onChange={(evenement) => setProfilMotDePasse(evenement.target.value)}
          />
          <label htmlFor="profil-mdp-confirmation">Confirmation du nouveau mot de passe</label>
          <input
            id="profil-mdp-confirmation"
            type="password"
            value={profilConfirmation}
            onChange={(evenement) => setProfilConfirmation(evenement.target.value)}
          />
          <button type="submit">Enregistrer mon profil</button>
        </form>
      </section>
    );
  }
  ```

- [ ] **Étape 4: relancer le test (PASS)**

  ```bash
  pnpm --filter @suivi/web test -- equipe.test.tsx
  ```

  Résultat attendu : **PASS** — 8 tests verts.

- [ ] **Étape 5: commit**

  ```bash
  git add "apps/web/src/app/(app)/parametres/equipe.tsx" "apps/web/src/app/(app)/parametres/__tests__/equipe.test.tsx"
  git commit -m "feat: onglet equipe - membres, ajout et mon profil"
  ```

> À vérifier à l'exécution : la longueur minimale du mot de passe imposée par `createUserSchema` / `updateMeSchema` (`@suivi/shared`, Feature 1). Si le schéma zod exige une autre valeur que 8, aligner les deux contrôles clients et les messages de cette tâche sur cette valeur.

---

### Task 8.11: Test Playwright — renommer un choix de statut et changer sa couleur, vérifiés dans la grille

**Files:**
- Create: `apps/web/e2e/parametres.spec.ts`
- Test: `pnpm --filter @suivi/web test:e2e -- parametres.spec.ts`

**Interfaces:**
- Consomme : la stack complète en marche (API `:3001` + web `:3000` + base seedée) ; `POST /api/auth/login`, `GET /api/columns`, `POST /api/columns/:id/choices`, `POST /api/rows`, `PATCH /api/rows/:id`, `DELETE /api/rows/:id`, `DELETE /api/choices/:id` ; la grille de la Feature 6 qui rend les cellules de type liste avec la couleur du choix.
- Produit : le scénario de non-régression du périmètre — un renommage et un changement de couleur faits dans `/parametres` sont visibles dans la grille.

**Prérequis d'exécution** (trois terminaux, avant de lancer le test) :

```bash
docker compose -f docker-compose.dev.yml up -d
pnpm --filter @suivi/api exec prisma migrate deploy && pnpm --filter @suivi/api exec prisma db seed
pnpm --filter @suivi/api start:dev      # terminal 2 — port 3001
pnpm --filter @suivi/web dev            # terminal 3 — port 3000
```

- [ ] **Étape 1: écrire le test qui échoue — `apps/web/e2e/parametres.spec.ts`**

  ```ts
  import { expect, test } from '@playwright/test';

  const API = process.env.E2E_API_URL ?? 'http://localhost:3001';
  const EMAIL = process.env.E2E_EMAIL ?? 'quentin.durant49@orange.fr';
  const MOT_DE_PASSE = process.env.E2E_PASSWORD ?? 'changeme';

  const MOIS_COURANT = new Date().toISOString().slice(0, 7);

  interface ColonneLegere {
    id: string;
    key: string;
  }

  test.describe('Paramètres — listes & couleurs', () => {
    test('renommer un choix de statut et changer sa couleur se répercute dans la grille', async ({
      page,
    }) => {
      // 1. Session : le cookie est posé pour l'hôte « localhost », donc valable
      //    pour le front (:3000) comme pour l'API (:3001).
      const connexion = await page.request.post(`${API}/api/auth/login`, {
        data: { email: EMAIL, password: MOT_DE_PASSE },
      });
      expect(connexion.ok(), 'connexion avec l’utilisateur du seed').toBeTruthy();

      // 2. Jeu de données dédié au test (aucune donnée du seed n'est modifiée).
      const colonnes = (await (await page.request.get(`${API}/api/columns`)).json()) as ColonneLegere[];
      const statut = colonnes.find((colonne) => colonne.key === 'statut');
      if (statut === undefined) {
        throw new Error('Colonne « statut » absente : lancer `prisma db seed` avant le test.');
      }

      const choix = (await (
        await page.request.post(`${API}/api/columns/${statut.id}/choices`, {
          data: { label: 'E2E AVANT', bgColor: '#ffcc00', textColor: '#000000', bold: false },
        })
      ).json()) as { id: string };

      const ligne = (await (
        await page.request.post(`${API}/api/rows`, { data: { month: MOIS_COURANT } })
      ).json()) as { id: string; version: number };

      await page.request.patch(`${API}/api/rows/${ligne.id}`, {
        data: { expectedVersion: ligne.version, patch: { statut: 'E2E AVANT' } },
      });

      try {
        // 3. Renommage depuis les paramètres.
        await page.goto('/parametres');
        await page.getByRole('tab', { name: 'Listes & couleurs' }).click();
        await page.getByLabel('Colonne de type liste').selectOption({ label: 'INSTALLATION' });

        await page.getByRole('button', { name: 'Renommer le choix E2E AVANT' }).click();
        const champ = page.getByLabel('Nouveau libellé de E2E AVANT');
        await champ.fill('E2E APRES');
        await champ.press('Enter');
        await expect(page.getByText('Renommage propagé aux lignes existantes.')).toBeVisible();

        // 4. Nouvelle couleur de fond : la pastille se met à jour tout de suite.
        const fond = page.getByLabel('Couleur de fond de E2E APRES');
        await fond.fill('#008000');
        await fond.blur();
        await expect(page.getByTestId(`pastille-${choix.id}`)).toHaveCSS(
          'background-color',
          'rgb(0, 128, 0)',
        );

        // 5. Retour à la grille : valeur renommée ET couleur appliquées.
        await page.goto('/');
        const cellule = page.getByText('E2E APRES').first();
        await expect(cellule).toBeVisible();

        const couleurRendue = await cellule.evaluate((element) => {
          let noeud: HTMLElement | null = element as HTMLElement;
          while (noeud !== null) {
            const fondCalcule = window.getComputedStyle(noeud).backgroundColor;
            if (fondCalcule !== 'rgba(0, 0, 0, 0)' && fondCalcule !== 'transparent') {
              return fondCalcule;
            }
            noeud = noeud.parentElement;
          }
          return '';
        });
        expect(couleurRendue).toBe('rgb(0, 128, 0)');
      } finally {
        // 6. Nettoyage : la ligne d'abord (sinon DELETE /choices renvoie 409 CHOICE_IN_USE).
        await page.request.delete(`${API}/api/rows/${ligne.id}`);
        await page.request.delete(`${API}/api/choices/${choix.id}`);
      }
    });
  });
  ```

- [ ] **Étape 2: lancer le test (échec attendu)**

  ```bash
  pnpm --filter @suivi/web test:e2e -- parametres.spec.ts
  ```

  Résultat attendu : **FAIL** au premier lancement tant que `/parametres` n'est pas atteignable dans l'application en marche — typiquement `Timeout ... waiting for getByRole('tab', { name: 'Listes & couleurs' })` si les serveurs ne tournent pas, ou une erreur de connexion `ECONNREFUSED` sur `:3001`.

- [ ] **Étape 3: démarrer la stack et corriger ce que le test révèle**

  Lancer les trois commandes des prérequis ci-dessus, puis relancer :

  ```bash
  pnpm --filter @suivi/web test:e2e -- parametres.spec.ts
  ```

  Les seules corrections autorisées ici sont côté `apps/web/src/app/(app)/parametres/*` (libellés accessibles, `data-testid`) : ni l'API ni la grille ne doivent être modifiées depuis cette branche. Si le test échoue sur la couleur rendue dans la grille, vérifier d'abord dans l'inspecteur quel élément porte le fond (cellule AG Grid ou `<span>` interne) — la boucle de remontée du DOM ci-dessus couvre les deux cas.

- [ ] **Étape 4: relancer le test (PASS)**

  ```bash
  pnpm --filter @suivi/web test:e2e -- parametres.spec.ts
  ```

  Résultat attendu : **PASS** — `1 passed`. Vérifier ensuite en base que le nettoyage a bien eu lieu :

  ```bash
  pnpm --filter @suivi/api exec prisma studio
  ```

  Résultat attendu : aucun `Choice` nommé `E2E AVANT` ou `E2E APRES`, et 83 choix comme après le seed.

- [ ] **Étape 5: commit**

  ```bash
  git add apps/web/e2e/parametres.spec.ts
  git commit -m "test: e2e playwright renommage et couleur d'un choix visibles dans la grille"
  ```

> À vérifier à l'exécution : (1) `locator.fill()` sur un `input[type=color]` — si Playwright refuse, remplacer par `await fond.evaluate((element: HTMLInputElement) => { element.value = '#008000'; element.dispatchEvent(new Event('input', { bubbles: true })); element.dispatchEvent(new Event('change', { bubbles: true })); });` ; (2) la politique CORS de l'API pour `page.request` (le cookie est posé sur l'hôte `localhost`, indépendamment du port — si le cookie porte l'attribut `SameSite=Strict` et n'est pas renvoyé, lancer le test avec `E2E_API_URL` pointant vers le reverse proxy plutôt que vers `:3001`).

---

### Task 8.12: Vérification complète du périmètre et fin de feature (merge dans `develop`)

**Files:**
- Modify: aucun (tâche de vérification et d'intégration)
- Test: toute la suite web + la suite API de régression

**Interfaces:**
- Consomme : l'ensemble des tâches 8.1 à 8.11.
- Produit : `develop` contenant la page `/parametres` complète et testée.

- [ ] **Étape 1: lancer tous les tests unitaires du périmètre**

  ```bash
  pnpm --filter @suivi/web test
  ```

  Résultat attendu : **PASS** — 5 fichiers de test et 53 tests verts : `messages` 8, `page` 2, `colonnes` 19 (6 + 6 + 3 + 4), `listes` 16 (8 + 5 + 3), `equipe` 8. Aucun test ignoré (`skipped`).

- [ ] **Étape 2: vérifier la non-régression de l'API consommée**

  ```bash
  pnpm --filter @suivi/api test
  pnpm --filter @suivi/api test:e2e
  ```

  Résultat attendu : **PASS** — cette feature ne touche pas `apps/api`, les suites des Features 1 à 5 doivent rester intégralement vertes.

- [ ] **Étape 3: typage strict, lint et build de production**

  ```bash
  pnpm lint
  pnpm --filter @suivi/web build
  ```

  Résultat attendu : lint exit 0 ; `Compiled successfully` avec la route `/parametres` listée comme route dynamique du groupe `(app)`.

- [ ] **Étape 4: relancer le test de bout en bout**

  ```bash
  pnpm --filter @suivi/web test:e2e
  ```

  Résultat attendu : **PASS** — `1 passed` (stack démarrée selon les prérequis de la Task 8.11).

- [ ] **Étape 5: vérification manuelle de la diffusion `config.changed`**

  Ouvrir deux navigateurs connectés (ou deux profils). Dans le premier, aller sur `/parametres` → onglet « Listes & couleurs » → changer la couleur de fond d'un statut. Dans le second, resté sur la grille du mois courant :

  Résultat attendu : la couleur des cellules concernées change **sans rechargement** (l'API a émis `config.changed { scope: 'choices' }`, la Feature 7 recharge la config). Si rien ne bouge, le défaut est côté Feature 5 (Task 5.6, `RealtimeEmitter.emitConfigChanged` branché dans `ColumnsService` / `ChoicesService` / `UsersService` — émission) ou Feature 7 (abonnement) — **pas** dans cette feature, qui n'écrit aucun code socket : le noter et ne pas corriger ici.

- [ ] **Étape 6: merger dans `develop` et pousser**

  ```bash
  git checkout develop && git merge --no-ff feature/settings-ui -m "merge: feature/settings-ui"
  git push origin develop
  ```

  Résultat attendu : merge commit créé sur `develop`, push accepté. Aucun commit n'a été fait directement sur `develop`.

---

## Récapitulatif de ce que les features suivantes peuvent utiliser

| Élément | Où | Signature |
|---|---|---|
| Traduction des erreurs | `apps/web/src/app/(app)/parametres/messages.ts` | `estErreurApi(err: unknown): err is ErreurApi` · `aCodeErreur(err: unknown, code: ErrorCode): boolean` · `messageErreurApi(err: unknown): string` |
| Page des paramètres | `apps/web/src/app/(app)/parametres/page.tsx` | `export type OngletParametres = 'colonnes' \| 'listes' \| 'equipe'` · `export default ParametresPage` |
| Utilitaires de liste | `apps/web/src/app/(app)/parametres/colonnes.tsx` | `TYPES_COLONNE: { valeur: ColumnType; libelle: string }[]` · `trierParPosition<T extends { position: number }>(items: readonly T[]): T[]` · `deplacerElement<T>(items: readonly T[], depuis: number, vers: number): T[]` |
| Rendu d'un choix coloré | `apps/web/src/app/(app)/parametres/listes.tsx` | `FOND_DEFAUT` · `TEXTE_DEFAUT` · `hexPourInput(hex: string \| null, defaut: string): string` · `stylePastille(choix: Pick<ChoiceDTO, 'bgColor' \| 'textColor' \| 'bold'>): CSSProperties` |
| Avatar d'un membre | `apps/web/src/app/(app)/parametres/equipe.tsx` | `COULEUR_CURSEUR_DEFAUT` · `initiales(nom: string): string` |
| Harnais de test web | `apps/web/vitest.config.ts`, `apps/web/vitest.setup.ts` (Feature 6, élargis ici) · `apps/web/playwright.config.ts` (Feature 2, inchangé) | `pnpm --filter @suivi/web test` · `pnpm --filter @suivi/web test:e2e` |

