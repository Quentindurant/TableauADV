# Section 09 — Import du classeur Zoho

> Références obligatoires : `docs/superpowers/specs/2026-08-10-suivi-commandes-design.md`
> et `docs/superpowers/plans/sections/_contracts.md`. Aucun nom (package, clé de
> colonne, fichier, script) ne doit dévier des contrats.

## Feature 9 — Import du classeur Zoho (branche `feature/import-xlsx`)

**But:** transformer le classeur Zoho « TABLEAU SUIVI COMMANDES 2026 » en contenu de base de données — réparation du XML non standard, création des 16 colonnes (largeurs lues du fichier) et de leurs listes colorées, puis import de toutes les feuilles mensuelles et de la feuille d'archives, avec un rapport console détaillé et un import rejouable.

**Dépend de:**

- **Feature 0 (scaffold)** — monorepo pnpm, `@suivi/api` avec jest unitaire (`rootDir: src`, `moduleNameMapper` `@suivi/shared`) et jest e2e (`apps/api/test/jest-e2e.json`), scripts `test`, `test:unit`, `test:e2e`.
- **Feature 1 (db-schema)** — schéma Prisma migré (`Column`, `Choice`, `Row`, `RowEvent`, `User`), `@suivi/shared` lié à l'API et exportant `pastelFor(label: string): { bg: string; text: string }`, `ts-node` installé dans `@suivi/api`.

Aucune dépendance vers les Features 2 à 8 : l'import est un script CLI autonome, il n'utilise ni NestJS, ni le gateway temps réel.

---

### Analyse préalable du fichier réel (à lire avant de coder)

Le classeur de référence est `/home/dev/Téléchargements/TABLEAU SUIVI COMMANDES 2026(1).xlsx`. Son inspection donne 21 feuilles :

| Feuille | Traitement |
|---|---|
| `MARS 2025`, `AVRIL 2025`, `MAI 2025`, `JUIN 2025`, `JUILLET 2025`, `AOUT 2025`, `SEPTEMBRE 2025`, `OCTOBRE 2025`, `NOVEMBRE 2025`, `DECEMBRE 2025`, `JANVIER 26`, `FEVRIER 26`, `MARS 26`, `AVRIL 26`, `MAI 26`, `JUIN 26`, `JUILLET 2026`, `AOUT 2026` | 18 feuilles mensuelles importées |
| `ARCHIVES OK ` (noter l'espace final) | importée avec `archived = true` |
| `TEST`, `Feuille1` | ignorées (`sheetNameToMonth` renvoie `null`) |

**Écart assumé par rapport à une lecture positionnelle A..P.** L'ordre A..P de la spec §2.1 (`IMPE, CLIENT, DPT, CP CLIENT, PARTE, DATE, PORTA…, HEURE, TECH, NOM TECH, NOM CP, INSTALLATION, COMMENTAIRES PLANIF, MATERIEL RECU, N° CHRONO, INFOS FACTURATION`) n'est respecté à la lettre que par `JUILLET 2026` et `AOUT 2026`. Les en-têtes réels des autres feuilles divergent, vérifiés dans le fichier :

- `MARS 2025` / `AVRIL 2025` : `DATE CDE, CLIENT, PARTENAIRE, DATES, HEURE, TECH, NOM TECH, NOM CP, STATUT, COMMENTAIRES PLANIF, DERNIERE ADV, MATERIEL RECU, N° CHRONO, SUIVI LIENS, CR ET PV ENVOYES ET CLASSES` (pas de `DPT`, pas de `CP CLIENT`) ;
- `JUIN 2025` → `SEPTEMBRE 2025` : `IMPERATIF ACTION` / `IMPER` en A, `PORTA PREVUE LE` en E ;
- `NOVEMBRE 2025` → `MAI 26` : colonnes `COLLECTE` et `MESSAGE` intercalées, en-tête `STATUT` ou `INSTALLATION` selon la feuille, `CLIENTS` au pluriel ;
- `ARCHIVES OK ` : ligne 1 quasi vide (seule la colonne C porte `PARTENAIRE`), 30 lignes de données réparties de A à O.

Importer ces feuilles en positionnel écrirait par exemple le partenaire dans `dpt`. **Le mapping est donc piloté par la ligne d'en-tête réelle de chaque feuille** (table d'alias vers les clés du contrat), l'ordre A..P de la spec §2.1 restant l'ordre canonique des 16 colonnes créées en base. Toute colonne dont l'en-tête n'est pas reconnue (ou dont la clé est déjà prise) est **concaténée dans `commentaires_planif`** sous la forme `EN-TÊTE: valeur`, exactement la règle prévue pour `ARCHIVES OK` — rien n'est perdu et l'anomalie est consignée dans le rapport.

### Contraintes d'exécution

- Les tests e2e de cette feature **purgent** `RowEvent`, `Row`, `Choice` et `Column` (jamais `User`). Ne jamais les lancer sur une base contenant des données réelles : utiliser la base de dev (`DATABASE_URL` de `apps/api/.env`).
- Toutes les tâches sont en TDD strict : test rouge, exécution, implémentation minimale, test vert, commit.

---

### Task 9.1: Branche, dépendances et réparation du XML Zoho

**Files:**
- Create: `apps/api/src/import/repair-zoho.ts`
- Modify: `apps/api/package.json` (dépendances `exceljs`, `jszip`)
- Test: `apps/api/src/import/repair-zoho.spec.ts`

**Interfaces:**
- Consomme : `jszip` (`JSZip.loadAsync(buffer)`, `zip.file(regex)`, `entry.async('string')`, `zip.generateAsync({ type: 'nodebuffer' })`).
- Produit :
  - `export async function repairZohoXlsx(buffer: Buffer): Promise<Buffer>` — remplace, **dans les seuls fichiers `xl/worksheets/*.xml`**, tout `operator="last7Days|lastMonth|lastWeek|today|yesterday"` par `operator="equal"`, et renvoie le zip régénéré. Consommée par `importWorkbook` (Task 9.6).
  - `export const ZOHO_OPERATORS: readonly string[]` — les 5 opérateurs non standard.

- [ ] **Étape 1: créer la branche (gitflow)**

```bash
git checkout develop && git pull && git checkout -b feature/import-xlsx
```

Attendu : `Switched to a new branch 'feature/import-xlsx'`.

- [ ] **Étape 2: installer les dépendances d'import**

```bash
pnpm --filter @suivi/api add exceljs@^4.4.0 jszip@^3.10.1
```

`exceljs` et `jszip` embarquent leurs propres déclarations TypeScript : aucun paquet `@types/*` à ajouter.

- [ ] **Étape 3: écrire le test qui échoue**

Créer `apps/api/src/import/repair-zoho.spec.ts` :

```ts
import JSZip from 'jszip';
import { repairZohoXlsx, ZOHO_OPERATORS } from './repair-zoho';

const FEUILLE_ZOHO = `<?xml version="1.0" encoding="UTF-8"?>
<worksheet>
  <conditionalFormatting sqref="A1:A10">
    <cfRule type="timePeriod" operator="today" priority="1"/>
    <cfRule type="timePeriod" operator="yesterday" priority="2"/>
    <cfRule type="timePeriod" operator="lastWeek" priority="3"/>
    <cfRule type="timePeriod" operator="last7Days" priority="4"/>
    <cfRule type="timePeriod" operator="lastMonth" priority="5"/>
    <cfRule type="cellIs" operator="greaterThan" priority="6"/>
  </conditionalFormatting>
</worksheet>`;

const STYLES = '<styleSheet><x operator="today"/></styleSheet>';

async function zipDeTest(): Promise<Buffer> {
  const zip = new JSZip();
  zip.file('xl/worksheets/sheet1.xml', FEUILLE_ZOHO);
  zip.file('xl/worksheets/sheet2.xml', FEUILLE_ZOHO);
  zip.file('xl/styles.xml', STYLES);
  return zip.generateAsync({ type: 'nodebuffer' });
}

async function lire(buffer: Buffer, chemin: string): Promise<string> {
  const zip = await JSZip.loadAsync(buffer);
  const entry = zip.file(chemin);
  if (entry === null) {
    throw new Error(`Entrée absente du zip : ${chemin}`);
  }
  return entry.async('string');
}

describe('repairZohoXlsx', () => {
  it('expose les 5 opérateurs non standard de Zoho', () => {
    expect([...ZOHO_OPERATORS].sort()).toEqual([
      'last7Days',
      'lastMonth',
      'lastWeek',
      'today',
      'yesterday',
    ]);
  });

  it('remplace tous les opérateurs Zoho par operator="equal" dans chaque feuille', async () => {
    const repare = await repairZohoXlsx(await zipDeTest());

    for (const chemin of ['xl/worksheets/sheet1.xml', 'xl/worksheets/sheet2.xml']) {
      const xml = await lire(repare, chemin);
      for (const operateur of ZOHO_OPERATORS) {
        expect(xml).not.toContain(`operator="${operateur}"`);
      }
      expect(xml.match(/operator="equal"/g)).toHaveLength(5);
    }
  });

  it('ne touche ni les opérateurs standard ni les fichiers hors xl/worksheets', async () => {
    const repare = await repairZohoXlsx(await zipDeTest());

    const feuille = await lire(repare, 'xl/worksheets/sheet1.xml');
    expect(feuille).toContain('operator="greaterThan"');

    const styles = await lire(repare, 'xl/styles.xml');
    expect(styles).toBe(STYLES);
  });

  it('rend un zip relisible et laisse un classeur sain inchangé dans son contenu', async () => {
    const zip = new JSZip();
    zip.file('xl/worksheets/sheet1.xml', '<worksheet><cfRule operator="equal"/></worksheet>');
    const sain = await zip.generateAsync({ type: 'nodebuffer' });

    const repare = await repairZohoXlsx(sain);
    expect(await lire(repare, 'xl/worksheets/sheet1.xml')).toBe(
      '<worksheet><cfRule operator="equal"/></worksheet>',
    );
  });
});
```

- [ ] **Étape 4: lancer le test**

```bash
pnpm --filter @suivi/api test:unit -- repair-zoho.spec
```

Attendu : **FAIL** — `Cannot find module './repair-zoho' from 'src/import/repair-zoho.spec.ts'`.

- [ ] **Étape 5: implémenter**

Créer `apps/api/src/import/repair-zoho.ts` :

```ts
import JSZip from 'jszip';

/**
 * Opérateurs de format conditionnel écrits par Zoho Sheet et refusés par
 * la validation OOXML : exceljs lève sur ces valeurs à la lecture.
 */
export const ZOHO_OPERATORS: readonly string[] = [
  'last7Days',
  'lastMonth',
  'lastWeek',
  'today',
  'yesterday',
] as const;

const WORKSHEET_ENTRY = /^xl\/worksheets\/[^/]+\.xml$/;

/**
 * Réécrit un classeur .xlsx exporté par Zoho en remplaçant, dans chaque
 * feuille, les opérateurs non standard par `operator="equal"`.
 * Les autres entrées du zip (styles, chaînes partagées, relations) sont
 * recopiées telles quelles.
 */
export async function repairZohoXlsx(buffer: Buffer): Promise<Buffer> {
  const zip = await JSZip.loadAsync(buffer);
  const motif = new RegExp(`operator="(?:${ZOHO_OPERATORS.join('|')})"`, 'g');

  for (const entry of zip.file(WORKSHEET_ENTRY)) {
    const xml = await entry.async('string');
    const repare = xml.replace(motif, 'operator="equal"');
    if (repare !== xml) {
      zip.file(entry.name, repare);
    }
  }

  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}
```

- [ ] **Étape 6: relancer le test**

```bash
pnpm --filter @suivi/api test:unit -- repair-zoho.spec
```

Attendu : **PASS** — 4 cas verts.

- [ ] **Étape 7: commit**

```bash
git add apps/api/src/import/repair-zoho.ts apps/api/src/import/repair-zoho.spec.ts apps/api/package.json pnpm-lock.yaml && git commit -m "feat(import): reparation du XML Zoho (operateurs de format conditionnel)"
```

> À vérifier à l'exécution : `zip.file(regex)` de JSZip 3 renvoie bien un tableau de `JSZipObject` (API documentée). Si la surcharge par expression régulière n'était pas disponible, remplacer la boucle par un filtre manuel sur `Object.keys(zip.files)` puis `zip.file(nom)` avec contrôle du `null` — le reste du code est identique.

---

### Task 9.2: Mapping nom de feuille → mois `YYYY-MM`

**Files:**
- Create: `apps/api/src/import/month-mapping.ts`
- Test: `apps/api/src/import/month-mapping.spec.ts`

**Interfaces:**
- Consomme : rien (fonction pure).
- Produit :
  - `export function sheetNameToMonth(name: string): string | null` — `'MARS 2025'` → `'2025-03'`, `'JANVIER 26'` → `'2026-01'`, `'AOUT 2026'` → `'2026-08'` ; tolérante aux espaces, à la casse et aux accents ; `null` pour toute feuille non mensuelle (`TEST`, `Feuille1`, `ARCHIVES OK `).
  - `export const MOIS_FRANCAIS: Readonly<Record<string, string>>` — les 12 mois sans accents vers `'01'`..`'12'`.

- [ ] **Étape 1: écrire le test qui échoue**

Créer `apps/api/src/import/month-mapping.spec.ts` :

```ts
import { MOIS_FRANCAIS, sheetNameToMonth } from './month-mapping';

describe('MOIS_FRANCAIS', () => {
  it('couvre les 12 mois français sans accents', () => {
    expect(Object.keys(MOIS_FRANCAIS)).toEqual([
      'JANVIER',
      'FEVRIER',
      'MARS',
      'AVRIL',
      'MAI',
      'JUIN',
      'JUILLET',
      'AOUT',
      'SEPTEMBRE',
      'OCTOBRE',
      'NOVEMBRE',
      'DECEMBRE',
    ]);
    expect(Object.values(MOIS_FRANCAIS)).toEqual([
      '01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12',
    ]);
  });
});

describe('sheetNameToMonth', () => {
  it('mappe les 18 feuilles mensuelles réelles du classeur', () => {
    expect(sheetNameToMonth('MARS 2025')).toBe('2025-03');
    expect(sheetNameToMonth('AVRIL 2025')).toBe('2025-04');
    expect(sheetNameToMonth('MAI 2025')).toBe('2025-05');
    expect(sheetNameToMonth('JUIN 2025')).toBe('2025-06');
    expect(sheetNameToMonth('JUILLET 2025')).toBe('2025-07');
    expect(sheetNameToMonth('AOUT 2025')).toBe('2025-08');
    expect(sheetNameToMonth('SEPTEMBRE 2025')).toBe('2025-09');
    expect(sheetNameToMonth('OCTOBRE 2025')).toBe('2025-10');
    expect(sheetNameToMonth('NOVEMBRE 2025')).toBe('2025-11');
    expect(sheetNameToMonth('DECEMBRE 2025')).toBe('2025-12');
    expect(sheetNameToMonth('JANVIER 26')).toBe('2026-01');
    expect(sheetNameToMonth('FEVRIER 26')).toBe('2026-02');
    expect(sheetNameToMonth('MARS 26')).toBe('2026-03');
    expect(sheetNameToMonth('AVRIL 26')).toBe('2026-04');
    expect(sheetNameToMonth('MAI 26')).toBe('2026-05');
    expect(sheetNameToMonth('JUIN 26')).toBe('2026-06');
    expect(sheetNameToMonth('JUILLET 2026')).toBe('2026-07');
    expect(sheetNameToMonth('AOUT 2026')).toBe('2026-08');
  });

  it('tolère la casse, les espaces multiples, les espaces de bord et les accents', () => {
    expect(sheetNameToMonth('  aout   2026 ')).toBe('2026-08');
    expect(sheetNameToMonth('Août 2026')).toBe('2026-08');
    expect(sheetNameToMonth('DÉCEMBRE 2025')).toBe('2025-12');
    expect(sheetNameToMonth('mars 25')).toBe('2025-03');
  });

  it('renvoie null pour les feuilles non mensuelles du classeur', () => {
    expect(sheetNameToMonth('TEST')).toBeNull();
    expect(sheetNameToMonth('Feuille1')).toBeNull();
    expect(sheetNameToMonth('ARCHIVES OK ')).toBeNull();
    expect(sheetNameToMonth('ARCHIVES OK')).toBeNull();
  });

  it('renvoie null pour les libellés mal formés', () => {
    expect(sheetNameToMonth('')).toBeNull();
    expect(sheetNameToMonth('MARS')).toBeNull();
    expect(sheetNameToMonth('2025')).toBeNull();
    expect(sheetNameToMonth('MARSS 2025')).toBeNull();
    expect(sheetNameToMonth('MARS 202')).toBeNull();
    expect(sheetNameToMonth('MARS 2025 BIS')).toBeNull();
  });
});
```

- [ ] **Étape 2: lancer le test**

```bash
pnpm --filter @suivi/api test:unit -- month-mapping.spec
```

Attendu : **FAIL** — `Cannot find module './month-mapping' from 'src/import/month-mapping.spec.ts'`.

- [ ] **Étape 3: implémenter**

Créer `apps/api/src/import/month-mapping.ts` :

```ts
/** Les 12 mois français, écrits sans accents (forme normalisée). */
export const MOIS_FRANCAIS: Readonly<Record<string, string>> = {
  JANVIER: '01',
  FEVRIER: '02',
  MARS: '03',
  AVRIL: '04',
  MAI: '05',
  JUIN: '06',
  JUILLET: '07',
  AOUT: '08',
  SEPTEMBRE: '09',
  OCTOBRE: '10',
  NOVEMBRE: '11',
  DECEMBRE: '12',
};

const NOM_FEUILLE = /^([A-Z]+) (\d{4}|\d{2})$/;

/**
 * Convertit un nom d'onglet du classeur Zoho en mois `YYYY-MM`.
 * Renvoie `null` si l'onglet n'est pas un onglet mensuel
 * (`TEST`, `Feuille1`, `ARCHIVES OK `, en-têtes libres...).
 */
export function sheetNameToMonth(name: string): string | null {
  const normalise = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();

  const correspondance = NOM_FEUILLE.exec(normalise);
  if (correspondance === null) {
    return null;
  }

  const mois = MOIS_FRANCAIS[correspondance[1]];
  if (mois === undefined) {
    return null;
  }

  const anneeBrute = correspondance[2];
  const annee = anneeBrute.length === 4 ? anneeBrute : `20${anneeBrute}`;
  return `${annee}-${mois}`;
}
```

- [ ] **Étape 4: relancer le test**

```bash
pnpm --filter @suivi/api test:unit -- month-mapping.spec
```

Attendu : **PASS** — 5 cas verts (dont les 18 feuilles réelles).

- [ ] **Étape 5: commit**

```bash
git add apps/api/src/import/month-mapping.ts apps/api/src/import/month-mapping.spec.ts && git commit -m "feat(import): mapping nom de feuille vers mois YYYY-MM"
```

---

### Task 9.3: Normalisation des valeurs de cellule

**Files:**
- Create: `apps/api/src/import/normalize.ts`
- Test: `apps/api/src/import/normalize.spec.ts`

**Interfaces:**
- Consomme : rien (fonction pure ; le type d'entrée couvre les formes rendues par exceljs — `string`, `number`, `Date`, `{ richText }`, `{ text, hyperlink }`, `{ formula, result }`, `{ error }`).
- Produit :
  - `export function normalizeCellValue(value: unknown): string | null` — trim, `78.0` → `78`, `Date` → `'YYYY-MM-DD'`, vide → `null`.
  - `export const ISO_DATE: RegExp` — `/^\d{4}-\d{2}-\d{2}$/`, réutilisée par `import.service.ts` pour déduire le mois d'une ligne d'archives.

- [ ] **Étape 1: écrire le test qui échoue**

Créer `apps/api/src/import/normalize.spec.ts` :

```ts
import { ISO_DATE, normalizeCellValue } from './normalize';

describe('normalizeCellValue', () => {
  it('rend null pour les valeurs vides', () => {
    expect(normalizeCellValue(null)).toBeNull();
    expect(normalizeCellValue(undefined)).toBeNull();
    expect(normalizeCellValue('')).toBeNull();
    expect(normalizeCellValue('    ')).toBeNull();
    expect(normalizeCellValue(' ')).toBeNull();
  });

  it('trime les espaces parasites, y compris les espaces insécables', () => {
    expect(normalizeCellValue('ATT CLIENT  ')).toBe('ATT CLIENT');
    expect(normalizeCellValue('  ENTREPRISE PRO ')).toBe('ENTREPRISE PRO');
    expect(normalizeCellValue(' MARS ')).toBe('MARS');
  });

  it('conserve les espaces internes et les retours à la ligne des commentaires', () => {
    expect(normalizeCellValue(' Durée 1h\nde 14h40 à 15h45 ')).toBe('Durée 1h\nde 14h40 à 15h45');
  });

  it('nettoie les flottants parasites « 78.0 » en « 78 »', () => {
    expect(normalizeCellValue('78.0')).toBe('78');
    expect(normalizeCellValue(' 0.0 ')).toBe('0');
    expect(normalizeCellValue('45702.0')).toBe('45702');
    expect(normalizeCellValue('78.00')).toBe('78.00');
    expect(normalizeCellValue('78.5')).toBe('78.5');
  });

  it('préserve les codes textuels (zéros initiaux, « 2A »)', () => {
    expect(normalizeCellValue('2A')).toBe('2A');
    expect(normalizeCellValue('04510')).toBe('04510');
    expect(normalizeCellValue('14h')).toBe('14h');
  });

  it('convertit les nombres en texte', () => {
    expect(normalizeCellValue(78)).toBe('78');
    expect(normalizeCellValue(78.5)).toBe('78.5');
    expect(normalizeCellValue(0)).toBe('0');
  });

  it('convertit les dates exceljs en YYYY-MM-DD (UTC)', () => {
    expect(normalizeCellValue(new Date(Date.UTC(2026, 7, 14)))).toBe('2026-08-14');
    expect(normalizeCellValue(new Date(Date.UTC(2025, 0, 1, 23, 59, 59)))).toBe('2025-01-01');
    expect(normalizeCellValue(new Date('date invalide'))).toBeNull();
  });

  it('aplatit les valeurs riches d’exceljs', () => {
    expect(normalizeCellValue({ richText: [{ text: 'ATT ' }, { text: 'PV' }] })).toBe('ATT PV');
    expect(
      normalizeCellValue({ text: 'https://zfrmz.eu/abc', hyperlink: 'https://zfrmz.eu/abc' }),
    ).toBe('https://zfrmz.eu/abc');
    expect(normalizeCellValue({ formula: 'A1*2', result: ' 12.0 ' })).toBe('12');
    expect(normalizeCellValue({ error: '#REF!' })).toBeNull();
  });

  it('convertit les booléens en texte français', () => {
    expect(normalizeCellValue(true)).toBe('VRAI');
    expect(normalizeCellValue(false)).toBe('FAUX');
  });
});

describe('ISO_DATE', () => {
  it('ne reconnaît que le format YYYY-MM-DD', () => {
    expect(ISO_DATE.test('2026-08-14')).toBe(true);
    expect(ISO_DATE.test('14/08/2026')).toBe(false);
    expect(ISO_DATE.test('2026-08')).toBe(false);
  });
});
```

- [ ] **Étape 2: lancer le test**

```bash
pnpm --filter @suivi/api test:unit -- normalize.spec
```

Attendu : **FAIL** — `Cannot find module './normalize' from 'src/import/normalize.spec.ts'`.

- [ ] **Étape 3: implémenter**

Créer `apps/api/src/import/normalize.ts` :

```ts
/** Format de date stocké dans `Row.data` pour les colonnes de type DATE. */
export const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const FLOTTANT_PARASITE = /^(\d+)\.0$/;

function versDateIso(valeur: Date): string | null {
  const millisecondes = valeur.getTime();
  if (Number.isNaN(millisecondes)) {
    return null;
  }
  const annee = String(valeur.getUTCFullYear()).padStart(4, '0');
  const mois = String(valeur.getUTCMonth() + 1).padStart(2, '0');
  const jour = String(valeur.getUTCDate()).padStart(2, '0');
  return `${annee}-${mois}-${jour}`;
}

function nettoyerTexte(brut: string): string | null {
  const trime = brut.replace(/\u00a0/g, ' ').trim();
  if (trime === '') {
    return null;
  }
  const flottant = FLOTTANT_PARASITE.exec(trime);
  return flottant === null ? trime : flottant[1];
}

/**
 * Normalise une valeur brute lue par exceljs vers la représentation stockée
 * dans `Row.data` : chaîne nettoyée, ou `null` si la cellule est vide.
 */
export function normalizeCellValue(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (value instanceof Date) {
    return versDateIso(value);
  }
  if (typeof value === 'string') {
    return nettoyerTexte(value);
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? nettoyerTexte(String(value)) : null;
  }
  if (typeof value === 'boolean') {
    return value ? 'VRAI' : 'FAUX';
  }
  if (typeof value === 'object') {
    const riche = value as {
      error?: unknown;
      richText?: unknown;
      text?: unknown;
      result?: unknown;
      hyperlink?: unknown;
    };
    if (riche.error !== undefined) {
      return null;
    }
    if (Array.isArray(riche.richText)) {
      const morceaux = riche.richText
        .map((part) => String((part as { text?: unknown }).text ?? ''))
        .join('');
      return nettoyerTexte(morceaux);
    }
    if (riche.text !== undefined) {
      return normalizeCellValue(riche.text);
    }
    if (riche.result !== undefined) {
      return normalizeCellValue(riche.result);
    }
    if (typeof riche.hyperlink === 'string') {
      return nettoyerTexte(riche.hyperlink);
    }
    return null;
  }
  return nettoyerTexte(String(value));
}
```

- [ ] **Étape 4: relancer le test**

```bash
pnpm --filter @suivi/api test:unit -- normalize.spec
```

Attendu : **PASS** — 10 cas verts.

- [ ] **Étape 5: commit**

```bash
git add apps/api/src/import/normalize.ts apps/api/src/import/normalize.spec.ts && git commit -m "feat(import): normalisation des valeurs de cellule (trim, flottants, dates)"
```

> À vérifier à l'exécution : exceljs restitue les cellules datées en `Date` UTC. Si l'import réel décale les dates d'un jour (fuseau `Europe/Paris` appliqué à la lecture, ou classeur en base 1904), remplacer les accesseurs `getUTC*` de `versDateIso` par les accesseurs locaux `getFullYear`/`getMonth`/`getDate` et relancer `normalize.spec` en adaptant les trois assertions de dates.

---

### Task 9.4: Couleurs initiales et définition des 16 colonnes

**Files:**
- Create: `apps/api/src/import/colors.ts`
- Test: `apps/api/src/import/colors.spec.ts`

**Interfaces:**
- Consomme : `pastelFor(label: string): { bg: string; text: string }` de `@suivi/shared` (Feature 1, Task 1.5) ; `ColumnType` de `@prisma/client`.
- Produit :
  - `export interface ColumnSeed { key: string; label: string; type: ColumnType }`
  - `export interface ChoiceSeed { label: string; bgColor: string | null; textColor: string | null; bold: boolean }`
  - `export const COLUMNS: readonly ColumnSeed[]` — 16 colonnes, ordre A..P de la spec §2.1 (l'index dans le tableau vaut `position`).
  - `export const CHOICES_BY_COLUMN: Readonly<Record<string, readonly ChoiceSeed[]>>` — 5 listes (`statut` 15, `partenaire` 41, `tech` 14, `nom_cp` 10, `materiel_recu` 3).
  - `export const SELECT_KEYS: readonly string[]` — les 5 clés de type `SELECT`.
  - `export function allowedValues(columnKey: string): ReadonlySet<string>` — libellés autorisés d'une liste (Set vide si la colonne n'est pas une liste).

- [ ] **Étape 1: écrire le test qui échoue**

Créer `apps/api/src/import/colors.spec.ts` :

```ts
import { pastelFor } from '@suivi/shared';
import {
  allowedValues,
  CHOICES_BY_COLUMN,
  COLUMNS,
  SELECT_KEYS,
  type ChoiceSeed,
} from './colors';

function parLabel(key: string): Record<string, ChoiceSeed> {
  return Object.fromEntries((CHOICES_BY_COLUMN[key] ?? []).map((c) => [c.label, c]));
}

describe('COLUMNS', () => {
  it('décrit les 16 colonnes de la spec §2.1 dans l’ordre A..P', () => {
    expect(COLUMNS.map((c) => c.key)).toEqual([
      'impe',
      'client',
      'dpt',
      'cp_client',
      'partenaire',
      'date',
      'porta_commentaires',
      'heure',
      'tech',
      'nom_tech',
      'nom_cp',
      'statut',
      'commentaires_planif',
      'materiel_recu',
      'num_chrono',
      'infos_facturation',
    ]);
  });

  it('reprend les libellés et types du contrat', () => {
    const parCle = Object.fromEntries(COLUMNS.map((c) => [c.key, c]));
    expect(parCle['impe']).toEqual({ key: 'impe', label: 'IMPE', type: 'DATE' });
    expect(parCle['statut']).toEqual({ key: 'statut', label: 'INSTALLATION', type: 'SELECT' });
    expect(parCle['heure']).toEqual({ key: 'heure', label: 'HEURE', type: 'TEXT' });
    expect(parCle['porta_commentaires']).toEqual({
      key: 'porta_commentaires',
      label: 'PORTA ET COMMENTAIRES IMPORTANT',
      type: 'LONGTEXT',
    });
    expect(parCle['num_chrono']).toEqual({ key: 'num_chrono', label: 'N° CHRONO', type: 'TEXT' });
  });

  it('déclare exactement 5 colonnes de type SELECT', () => {
    expect(SELECT_KEYS).toEqual(['partenaire', 'tech', 'nom_cp', 'statut', 'materiel_recu']);
    expect(COLUMNS.filter((c) => c.type === 'SELECT').map((c) => c.key).sort()).toEqual(
      [...SELECT_KEYS].sort(),
    );
  });
});

describe('CHOICES_BY_COLUMN', () => {
  it('compte 83 choix répartis sur les 5 listes', () => {
    expect(CHOICES_BY_COLUMN['statut']).toHaveLength(15);
    expect(CHOICES_BY_COLUMN['partenaire']).toHaveLength(41);
    expect(CHOICES_BY_COLUMN['tech']).toHaveLength(14);
    expect(CHOICES_BY_COLUMN['nom_cp']).toHaveLength(10);
    expect(CHOICES_BY_COLUMN['materiel_recu']).toHaveLength(3);
    expect(
      Object.values(CHOICES_BY_COLUMN).reduce((total, liste) => total + liste.length, 0),
    ).toBe(83);
  });

  it('applique les couleurs exactes des statuts', () => {
    const statuts = parLabel('statut');
    expect(statuts['NEW']).toEqual({
      label: 'NEW', bgColor: '#FFFF00', textColor: '#FF0000', bold: true,
    });
    expect(statuts['ATT PV']).toEqual({
      label: 'ATT PV', bgColor: '#744388', textColor: '#FFFFFF', bold: true,
    });
    expect(statuts['EN COLLECTE']).toEqual({
      label: 'EN COLLECTE', bgColor: '#F9E79F', textColor: '#786208', bold: false,
    });
    expect(statuts['A DISTANCE']).toEqual({
      label: 'A DISTANCE', bgColor: null, textColor: null, bold: false,
    });
    expect(statuts['CLOTUREE']).toEqual({
      label: 'CLOTUREE', bgColor: '#A6A6A6', textColor: '#ABEBC6', bold: false,
    });
  });

  it('fige les 6 partenaires colorés dans l’Excel', () => {
    const partenaires = parLabel('partenaire');
    expect(partenaires['EVERLINK']).toMatchObject({ bgColor: '#229955', textColor: '#000000' });
    expect(partenaires['HIGHCOM']).toMatchObject({ bgColor: '#C39BD3', textColor: '#000000' });
    expect(partenaires['ENTREPRISE PRO']).toMatchObject({ bgColor: '#2772A4', textColor: '#000000' });
    expect(partenaires['OR-TEL']).toMatchObject({ bgColor: '#F1C40F', textColor: '#000000' });
    expect(partenaires['VIP TELECOM']).toMatchObject({ bgColor: '#AED6F1', textColor: '#000000' });
    expect(partenaires['WETELGROUP']).toMatchObject({ bgColor: '#FCDAE3', textColor: '#000000' });
  });

  it('attribue aux 35 autres partenaires une couleur pastelFor stable', () => {
    const partenaires = parLabel('partenaire');
    expect(partenaires['CUBE']).toMatchObject({
      bgColor: pastelFor('CUBE').bg,
      textColor: pastelFor('CUBE').text,
    });
    expect(partenaires['2A Consulting']).toMatchObject({
      bgColor: pastelFor('2A Consulting').bg,
      textColor: pastelFor('2A Consulting').text,
    });
    expect(partenaires['HOIST GROUP']).toMatchObject({
      bgColor: pastelFor('HOIST GROUP').bg,
      textColor: pastelFor('HOIST GROUP').text,
    });
  });

  it('rejoue deux fois la table sans changer une seule couleur (import rejouable)', () => {
    const premier = (CHOICES_BY_COLUMN['partenaire'] ?? []).map((c) => `${c.label}:${c.bgColor}`);
    const second = (CHOICES_BY_COLUMN['partenaire'] ?? []).map(
      (c) => `${c.label}:${pastelFor(c.label).bg}`,
    );
    const figes = new Set([
      'EVERLINK', 'HIGHCOM', 'ENTREPRISE PRO', 'OR-TEL', 'VIP TELECOM', 'WETELGROUP',
    ]);
    premier.forEach((entree, index) => {
      const label = entree.slice(0, entree.lastIndexOf(':'));
      if (!figes.has(label)) {
        expect(entree).toBe(second[index]);
      }
    });
  });

  it('colore la liste tech selon le contrat', () => {
    const techs = parLabel('tech');
    expect(techs['DIRECT']).toEqual({
      label: 'DIRECT', bgColor: null, textColor: '#009ADF', bold: true,
    });
    expect(techs['ADWEB']).toEqual({
      label: 'ADWEB', bgColor: null, textColor: '#229955', bold: true,
    });
    expect(techs['VOSGES INFO']).toEqual({
      label: 'VOSGES INFO', bgColor: null, textColor: '#229955', bold: true,
    });
    expect(techs['NETWORK']).toEqual({
      label: 'NETWORK', bgColor: null, textColor: null, bold: false,
    });
  });

  it('laisse nom_cp et materiel_recu neutres', () => {
    for (const key of ['nom_cp', 'materiel_recu']) {
      for (const choix of CHOICES_BY_COLUMN[key] ?? []) {
        expect(choix).toMatchObject({ bgColor: null, textColor: null, bold: false });
      }
    }
  });
});

describe('allowedValues', () => {
  it('expose les libellés autorisés d’une liste', () => {
    expect(allowedValues('statut').has('ATT CLIENT')).toBe(true);
    expect(allowedValues('statut').has('ATT CLIENTS')).toBe(false);
    expect(allowedValues('partenaire').size).toBe(41);
  });

  it('renvoie un ensemble vide pour une colonne qui n’est pas une liste', () => {
    expect(allowedValues('client').size).toBe(0);
    expect(allowedValues('inconnue').size).toBe(0);
  });
});
```

- [ ] **Étape 2: lancer le test**

```bash
pnpm --filter @suivi/api test:unit -- colors.spec
```

Attendu : **FAIL** — `Cannot find module './colors' from 'src/import/colors.spec.ts'`.

- [ ] **Étape 3: implémenter**

Créer `apps/api/src/import/colors.ts` :

```ts
import { ColumnType } from '@prisma/client';
import { pastelFor } from '@suivi/shared';

export interface ColumnSeed {
  key: string;
  label: string;
  type: ColumnType;
}

export interface ChoiceSeed {
  label: string;
  bgColor: string | null;
  textColor: string | null;
  bold: boolean;
}

/**
 * Les 16 colonnes de la spec §2.1, dans l'ordre A..P.
 * L'index dans ce tableau est la `position` en base.
 * `heure` reste TEXT : le classeur contient « 14h », « 9H », « 14H30 ».
 */
export const COLUMNS: readonly ColumnSeed[] = [
  { key: 'impe', label: 'IMPE', type: 'DATE' },
  { key: 'client', label: 'CLIENT', type: 'TEXT' },
  { key: 'dpt', label: 'DPT', type: 'TEXT' },
  { key: 'cp_client', label: 'CP CLIENT', type: 'TEXT' },
  { key: 'partenaire', label: 'PARTE', type: 'SELECT' },
  { key: 'date', label: 'DATE', type: 'DATE' },
  { key: 'porta_commentaires', label: 'PORTA ET COMMENTAIRES IMPORTANT', type: 'LONGTEXT' },
  { key: 'heure', label: 'HEURE', type: 'TEXT' },
  { key: 'tech', label: 'TECH', type: 'SELECT' },
  { key: 'nom_tech', label: 'NOM TECH', type: 'TEXT' },
  { key: 'nom_cp', label: 'NOM CP', type: 'SELECT' },
  { key: 'statut', label: 'INSTALLATION', type: 'SELECT' },
  { key: 'commentaires_planif', label: 'COMMENTAIRES PLANIF', type: 'LONGTEXT' },
  { key: 'materiel_recu', label: 'MATERIEL RECU', type: 'SELECT' },
  { key: 'num_chrono', label: 'N° CHRONO', type: 'TEXT' },
  { key: 'infos_facturation', label: 'INFOS FACTURATION', type: 'TEXT' },
];

export const SELECT_KEYS: readonly string[] = [
  'partenaire',
  'tech',
  'nom_cp',
  'statut',
  'materiel_recu',
];

function choix(
  label: string,
  bgColor: string | null = null,
  textColor: string | null = null,
  bold = false,
): ChoiceSeed {
  return { label, bgColor, textColor, bold };
}

// Statuts — couleurs exactes des contrats (§ Couleurs initiales).
const STATUTS: readonly ChoiceSeed[] = [
  choix('NEW', '#FFFF00', '#FF0000', true),
  choix('STAGING', '#F8B5C8', '#E64219', true),
  choix('A SUIVRE', '#FFA600', '#FF0000', true),
  choix('ATT TECH', '#F8B5C8', '#E64219', true),
  choix('ATT PARTE', '#F8B5C8', '#E64219', true),
  choix('ATT PV', '#744388', '#FFFFFF', true),
  choix('ATT 5 COM', '#F8B5C8', '#E64219', true),
  choix('ATT CLIENT', '#F8B5C8', '#E64219', true),
  choix('EN COLLECTE', '#F9E79F', '#786208', false),
  choix('STAND BY', '#85C1E9', '#002060', true),
  choix('A PLANIFIER', '#13ED0C', '#FF0000', true),
  choix('INSTALLATION', '#9BDEB4', '#176638', true),
  choix('A DISTANCE', null, null, false),
  choix('ANNULEE', '#FF0000', '#000000', true),
  choix('CLOTUREE', '#A6A6A6', '#ABEBC6', false),
];

// 41 partenaires, ordre de la spec §2.2.
const PARTENAIRES: readonly string[] = [
  'OR-TEL', 'ENTREPRISE PRO', 'CUBE', 'VIP TELECOM', 'ESPACE BUREAUTIQUE',
  'IT ADEPT', 'WETELGROUP', 'HIGHCOM', '2A Consulting', 'ALLIPCOM',
  'BUREAUTIK SERVICES', 'MABUROTIC', 'CG CONEKT', 'LEA NUMERIQUE', 'COM2S',
  'DBTELECOM', 'ECS', 'GOOD MORNING OFFICE', 'GROUPE TCV', 'KOTEL',
  'I PLANETHI', 'DJEFFREY', 'LDS SOLUTIONS', 'MIKADO SOLUTIONS', 'MY OBS',
  'ODH SOLUTIONS', 'OMNITEL', 'PRO FIBRE', 'RESEAU LINE', 'SNS SOLUTIONS',
  'SQUARTIS', 'TELPRO', 'ODS', 'TOPLINIE', 'UNITED TELECOM', 'YOWIGO',
  'VD COM', 'REVOLY', 'FR TELECOM', 'EVERLINK', 'HOIST GROUP',
];

// Les 6 fonds relevés dans le classeur ; texte noir (contrat).
const PARTENAIRE_COULEURS_EXCEL: Readonly<Record<string, { bg: string; text: string }>> = {
  EVERLINK: { bg: '#229955', text: '#000000' },
  HIGHCOM: { bg: '#C39BD3', text: '#000000' },
  'ENTREPRISE PRO': { bg: '#2772A4', text: '#000000' },
  'OR-TEL': { bg: '#F1C40F', text: '#000000' },
  'VIP TELECOM': { bg: '#AED6F1', text: '#000000' },
  WETELGROUP: { bg: '#FCDAE3', text: '#000000' },
};

const TECHS: readonly string[] = [
  'DIRECT', 'ADWEB', 'DELTINFO', 'SOSINFO', 'NETWORK', 'KRYCIA', 'OCCITECH',
  'SPOTER', 'LAMIE', 'VOSGES INFO', 'PSITEK', 'TOULINFO', 'IMPECPRO', 'AUTRE',
];

const TECHS_VERTS: ReadonlySet<string> = new Set([
  'ADWEB', 'DELTINFO', 'SOSINFO', 'OCCITECH', 'PSITEK', 'TOULINFO',
  'VOSGES INFO', 'LAMIE',
]);

const NOMS_CP: readonly string[] = [
  'LAURENT', 'PIERRE', 'GEOFFROY', 'QUENTIN', 'KORANTIN', 'ADRIEN', 'MARCO',
  'ADV', 'AURELIEN', 'DYLAN',
];

const MATERIEL_RECU: readonly string[] = ['ENVOYE', 'LIVRE', 'POINT RELAIS'];

export const CHOICES_BY_COLUMN: Readonly<Record<string, readonly ChoiceSeed[]>> = {
  statut: STATUTS,
  partenaire: PARTENAIRES.map((label) => {
    const couleurs = PARTENAIRE_COULEURS_EXCEL[label] ?? pastelFor(label);
    return choix(label, couleurs.bg, couleurs.text, false);
  }),
  tech: TECHS.map((label) => {
    if (label === 'DIRECT') {
      return choix(label, null, '#009ADF', true);
    }
    if (TECHS_VERTS.has(label)) {
      return choix(label, null, '#229955', true);
    }
    return choix(label);
  }),
  nom_cp: NOMS_CP.map((label) => choix(label)),
  materiel_recu: MATERIEL_RECU.map((label) => choix(label)),
};

const VALEURS_AUTORISEES: Readonly<Record<string, ReadonlySet<string>>> = Object.fromEntries(
  Object.entries(CHOICES_BY_COLUMN).map(([key, liste]) => [
    key,
    new Set(liste.map((c) => c.label)),
  ]),
);

const AUCUNE_VALEUR: ReadonlySet<string> = new Set<string>();

/** Libellés acceptés pour une colonne de type liste ; Set vide sinon. */
export function allowedValues(columnKey: string): ReadonlySet<string> {
  return VALEURS_AUTORISEES[columnKey] ?? AUCUNE_VALEUR;
}
```

- [ ] **Étape 4: relancer le test**

```bash
pnpm --filter @suivi/api test:unit -- colors.spec
```

Attendu : **PASS** — 11 cas verts.

- [ ] **Étape 5: commit**

```bash
git add apps/api/src/import/colors.ts apps/api/src/import/colors.spec.ts && git commit -m "feat(import): 16 colonnes et couleurs initiales des 5 listes"
```

---

### Task 9.5: Mapping des en-têtes de feuille vers les clés de colonne

**Files:**
- Create: `apps/api/src/import/header-mapping.ts`
- Test: `apps/api/src/import/header-mapping.spec.ts`

**Interfaces:**
- Consomme : `COLUMNS` de `./colors` (Task 9.4).
- Produit :
  - `export const COLUMN_KEYS_IN_ORDER: readonly string[]` — les 16 clés, ordre A..P.
  - `export function normalizeHeader(header: string): string` — majuscules, sans accents, ponctuation réduite à l'espace.
  - `export function headerToKey(header: string): string | null` — alias d'en-tête → clé de colonne.
  - `export function columnLetter(index: number): string` — `0` → `'A'`, `26` → `'AA'`.
  - `export interface HeaderMapping { keyByIndex: (string | null)[]; labelByIndex: string[]; unmapped: number[] }`
  - `export function buildHeaderMap(headers: readonly (string | null)[]): HeaderMapping` — première occurrence gagnante ; un en-tête inconnu ou en doublon reste `null` (la valeur ira dans `commentaires_planif`).

- [ ] **Étape 1: écrire le test qui échoue**

Créer `apps/api/src/import/header-mapping.spec.ts` :

```ts
import {
  buildHeaderMap,
  columnLetter,
  COLUMN_KEYS_IN_ORDER,
  headerToKey,
  normalizeHeader,
} from './header-mapping';

describe('normalizeHeader', () => {
  it('met en majuscules, retire accents et ponctuation, compacte les espaces', () => {
    expect(normalizeHeader('  Nom   Tech ')).toBe('NOM TECH');
    expect(normalizeHeader('N° CHRONO ')).toBe('N CHRONO');
    expect(normalizeHeader('MATÉRIEL REÇU')).toBe('MATERIEL RECU');
  });
});

describe('headerToKey', () => {
  it('reconnaît les en-têtes de la feuille de référence AOUT 2026', () => {
    expect(headerToKey('IMPE')).toBe('impe');
    expect(headerToKey('CLIENT')).toBe('client');
    expect(headerToKey('DPT')).toBe('dpt');
    expect(headerToKey('CP CLIENT')).toBe('cp_client');
    expect(headerToKey('PARTE')).toBe('partenaire');
    expect(headerToKey('DATE')).toBe('date');
    expect(headerToKey('PORTA ET COMMENTAIRES IMPORTANT')).toBe('porta_commentaires');
    expect(headerToKey('HEURE')).toBe('heure');
    expect(headerToKey('TECH')).toBe('tech');
    expect(headerToKey('NOM TECH')).toBe('nom_tech');
    expect(headerToKey('NOM CP')).toBe('nom_cp');
    expect(headerToKey('INSTALLATION')).toBe('statut');
    expect(headerToKey('COMMENTAIRES PLANIF')).toBe('commentaires_planif');
    expect(headerToKey('MATERIEL RECU')).toBe('materiel_recu');
    expect(headerToKey('N° CHRONO')).toBe('num_chrono');
    expect(headerToKey('INFOS FACTURATION')).toBe('infos_facturation');
  });

  it('reconnaît les variantes historiques des feuilles 2025', () => {
    expect(headerToKey('DATE CDE ')).toBe('impe');
    expect(headerToKey('IMPERATIF ACTION')).toBe('impe');
    expect(headerToKey('IMPER')).toBe('impe');
    expect(headerToKey('DATES IMPERATIFS')).toBe('impe');
    expect(headerToKey('CLIENTS')).toBe('client');
    expect(headerToKey('PARTENAIRE')).toBe('partenaire');
    expect(headerToKey('DATES ')).toBe('date');
    expect(headerToKey('PORTA PREVUE LE')).toBe('porta_commentaires');
    expect(headerToKey('STATUT ')).toBe('statut');
    expect(headerToKey('INFOS FACTURATION POUR LUCIE')).toBe('infos_facturation');
  });

  it('renvoie null pour les en-têtes hors périmètre', () => {
    expect(headerToKey('DERNIERE ADV')).toBeNull();
    expect(headerToKey('SUIVI LIENS')).toBeNull();
    expect(headerToKey('CR ET PV ENVOYES ET CLASSES')).toBeNull();
    expect(headerToKey('COLLECTE')).toBeNull();
    expect(headerToKey('MESSAGE')).toBeNull();
    expect(headerToKey('')).toBeNull();
  });
});

describe('columnLetter', () => {
  it('convertit un index 0-based en lettre de colonne Excel', () => {
    expect(columnLetter(0)).toBe('A');
    expect(columnLetter(14)).toBe('O');
    expect(columnLetter(25)).toBe('Z');
    expect(columnLetter(26)).toBe('AA');
  });
});

describe('buildHeaderMap', () => {
  it('mappe la feuille AOUT 2026 sur les 16 clés dans l’ordre A..P', () => {
    const mapping = buildHeaderMap([
      'IMPE', 'CLIENT', 'DPT', 'CP CLIENT', 'PARTE', 'DATE',
      'PORTA ET COMMENTAIRES IMPORTANT', 'HEURE', 'TECH', 'NOM TECH', 'NOM CP',
      'INSTALLATION', 'COMMENTAIRES PLANIF', 'MATERIEL RECU', 'N° CHRONO',
      'INFOS FACTURATION',
    ]);
    expect(mapping.keyByIndex).toEqual([...COLUMN_KEYS_IN_ORDER]);
    expect(mapping.unmapped).toEqual([]);
  });

  it('mappe la feuille historique MARS 2025 et signale ses colonnes hors périmètre', () => {
    const mapping = buildHeaderMap([
      'DATE CDE ', 'CLIENT', 'PARTENAIRE', 'DATES ', 'HEURE ', 'TECH',
      'NOM TECH', 'NOM CP ', 'STATUT ', 'COMMENTAIRES PLANIF ', 'DERNIERE ADV',
      'MATERIEL RECU ', 'N° CHRONO ', 'SUIVI LIENS ',
      'CR ET PV ENVOYES ET CLASSES ',
    ]);
    expect(mapping.keyByIndex).toEqual([
      'impe', 'client', 'partenaire', 'date', 'heure', 'tech', 'nom_tech',
      'nom_cp', 'statut', 'commentaires_planif', null, 'materiel_recu',
      'num_chrono', null, null,
    ]);
    expect(mapping.unmapped).toEqual([10, 13, 14]);
    expect(mapping.labelByIndex[10]).toBe('DERNIERE ADV');
    expect(mapping.labelByIndex[14]).toBe('CR ET PV ENVOYES ET CLASSES');
  });

  it('ne mappe qu’une fois une clé : les doublons d’en-tête deviennent non mappés', () => {
    const mapping = buildHeaderMap(['IMPER', 'IMPER', 'IMPER', 'DATE']);
    expect(mapping.keyByIndex).toEqual(['impe', null, null, 'date']);
    expect(mapping.unmapped).toEqual([1, 2]);
  });

  it('nomme les colonnes sans en-tête par leur lettre Excel (feuille ARCHIVES OK)', () => {
    const mapping = buildHeaderMap([null, null, 'PARTENAIRE', null, null]);
    expect(mapping.keyByIndex).toEqual([null, null, 'partenaire', null, null]);
    expect(mapping.labelByIndex).toEqual([
      'COLONNE A', 'COLONNE B', 'PARTENAIRE', 'COLONNE D', 'COLONNE E',
    ]);
    expect(mapping.unmapped).toEqual([0, 1, 3, 4]);
  });
});
```

- [ ] **Étape 2: lancer le test**

```bash
pnpm --filter @suivi/api test:unit -- header-mapping.spec
```

Attendu : **FAIL** — `Cannot find module './header-mapping' from 'src/import/header-mapping.spec.ts'`.

- [ ] **Étape 3: implémenter**

Créer `apps/api/src/import/header-mapping.ts` :

```ts
import { COLUMNS } from './colors';

/** Les 16 clés de colonne, ordre A..P de la spec §2.1. */
export const COLUMN_KEYS_IN_ORDER: readonly string[] = COLUMNS.map((column) => column.key);

/**
 * Alias d'en-têtes relevés dans les 18 feuilles mensuelles du classeur,
 * exprimés sous forme normalisée (majuscules, sans accents ni ponctuation).
 */
const ALIAS: Readonly<Record<string, string>> = {
  IMPE: 'impe',
  IMPER: 'impe',
  'IMPERATIF ACTION': 'impe',
  'DATE CDE': 'impe',
  'DATES IMPERATIFS': 'impe',
  CLIENT: 'client',
  CLIENTS: 'client',
  DPT: 'dpt',
  'CP CLIENT': 'cp_client',
  PARTE: 'partenaire',
  PARTENAIRE: 'partenaire',
  DATE: 'date',
  DATES: 'date',
  'PORTA ET COMMENTAIRES IMPORTANT': 'porta_commentaires',
  'PORTA PREVUE LE': 'porta_commentaires',
  HEURE: 'heure',
  TECH: 'tech',
  'NOM TECH': 'nom_tech',
  'NOM CP': 'nom_cp',
  STATUT: 'statut',
  INSTALLATION: 'statut',
  'COMMENTAIRES PLANIF': 'commentaires_planif',
  'MATERIEL RECU': 'materiel_recu',
  'N CHRONO': 'num_chrono',
  'NO CHRONO': 'num_chrono',
  'NUM CHRONO': 'num_chrono',
  'INFOS FACTURATION': 'infos_facturation',
  'INFOS FACTURATION POUR LUCIE': 'infos_facturation',
};

/** Majuscules, sans accents, ponctuation remplacée par des espaces compactés. */
export function normalizeHeader(header: string): string {
  return header
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Clé de colonne correspondant à un en-tête Excel, ou `null` si inconnu. */
export function headerToKey(header: string): string | null {
  return ALIAS[normalizeHeader(header)] ?? null;
}

/** Index 0-based vers lettre de colonne Excel (0 → A, 26 → AA). */
export function columnLetter(index: number): string {
  let reste = index + 1;
  let lettres = '';
  while (reste > 0) {
    const modulo = (reste - 1) % 26;
    lettres = String.fromCharCode(65 + modulo) + lettres;
    reste = Math.floor((reste - 1) / 26);
  }
  return lettres;
}

export interface HeaderMapping {
  /** Clé de colonne par index de colonne Excel (0 = A) ; `null` si non mappée. */
  keyByIndex: (string | null)[];
  /** Libellé lisible par index : en-tête trimé, ou `COLONNE <lettre>` si vide. */
  labelByIndex: string[];
  /** Indices non mappés (valeurs déversées dans `commentaires_planif`). */
  unmapped: number[];
}

/**
 * Construit la table de correspondance d'une feuille à partir de sa ligne
 * d'en-tête réelle. Première occurrence gagnante : un second en-tête visant
 * une clé déjà prise reste non mappé.
 */
export function buildHeaderMap(headers: readonly (string | null)[]): HeaderMapping {
  const keyByIndex: (string | null)[] = [];
  const labelByIndex: string[] = [];
  const unmapped: number[] = [];
  const dejaPrises = new Set<string>();

  headers.forEach((header, index) => {
    const brut = (header ?? '').trim();
    labelByIndex.push(brut === '' ? `COLONNE ${columnLetter(index)}` : brut);

    const cle = brut === '' ? null : headerToKey(brut);
    if (cle === null || dejaPrises.has(cle)) {
      keyByIndex.push(null);
      unmapped.push(index);
      return;
    }
    dejaPrises.add(cle);
    keyByIndex.push(cle);
  });

  return { keyByIndex, labelByIndex, unmapped };
}
```

- [ ] **Étape 4: relancer le test**

```bash
pnpm --filter @suivi/api test:unit -- header-mapping.spec
```

Attendu : **PASS** — 8 cas verts.

- [ ] **Étape 5: commit**

```bash
git add apps/api/src/import/header-mapping.ts apps/api/src/import/header-mapping.spec.ts && git commit -m "feat(import): mapping des en-tetes de feuille vers les cles de colonne"
```

---

### Task 9.6: Service d'import — purge, colonnes (largeurs du fichier) et choix

**Files:**
- Create: `apps/api/src/import/import.service.ts`
- Create: `apps/api/test/helpers/build-workbook.ts`
- Test: `apps/api/test/import-schema.e2e-spec.ts`

**Interfaces:**
- Consomme : `repairZohoXlsx` (9.1), `sheetNameToMonth` (9.2), `normalizeCellValue` / `ISO_DATE` (9.3), `COLUMNS` / `CHOICES_BY_COLUMN` / `allowedValues` (9.4), `buildHeaderMap` / `columnLetter` / `COLUMN_KEYS_IN_ORDER` (9.5), `PrismaClient` et `Prisma` de `@prisma/client`, `Workbook` d'`exceljs`.
- Produit (consommé par les Tasks 9.7, 9.8, 9.9) :
  - `export interface SheetReport { sheet: string; month: string | null; archived: boolean; imported: number; ignored: number; anomalies: string[] }`
  - `export interface ImportReport { file: string; columns: number; choices: number; rows: number; sheets: SheetReport[] }`
  - `export async function importWorkbook(prisma: PrismaClient, filePath: string): Promise<ImportReport>`
  - `export const ARCHIVES_SHEET_NAME = 'ARCHIVES OK'`, `export const ARCHIVES_FALLBACK_MONTH = '2025-03'`, `export const WIDTH_REFERENCE_SHEET = 'AOUT 2026'`, `export const DEFAULT_COLUMN_WIDTH = 150`

**Attention:** ce test e2e purge `RowEvent`, `Row`, `Choice`, `Column` de la base pointée par `DATABASE_URL`. Il ne touche jamais `User`.

- [ ] **Étape 1: écrire le générateur de classeur de test**

Créer `apps/api/test/helpers/build-workbook.ts` (classeur synthétique, sans dépendance au fichier réel) :

```ts
import { Workbook, type Worksheet } from 'exceljs';

const ENTETE_2026 = [
  'IMPE', 'CLIENT', 'DPT', 'CP CLIENT', 'PARTE', 'DATE',
  'PORTA ET COMMENTAIRES IMPORTANT', 'HEURE', 'TECH', 'NOM TECH', 'NOM CP',
  'INSTALLATION', 'COMMENTAIRES PLANIF', 'MATERIEL RECU', 'N° CHRONO',
  'INFOS FACTURATION',
];

const LARGEURS_2026 = [10, 30, 5, 9, 15, 10, 40, 7, 13, 13, 10, 15, 20, 9, 17, 9];

function remplir(feuille: Worksheet, entetes: string[], largeurs?: number[]): void {
  feuille.columns = entetes.map((header, index) => ({
    header,
    width: largeurs === undefined ? undefined : largeurs[index],
  }));
}

function surligner(feuille: Worksheet, ligne: number, colonne: number, argb: string): void {
  feuille.getRow(ligne).getCell(colonne).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb },
  };
}

/**
 * Classeur synthétique reproduisant les particularités du classeur Zoho :
 * feuille moderne (A..P), feuille historique à en-têtes décalés, feuille
 * ignorée, feuille d'archives sans en-tête exploitable.
 */
export async function buildTestWorkbookBuffer(): Promise<Buffer> {
  const workbook = new Workbook();

  // --- AOUT 2026 : feuille de référence des largeurs, en-tête A..P ---
  const aout = workbook.addWorksheet('AOUT 2026');
  remplir(aout, ENTETE_2026, LARGEURS_2026);
  aout.addRow([
    new Date(Date.UTC(2026, 7, 3)), 'ARCADIA', '49', '49000', 'EVERLINK',
    new Date(Date.UTC(2026, 7, 14)), 'porta ok', '14h', 'DIRECT', 'Amar',
    'QUENTIN', 'ATT CLIENT  ', 'RAS', 'ENVOYE', '78.0', 'a facturer',
  ]);
  aout.addRow([
    null, 'CABINET LATES', '2A', '20000', 'PARTENAIRE INCONNU', null, null,
    '9H', 'DIRECT', null, 'PIERRE', 'CLOTUREE', null, null, null, null,
  ]);
  aout.addRow(['   ', '', '  ', null, null, null, null, null, null, null, null, null, null, null, null, null]);
  aout.addRow([
    null, 'AEC AIR BEL', null, null, 'OMNITEL', null, null, null, null, null,
    null, 'INSTALLATION', null, null, 'XA710513661FR', null,
  ]);
  surligner(aout, 5, 15, 'FFFF0000'); // N° CHRONO en rouge
  surligner(aout, 5, 1, 'FFFFFF00'); // IMPE en jaune

  // --- MARS 2025 : en-tête historique, 3 colonnes hors périmètre ---
  const mars = workbook.addWorksheet('MARS 2025');
  remplir(mars, [
    'DATE CDE ', 'CLIENT', 'PARTENAIRE', 'DATES ', 'HEURE ', 'TECH',
    'NOM TECH', 'NOM CP ', 'STATUT ', 'COMMENTAIRES PLANIF ', 'DERNIERE ADV',
    'MATERIEL RECU ', 'N° CHRONO ', 'SUIVI LIENS ', 'CR ET PV ENVOYES ET CLASSES ',
  ]);
  mars.addRow([
    new Date(Date.UTC(2025, 2, 4)), 'MAIRIE DE X', 'OR-TEL',
    new Date(Date.UTC(2025, 2, 18)), '10h', 'ADWEB', 'Chaabane', 'MARCO',
    'CLOTUREE', 'installe', 'ADV du 12/03', 'LIVRE', 'XB123', 'https://z.eu/1',
    'CLASSE',
  ]);

  // --- TEST : doit être ignorée ---
  const test = workbook.addWorksheet('TEST');
  remplir(test, ENTETE_2026);
  test.addRow([null, 'NE DOIT PAS ETRE IMPORTE', null, null, null, null, null,
    null, null, null, null, null, null, null, null, null]);

  // --- ARCHIVES OK  : ligne 1 quasi vide, données de A à I ---
  const archives = workbook.addWorksheet('ARCHIVES OK ');
  archives.getRow(1).getCell(3).value = 'PARTENAIRE';
  archives.addRow([
    new Date(Date.UTC(2025, 1, 14)), 'CABINET DENTAIRE', 'ENTREPRISE PRO ',
    new Date(Date.UTC(2025, 2, 6)), '14h', 'DIRECT', 'Amar', 'PIERRE', 'CLOTUREE',
  ]);
  archives.addRow([null, 'AEC AIR BEL', 'OMNITEL', null, null, null, null, null,
    'INSTALLATION']);

  const ecrit = await workbook.xlsx.writeBuffer();
  return Buffer.from(ecrit as ArrayBuffer);
}
```

- [ ] **Étape 2: écrire le test e2e qui échoue**

Créer `apps/api/test/import-schema.e2e-spec.ts` :

```ts
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { pastelFor } from '@suivi/shared';
import { importWorkbook, DEFAULT_COLUMN_WIDTH } from '../src/import/import.service';
import { buildTestWorkbookBuffer } from './helpers/build-workbook';

describe('importWorkbook — colonnes, choix et purge (e2e)', () => {
  const prisma = new PrismaClient();
  let chemin: string;

  beforeAll(async () => {
    const dossier = await mkdtemp(join(tmpdir(), 'suivi-import-'));
    chemin = join(dossier, 'classeur.xlsx');
    await writeFile(chemin, await buildTestWorkbookBuffer());

    // Données parasites : l'import doit les purger.
    const colonne = await prisma.column.create({
      data: { key: 'colonne_obsolete', label: 'OBSOLETE', type: 'TEXT', position: 99, width: 42 },
    });
    await prisma.choice.create({
      data: { columnId: colonne.id, label: 'OBSOLETE', position: 0 },
    });
    await prisma.row.create({ data: { month: '1999-01', position: 0 } });

    await importWorkbook(prisma, chemin);
  }, 120000);

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('purge les colonnes, choix et lignes préexistants', async () => {
    expect(await prisma.column.findUnique({ where: { key: 'colonne_obsolete' } })).toBeNull();
    expect(await prisma.row.count({ where: { month: '1999-01' } })).toBe(0);
  });

  it('ne supprime aucun utilisateur', async () => {
    const utilisateur = await prisma.user.upsert({
      where: { email: 'temoin-import@example.test' },
      update: {},
      create: {
        email: 'temoin-import@example.test',
        displayName: 'Témoin',
        passwordHash: 'x',
        cursorColor: '#000000',
      },
    });
    await importWorkbook(prisma, chemin);
    expect(await prisma.user.findUnique({ where: { id: utilisateur.id } })).not.toBeNull();
  }, 120000);

  it('crée les 16 colonnes dans l’ordre A..P avec leurs libellés', async () => {
    const colonnes = await prisma.column.findMany({ orderBy: { position: 'asc' } });
    expect(colonnes).toHaveLength(16);
    expect(colonnes.map((c) => c.key)).toEqual([
      'impe', 'client', 'dpt', 'cp_client', 'partenaire', 'date',
      'porta_commentaires', 'heure', 'tech', 'nom_tech', 'nom_cp', 'statut',
      'commentaires_planif', 'materiel_recu', 'num_chrono', 'infos_facturation',
    ]);
    expect(colonnes.map((c) => c.position)).toEqual([...Array(16).keys()]);
    expect(colonnes[11]).toMatchObject({ label: 'INSTALLATION', type: 'SELECT' });
  });

  it('lit les largeurs de la feuille AOUT 2026 (largeur Excel × 7, arrondie)', async () => {
    const impe = await prisma.column.findUniqueOrThrow({ where: { key: 'impe' } });
    const client = await prisma.column.findUniqueOrThrow({ where: { key: 'client' } });
    const porta = await prisma.column.findUniqueOrThrow({ where: { key: 'porta_commentaires' } });
    expect(impe.width).toBe(70); // 10 × 7
    expect(client.width).toBe(210); // 30 × 7
    expect(porta.width).toBe(280); // 40 × 7
    expect(DEFAULT_COLUMN_WIDTH).toBe(150);
  });

  it('crée les 83 choix avec les couleurs des contrats', async () => {
    expect(await prisma.choice.count()).toBe(83);

    const partenaire = await prisma.column.findUniqueOrThrow({
      where: { key: 'partenaire' },
      include: { choices: { orderBy: { position: 'asc' } } },
    });
    const parLabel = Object.fromEntries(partenaire.choices.map((c) => [c.label, c]));
    expect(partenaire.choices).toHaveLength(41);
    expect(parLabel['EVERLINK']).toMatchObject({ bgColor: '#229955', textColor: '#000000' });
    expect(parLabel['CUBE']).toMatchObject({
      bgColor: pastelFor('CUBE').bg,
      textColor: pastelFor('CUBE').text,
    });

    const statut = await prisma.column.findUniqueOrThrow({
      where: { key: 'statut' },
      include: { choices: true },
    });
    const statuts = Object.fromEntries(statut.choices.map((c) => [c.label, c]));
    expect(statuts['NEW']).toMatchObject({ bgColor: '#FFFF00', textColor: '#FF0000', bold: true });
    expect(statuts['A DISTANCE']).toMatchObject({ bgColor: null, textColor: null, bold: false });
  });

  it('rend un rapport avec les compteurs globaux', async () => {
    const rapport = await importWorkbook(prisma, chemin);
    expect(rapport.file).toBe(chemin);
    expect(rapport.columns).toBe(16);
    expect(rapport.choices).toBe(83);
    expect(rapport.sheets.map((s) => s.sheet)).toEqual(['AOUT 2026', 'MARS 2025', 'ARCHIVES OK ']);
  }, 120000);
});
```

- [ ] **Étape 3: lancer le test**

```bash
pnpm --filter @suivi/api test:e2e -- import-schema.e2e-spec
```

Attendu : **FAIL** — `Cannot find module '../src/import/import.service'`.

- [ ] **Étape 4: implémenter le service (partie schéma)**

Créer `apps/api/src/import/import.service.ts` :

```ts
import { readFile } from 'node:fs/promises';
import { Prisma, PrismaClient } from '@prisma/client';
import { Workbook, type Cell, type FillPattern, type Worksheet } from 'exceljs';
import { allowedValues, CHOICES_BY_COLUMN, COLUMNS, SELECT_KEYS } from './colors';
import { buildHeaderMap, COLUMN_KEYS_IN_ORDER, type HeaderMapping } from './header-mapping';
import { sheetNameToMonth } from './month-mapping';
import { ISO_DATE, normalizeCellValue } from './normalize';
import { repairZohoXlsx } from './repair-zoho';

/** Nom de la feuille d'archives, comparé après `trim()` (le classeur a un espace final). */
export const ARCHIVES_SHEET_NAME = 'ARCHIVES OK';
/** Mois de rattachement d'une ligne d'archives sans date exploitable. */
export const ARCHIVES_FALLBACK_MONTH = '2025-03';
/** Feuille dont les largeurs de colonnes servent de référence. */
export const WIDTH_REFERENCE_SHEET = 'AOUT 2026';
/** Largeur px appliquée quand le fichier n'en fournit aucune. */
export const DEFAULT_COLUMN_WIDTH = 150;

const PIXELS_PAR_CARACTERE = 7;
const MAX_COLONNES = 40;
const MAX_LIGNES = 20000;
const LOT_INSERTION = 500;

const SURLIGNAGES: Readonly<Record<string, string>> = {
  FF0000: '#FF0000',
  FFFF00: '#FFFF00',
};

export interface SheetReport {
  sheet: string;
  month: string | null;
  archived: boolean;
  imported: number;
  ignored: number;
  anomalies: string[];
}

export interface ImportReport {
  file: string;
  columns: number;
  choices: number;
  rows: number;
  sheets: SheetReport[];
}

interface BuiltRow {
  month: string;
  position: number;
  data: Record<string, string>;
  formats: Record<string, { bg: string }>;
  archived: boolean;
}

// ---------------------------------------------------------------- lecture

function headersOf(worksheet: Worksheet): (string | null)[] {
  const ligneEntete = worksheet.getRow(1);
  const largeur = Math.min(
    MAX_COLONNES,
    Math.max(worksheet.actualColumnCount, ligneEntete.cellCount, COLUMN_KEYS_IN_ORDER.length),
  );
  const entetes: (string | null)[] = [];
  for (let index = 1; index <= largeur; index++) {
    entetes.push(normalizeCellValue(ligneEntete.getCell(index).value));
  }
  return entetes;
}

function highlightOf(cell: Cell): string | null {
  const remplissage = cell.fill as FillPattern | undefined;
  if (remplissage === undefined || remplissage.type !== 'pattern' || remplissage.pattern !== 'solid') {
    return null;
  }
  const argb = remplissage.fgColor?.argb;
  if (typeof argb !== 'string') {
    return null;
  }
  const hex = (argb.length === 8 ? argb.slice(2) : argb).toUpperCase();
  return SURLIGNAGES[hex] ?? null;
}

function widthOf(worksheet: Worksheet, index: number): number {
  const largeur = worksheet.getColumn(index + 1).width;
  if (typeof largeur !== 'number' || !Number.isFinite(largeur) || largeur <= 0) {
    return DEFAULT_COLUMN_WIDTH;
  }
  return Math.round(largeur * PIXELS_PAR_CARACTERE);
}

function computeWidths(reference: Worksheet | undefined): Record<string, number> {
  const largeurs: Record<string, number> = {};
  for (const colonne of COLUMNS) {
    largeurs[colonne.key] = DEFAULT_COLUMN_WIDTH;
  }
  if (reference === undefined) {
    return largeurs;
  }
  const mapping = buildHeaderMap(headersOf(reference));
  mapping.keyByIndex.forEach((cle, index) => {
    if (cle !== null) {
      largeurs[cle] = widthOf(reference, index);
    }
  });
  return largeurs;
}

// ---------------------------------------------------------------- écriture

async function purge(prisma: PrismaClient): Promise<void> {
  // Ordre imposé par les clés étrangères. `User` n'est jamais touché.
  await prisma.rowEvent.deleteMany();
  await prisma.row.deleteMany();
  await prisma.choice.deleteMany();
  await prisma.column.deleteMany();
}

async function createColumnsAndChoices(
  prisma: PrismaClient,
  largeurs: Record<string, number>,
): Promise<number> {
  let nbChoix = 0;
  for (const [position, colonne] of COLUMNS.entries()) {
    const creee = await prisma.column.create({
      data: {
        key: colonne.key,
        label: colonne.label,
        type: colonne.type,
        position,
        width: largeurs[colonne.key] ?? DEFAULT_COLUMN_WIDTH,
      },
    });
    const choix = CHOICES_BY_COLUMN[colonne.key];
    if (choix !== undefined && choix.length > 0) {
      await prisma.choice.createMany({
        data: choix.map((valeur, rang) => ({
          columnId: creee.id,
          label: valeur.label,
          bgColor: valeur.bgColor,
          textColor: valeur.textColor,
          bold: valeur.bold,
          position: rang,
        })),
      });
      nbChoix += choix.length;
    }
  }
  return nbChoix;
}

async function insertRows(prisma: PrismaClient, lignes: readonly BuiltRow[]): Promise<void> {
  for (let debut = 0; debut < lignes.length; debut += LOT_INSERTION) {
    const lot = lignes.slice(debut, debut + LOT_INSERTION);
    await prisma.row.createMany({
      data: lot.map((ligne) => ({
        month: ligne.month,
        position: ligne.position,
        data: ligne.data as Prisma.InputJsonValue,
        formats: ligne.formats as Prisma.InputJsonValue,
        archived: ligne.archived,
        createdBy: null,
      })),
    });
  }
}

// ---------------------------------------------------------------- pilotage

export async function importWorkbook(
  prisma: PrismaClient,
  filePath: string,
): Promise<ImportReport> {
  const brut = await readFile(filePath);
  const repare = await repairZohoXlsx(brut);
  const workbook = new Workbook();
  await workbook.xlsx.load(repare);

  const reference = workbook.worksheets.find(
    (feuille) => feuille.name.trim() === WIDTH_REFERENCE_SHEET,
  );

  await purge(prisma);
  const nbChoix = await createColumnsAndChoices(prisma, computeWidths(reference));

  const rapports: SheetReport[] = [];
  let total = 0;

  for (const worksheet of workbook.worksheets) {
    const nom = worksheet.name;
    const mois = sheetNameToMonth(nom);
    const estArchive = nom.trim() === ARCHIVES_SHEET_NAME;
    if (mois === null && !estArchive) {
      continue;
    }
    const rapport = await importSheet(prisma, worksheet, mois, estArchive);
    rapports.push(rapport);
    total += rapport.imported;
  }

  return {
    file: filePath,
    columns: COLUMNS.length,
    choices: nbChoix,
    rows: total,
    sheets: rapports,
  };
}
```

La fonction `importSheet` (lecture des lignes) est ajoutée en Task 9.7 ; pour faire passer les tests de cette tâche, ajouter provisoirement à la fin du fichier :

```ts
async function importSheet(
  _prisma: PrismaClient,
  worksheet: Worksheet,
  month: string | null,
  archived: boolean,
): Promise<SheetReport> {
  return { sheet: worksheet.name, month, archived, imported: 0, ignored: 0, anomalies: [] };
}
```

- [ ] **Étape 5: relancer le test**

```bash
pnpm --filter @suivi/api test:e2e -- import-schema.e2e-spec
```

Attendu : **PASS** — 6 cas verts (purge, utilisateurs préservés, 16 colonnes, largeurs 70/210/280, 83 choix colorés, rapport à 3 feuilles).

- [ ] **Étape 6: commit**

```bash
git add apps/api/src/import/import.service.ts apps/api/test/helpers/build-workbook.ts apps/api/test/import-schema.e2e-spec.ts && git commit -m "feat(import): purge, creation des 16 colonnes avec largeurs du fichier et des 83 choix"
```

> À vérifier à l'exécution : (a) `worksheet.actualColumnCount` et `worksheet.getColumn(n).width` d'exceljs 4 — sur le fichier réel, `AOUT 2026` déclare `<col min="18" max="2048">`, d'où le garde-fou `MAX_COLONNES = 40` ; si `actualColumnCount` renvoyait 0 sur une feuille, le `Math.max(..., COLUMN_KEYS_IN_ORDER.length)` garantit malgré tout 16 colonnes analysées. (b) L'affectation `worksheet.columns = [{ header, width }]` dans `build-workbook.ts` : si le typage d'exceljs exige une propriété `key`, ajouter `key: header` à chaque entrée (sans autre changement) ou remplacer par `worksheet.addRow(entetes)` suivi de `worksheet.getColumn(i + 1).width = largeurs[i]`.

---

### Task 9.7: Service d'import — lignes mensuelles, surlignages, anomalies et archives

**Files:**
- Modify: `apps/api/src/import/import.service.ts` (remplacement de `importSheet`)
- Test: `apps/api/test/import-rows.e2e-spec.ts`

**Interfaces:**
- Consomme : tout ce que produit la Task 9.6 + `allowedValues`, `SELECT_KEYS`, `ISO_DATE`.
- Produit : `importSheet` complet — lit la ligne 1 comme en-tête, importe les lignes 2+ non vides, remplit `Row.data` (clés du contrat), `Row.formats` (surlignages rouge/jaune), déverse les colonnes non mappées dans `commentaires_planif`, consigne les valeurs de liste inconnues, et rattache les lignes d'archives au mois de leur date (sinon `ARCHIVES_FALLBACK_MONTH`).

- [ ] **Étape 1: écrire le test e2e qui échoue**

Créer `apps/api/test/import-rows.e2e-spec.ts` :

```ts
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PrismaClient, type Row } from '@prisma/client';
import { importWorkbook, type ImportReport } from '../src/import/import.service';
import { buildTestWorkbookBuffer } from './helpers/build-workbook';

function data(row: Row): Record<string, string> {
  return row.data as Record<string, string>;
}

function formats(row: Row): Record<string, { bg: string }> {
  return row.formats as Record<string, { bg: string }>;
}

describe('importWorkbook — lignes (e2e)', () => {
  const prisma = new PrismaClient();
  let rapport: ImportReport;

  beforeAll(async () => {
    const dossier = await mkdtemp(join(tmpdir(), 'suivi-import-rows-'));
    const chemin = join(dossier, 'classeur.xlsx');
    await writeFile(chemin, await buildTestWorkbookBuffer());
    rapport = await importWorkbook(prisma, chemin);
  }, 120000);

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('ignore les feuilles TEST et Feuille1', async () => {
    expect(rapport.sheets.map((s) => s.sheet)).not.toContain('TEST');
    const parasite = await prisma.row.findFirst({
      where: { data: { path: ['client'], equals: 'NE DOIT PAS ETRE IMPORTE' } },
    });
    expect(parasite).toBeNull();
  });

  it('importe les lignes non vides de AOUT 2026 en 2026-08, positions séquentielles', async () => {
    const lignes = await prisma.row.findMany({
      where: { month: '2026-08', archived: false },
      orderBy: { position: 'asc' },
    });
    expect(lignes).toHaveLength(3);
    expect(lignes.map((l) => l.position)).toEqual([0, 1, 2]);
    expect(lignes.map((l) => data(l)['client'])).toEqual([
      'ARCADIA', 'CABINET LATES', 'AEC AIR BEL',
    ]);

    const feuille = rapport.sheets.find((s) => s.sheet === 'AOUT 2026');
    expect(feuille).toMatchObject({ month: '2026-08', archived: false, imported: 3, ignored: 1 });
  });

  it('normalise les valeurs : dates ISO, flottants nettoyés, espaces trimés', async () => {
    const ligne = await prisma.row.findFirstOrThrow({
      where: { month: '2026-08', position: 0 },
    });
    expect(data(ligne)).toMatchObject({
      impe: '2026-08-03',
      client: 'ARCADIA',
      dpt: '49',
      cp_client: '49000',
      partenaire: 'EVERLINK',
      date: '2026-08-14',
      heure: '14h',
      tech: 'DIRECT',
      nom_cp: 'QUENTIN',
      statut: 'ATT CLIENT',
      materiel_recu: 'ENVOYE',
      num_chrono: '78',
    });
  });

  it('reprend les surlignages manuels rouge et jaune dans formats', async () => {
    const ligne = await prisma.row.findFirstOrThrow({
      where: { month: '2026-08', position: 2 },
    });
    expect(formats(ligne)).toEqual({ num_chrono: { bg: '#FF0000' } });

    const sansFormat = await prisma.row.findFirstOrThrow({
      where: { month: '2026-08', position: 0 },
    });
    expect(formats(sansFormat)).toEqual({});
  });

  it('importe telle quelle une valeur de liste inconnue et la consigne en anomalie', async () => {
    const ligne = await prisma.row.findFirstOrThrow({
      where: { month: '2026-08', position: 1 },
    });
    expect(data(ligne)['partenaire']).toBe('PARTENAIRE INCONNU');

    const feuille = rapport.sheets.find((s) => s.sheet === 'AOUT 2026');
    expect(feuille?.anomalies).toEqual(
      expect.arrayContaining([
        expect.stringContaining('PARTENAIRE INCONNU'),
      ]),
    );
  });

  it('mappe la feuille historique MARS 2025 par ses en-têtes réels', async () => {
    const lignes = await prisma.row.findMany({ where: { month: '2025-03', archived: false } });
    expect(lignes).toHaveLength(1);
    expect(data(lignes[0])).toMatchObject({
      impe: '2025-03-04',
      client: 'MAIRIE DE X',
      partenaire: 'OR-TEL',
      date: '2025-03-18',
      heure: '10h',
      tech: 'ADWEB',
      nom_tech: 'Chaabane',
      nom_cp: 'MARCO',
      statut: 'CLOTUREE',
      materiel_recu: 'LIVRE',
      num_chrono: 'XB123',
    });
    expect(data(lignes[0])['dpt']).toBeUndefined();
  });

  it('déverse les colonnes non mappées dans commentaires_planif', async () => {
    const ligne = await prisma.row.findFirstOrThrow({ where: { month: '2025-03', archived: false } });
    expect(data(ligne)['commentaires_planif']).toBe(
      'installe | DERNIERE ADV: ADV du 12/03 | SUIVI LIENS: https://z.eu/1 | CR ET PV ENVOYES ET CLASSES: CLASSE',
    );

    const feuille = rapport.sheets.find((s) => s.sheet === 'MARS 2025');
    expect(feuille?.anomalies).toEqual(
      expect.arrayContaining([
        expect.stringContaining('DERNIERE ADV'),
      ]),
    );
  });

  it('importe ARCHIVES OK avec archived=true et le mois déduit de la date', async () => {
    const archives = await prisma.row.findMany({
      where: { archived: true },
      orderBy: { position: 'asc' },
    });
    expect(archives).toHaveLength(2);
    expect(archives.every((l) => l.archived)).toBe(true);
    expect(archives[0].month).toBe('2025-02');
    expect(archives[1].month).toBe('2025-03');
    expect(data(archives[0])['partenaire']).toBe('ENTREPRISE PRO');
    expect(data(archives[0])['commentaires_planif']).toContain('COLONNE B: CABINET DENTAIRE');
    expect(data(archives[1])['commentaires_planif']).toContain('COLONNE I: INSTALLATION');
  });

  it('totalise les lignes importées dans le rapport', () => {
    expect(rapport.rows).toBe(6);
  });
});
```

- [ ] **Étape 2: lancer le test**

```bash
pnpm --filter @suivi/api test:e2e -- import-rows.e2e-spec
```

Attendu : **FAIL** — la feuille `AOUT 2026` est importée à 0 ligne (`importSheet` est le bouchon de la Task 9.6) : `expect(lignes).toHaveLength(3)` reçoit `0`.

- [ ] **Étape 3: implémenter `importSheet`**

Dans `apps/api/src/import/import.service.ts`, **supprimer le bouchon `importSheet`** et le remplacer par le bloc suivant (à placer avant `importWorkbook` ou à la fin du fichier, les fonctions étant hissées) :

```ts
interface CellsOutcome {
  data: Record<string, string>;
  formats: Record<string, { bg: string }>;
  firstIsoDate: string | null;
  offListValues: { key: string; value: string }[];
  overflowIndices: number[];
  empty: boolean;
}

function readRowCells(
  worksheet: Worksheet,
  rowNumber: number,
  mapping: HeaderMapping,
): CellsOutcome {
  const ligne = worksheet.getRow(rowNumber);
  const data: Record<string, string> = {};
  const formats: Record<string, { bg: string }> = {};
  const overflowIndices: number[] = [];
  const overflowTextes: string[] = [];
  let firstIsoDate: string | null = null;
  let nbValeurs = 0;

  for (let index = 0; index < mapping.keyByIndex.length; index++) {
    const cellule = ligne.getCell(index + 1);
    const valeur = normalizeCellValue(cellule.value);
    if (valeur === null) {
      continue;
    }
    nbValeurs++;
    if (firstIsoDate === null && ISO_DATE.test(valeur)) {
      firstIsoDate = valeur;
    }

    const cle = mapping.keyByIndex[index];
    if (cle === null) {
      overflowIndices.push(index);
      overflowTextes.push(`${mapping.labelByIndex[index]}: ${valeur}`);
      continue;
    }

    data[cle] = valeur;
    const surlignage = highlightOf(cellule);
    if (surlignage !== null) {
      formats[cle] = { bg: surlignage };
    }
  }

  if (overflowTextes.length > 0) {
    const existant = data['commentaires_planif'];
    const deverse = overflowTextes.join(' | ');
    data['commentaires_planif'] = existant === undefined ? deverse : `${existant} | ${deverse}`;
  }

  const offListValues: { key: string; value: string }[] = [];
  for (const key of SELECT_KEYS) {
    const valeur = data[key];
    if (valeur !== undefined && !allowedValues(key).has(valeur)) {
      offListValues.push({ key, value: valeur });
    }
  }

  return {
    data,
    formats,
    firstIsoDate,
    offListValues,
    overflowIndices,
    empty: nbValeurs === 0,
  };
}

function monthOfRow(cells: CellsOutcome): string {
  const candidats = [cells.data['date'], cells.data['impe'], cells.firstIsoDate];
  for (const candidat of candidats) {
    if (typeof candidat === 'string' && ISO_DATE.test(candidat)) {
      return candidat.slice(0, 7);
    }
  }
  return ARCHIVES_FALLBACK_MONTH;
}

async function importSheet(
  prisma: PrismaClient,
  worksheet: Worksheet,
  month: string | null,
  archived: boolean,
): Promise<SheetReport> {
  const mapping = buildHeaderMap(headersOf(worksheet));
  const lignes: BuiltRow[] = [];
  const horsListe = new Map<string, number>();
  const nonMappees = new Set<number>();
  let ignorees = 0;

  const derniereLigne = Math.min(worksheet.rowCount, MAX_LIGNES);
  for (let numero = 2; numero <= derniereLigne; numero++) {
    const cells = readRowCells(worksheet, numero, mapping);
    if (cells.empty) {
      ignorees++;
      continue;
    }

    for (const index of cells.overflowIndices) {
      nonMappees.add(index);
    }
    for (const hors of cells.offListValues) {
      const cle = `${hors.key} ${hors.value}`;
      horsListe.set(cle, (horsListe.get(cle) ?? 0) + 1);
    }

    lignes.push({
      month: month ?? monthOfRow(cells),
      position: lignes.length,
      data: cells.data,
      formats: cells.formats,
      archived,
    });
  }

  await insertRows(prisma, lignes);

  const anomalies: string[] = [];
  if (nonMappees.size > 0) {
    const libelles = [...nonMappees]
      .sort((a, b) => a - b)
      .map((index) => mapping.labelByIndex[index]);
    anomalies.push(
      `colonnes hors périmètre reportées dans commentaires_planif : ${libelles.join(', ')}`,
    );
  }
  for (const [cle, occurrences] of horsListe) {
    const separateur = cle.indexOf(' ');
    const colonne = cle.slice(0, separateur);
    const valeur = cle.slice(separateur + 1);
    anomalies.push(
      `valeur « ${valeur} » hors liste pour la colonne ${colonne} (${occurrences} ligne(s)) — importée telle quelle`,
    );
  }

  return {
    sheet: worksheet.name,
    month,
    archived,
    imported: lignes.length,
    ignored: ignorees,
    anomalies,
  };
}
```

- [ ] **Étape 4: relancer le test**

```bash
pnpm --filter @suivi/api test:e2e -- import-rows.e2e-spec
```

Attendu : **PASS** — 9 cas verts.

- [ ] **Étape 5: relancer le test de la tâche précédente (non-régression)**

```bash
pnpm --filter @suivi/api test:e2e -- import-schema.e2e-spec
```

Attendu : **PASS** — les 6 cas de la Task 9.6 restent verts.

- [ ] **Étape 6: commit**

```bash
git add apps/api/src/import/import.service.ts apps/api/test/import-rows.e2e-spec.ts && git commit -m "feat(import): import des lignes mensuelles, surlignages, anomalies et archives"
```

> À vérifier à l'exécution : `worksheet.rowCount` d'exceljs renvoie l'index de la dernière ligne *matérialisée* (1024 pour `AOUT 2026` dans le fichier réel, alors que seules 201 portent des données) — d'où le filtrage des lignes vides et le plafond `MAX_LIGNES`. Vérifier après l'import réel que `AOUT 2026` reporte bien `imported: 200`.

---

### Task 9.8: Script CLI `import:xlsx` et rapport console

**Files:**
- Create: `apps/api/src/import/run-import.ts`
- Modify: `apps/api/src/import/import.service.ts` (ajout de `formatReport`), `apps/api/package.json` (script `import:xlsx`)
- Test: `apps/api/src/import/format-report.spec.ts`

**Interfaces:**
- Consomme : `ImportReport` et `SheetReport` (Task 9.6), `importWorkbook` (Tasks 9.6/9.7), `PrismaClient`.
- Produit :
  - `export function formatReport(report: ImportReport): string` — rapport texte, une ligne par feuille + détail des anomalies.
  - script `apps/api/src/import/run-import.ts` (point d'entrée CLI, argument = chemin du classeur).
  - script npm `"import:xlsx": "ts-node src/import/run-import.ts"` dans `apps/api/package.json`.

- [ ] **Étape 1: écrire le test unitaire qui échoue**

Créer `apps/api/src/import/format-report.spec.ts` :

```ts
import { formatReport, type ImportReport } from './import.service';

const RAPPORT: ImportReport = {
  file: '/tmp/classeur.xlsx',
  columns: 16,
  choices: 83,
  rows: 203,
  sheets: [
    {
      sheet: 'AOUT 2026',
      month: '2026-08',
      archived: false,
      imported: 200,
      ignored: 823,
      anomalies: ['valeur « PARTE INCONNU » hors liste pour la colonne partenaire (2 ligne(s)) — importée telle quelle'],
    },
    { sheet: 'MARS 2025', month: '2025-03', archived: false, imported: 1, ignored: 0, anomalies: [] },
    { sheet: 'ARCHIVES OK ', month: null, archived: true, imported: 2, ignored: 0, anomalies: [] },
  ],
};

describe('formatReport', () => {
  it('affiche les compteurs globaux', () => {
    const texte = formatReport(RAPPORT);
    expect(texte).toContain('Import terminé — fichier : /tmp/classeur.xlsx');
    expect(texte).toContain('Colonnes créées : 16');
    expect(texte).toContain('choix créés : 83');
    expect(texte).toContain('lignes créées : 203');
  });

  it('affiche une ligne par feuille avec importées / ignorées / anomalies', () => {
    const lignes = formatReport(RAPPORT).split('\n');
    expect(lignes.some((l) => l.includes('AOUT 2026') && l.includes('2026-08') && l.includes('200') && l.includes('823'))).toBe(true);
    expect(lignes.some((l) => l.includes('ARCHIVES OK') && l.includes('archives'))).toBe(true);
  });

  it('détaille les anomalies feuille par feuille', () => {
    const texte = formatReport(RAPPORT);
    expect(texte).toContain('Anomalies détaillées :');
    expect(texte).toContain('[AOUT 2026]');
    expect(texte).toContain('PARTE INCONNU');
  });

  it('omet la section des anomalies quand il n’y en a aucune', () => {
    const texte = formatReport({ ...RAPPORT, sheets: [RAPPORT.sheets[1]] });
    expect(texte).not.toContain('Anomalies détaillées :');
  });
});
```

- [ ] **Étape 2: lancer le test**

```bash
pnpm --filter @suivi/api test:unit -- format-report.spec
```

Attendu : **FAIL** — `import.service.ts` n'exporte pas `formatReport` : `TypeError: (0 , import_service_1.formatReport) is not a function`.

- [ ] **Étape 3: implémenter `formatReport`**

Ajouter à la fin de `apps/api/src/import/import.service.ts` :

```ts
/** Rapport texte affiché en fin d'import par le script CLI. */
export function formatReport(report: ImportReport): string {
  const lignes: string[] = [];
  lignes.push(`Import terminé — fichier : ${report.file}`);
  lignes.push(
    `Colonnes créées : ${report.columns} — choix créés : ${report.choices} — lignes créées : ${report.rows}`,
  );
  lignes.push('');
  lignes.push('Feuille                     | Mois     | Importées | Ignorées | Anomalies');
  lignes.push('----------------------------+----------+-----------+----------+----------');

  for (const feuille of report.sheets) {
    const nom = feuille.sheet.padEnd(27).slice(0, 27);
    const mois = (feuille.archived ? 'archives' : (feuille.month ?? '-')).padEnd(8);
    const importees = String(feuille.imported).padStart(9);
    const ignorees = String(feuille.ignored).padStart(8);
    const anomalies = String(feuille.anomalies.length).padStart(9);
    lignes.push(`${nom} | ${mois} | ${importees} | ${ignorees} | ${anomalies}`);
  }

  const avecAnomalies = report.sheets.filter((feuille) => feuille.anomalies.length > 0);
  if (avecAnomalies.length > 0) {
    lignes.push('');
    lignes.push('Anomalies détaillées :');
    for (const feuille of avecAnomalies) {
      lignes.push(`  [${feuille.sheet}]`);
      for (const anomalie of feuille.anomalies) {
        lignes.push(`    - ${anomalie}`);
      }
    }
  }

  return lignes.join('\n');
}
```

- [ ] **Étape 4: relancer le test**

```bash
pnpm --filter @suivi/api test:unit -- format-report.spec
```

Attendu : **PASS** — 4 cas verts.

- [ ] **Étape 5: écrire le point d'entrée CLI**

Créer `apps/api/src/import/run-import.ts` :

```ts
import { PrismaClient } from '@prisma/client';
import { formatReport, importWorkbook } from './import.service';

async function main(): Promise<void> {
  const chemin = process.argv[2];
  if (chemin === undefined || chemin.trim() === '') {
    console.error(
      'Usage : pnpm --filter @suivi/api import:xlsx "<chemin/vers/TABLEAU SUIVI COMMANDES 2026.xlsx>"',
    );
    process.exitCode = 1;
    return;
  }

  const prisma = new PrismaClient();
  try {
    console.log(`Import du classeur : ${chemin}`);
    console.log('Attention : cet import PURGE les colonnes, listes et lignes existantes.');
    const rapport = await importWorkbook(prisma, chemin);
    console.log(formatReport(rapport));
  } catch (erreur) {
    console.error("Échec de l'import :", erreur instanceof Error ? erreur.message : erreur);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

void main();
```

- [ ] **Étape 6: déclarer le script npm**

Dans `apps/api/package.json`, ajouter la ligne `import:xlsx` au bloc `scripts` (les autres scripts restent inchangés) :

```json
"scripts": {
  "dev": "nest start --watch",
  "build": "nest build",
  "start": "node dist/main.js",
  "test": "jest --passWithNoTests && jest --config ./test/jest-e2e.json",
  "test:unit": "jest --passWithNoTests",
  "test:e2e": "jest --config ./test/jest-e2e.json",
  "import:xlsx": "ts-node src/import/run-import.ts"
}
```

- [ ] **Étape 7: vérifier le message d'usage du CLI (sans argument)**

```bash
pnpm --filter @suivi/api import:xlsx
```

Attendu : la commande affiche `Usage : pnpm --filter @suivi/api import:xlsx "<chemin/vers/TABLEAU SUIVI COMMANDES 2026.xlsx>"` et sort en code 1, **sans toucher à la base**.

- [ ] **Étape 8: vérifier le CLI sur un classeur inexistant**

```bash
pnpm --filter @suivi/api import:xlsx /tmp/fichier-absent.xlsx
```

Attendu : `Échec de l'import : ENOENT: no such file or directory, open '/tmp/fichier-absent.xlsx'` et code de sortie 1.

- [ ] **Étape 9: commit**

```bash
git add apps/api/src/import/run-import.ts apps/api/src/import/import.service.ts apps/api/src/import/format-report.spec.ts apps/api/package.json && git commit -m "feat(import): script CLI import:xlsx et rapport console par feuille"
```

> À vérifier à l'exécution : `ts-node` doit compiler `src/import/run-import.ts` hors contexte NestJS. Si `ts-node` bute sur les décorateurs ou la résolution de `@suivi/shared`, remplacer le script par `"import:xlsx": "ts-node --transpile-only src/import/run-import.ts"` (même option que le seed de la Feature 1).

---

### Task 9.9: Test d'intégration conditionnel sur le classeur réel

**Files:**
- Test: `apps/api/test/import-fichier-reel.e2e-spec.ts`

**Interfaces:**
- Consomme : `importWorkbook` et `ImportReport` (Tasks 9.6/9.7), `PrismaClient`.
- Produit : validation de bout en bout sur `/home/dev/Téléchargements/TABLEAU SUIVI COMMANDES 2026(1).xlsx` ; suite entièrement **skippée avec message** si le fichier est absent (poste de CI, autre machine).

**Attention:** cette suite purge la base pointée par `DATABASE_URL` et y charge les données réelles. À exécuter uniquement sur la base de dev.

- [ ] **Étape 1: écrire le test qui échoue**

Créer `apps/api/test/import-fichier-reel.e2e-spec.ts` :

```ts
import { existsSync } from 'node:fs';
import { PrismaClient, type Row } from '@prisma/client';
import { importWorkbook, type ImportReport } from '../src/import/import.service';

const FICHIER_REEL = '/home/dev/Téléchargements/TABLEAU SUIVI COMMANDES 2026(1).xlsx';
const disponible = existsSync(FICHIER_REEL);

if (!disponible) {
  // eslint-disable-next-line no-console
  console.warn(
    `[import réel] suite ignorée : classeur introuvable à « ${FICHIER_REEL} ». ` +
      'Déposer le classeur Zoho à cet emplacement pour exécuter ce test.',
  );
}

const decrire = disponible ? describe : describe.skip;

decrire('importWorkbook — classeur Zoho réel (e2e)', () => {
  const prisma = new PrismaClient();
  let rapport: ImportReport;

  beforeAll(async () => {
    rapport = await importWorkbook(prisma, FICHIER_REEL);
  }, 300000);

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('crée les 16 colonnes du contrat', async () => {
    const colonnes = await prisma.column.findMany({ orderBy: { position: 'asc' } });
    expect(colonnes).toHaveLength(16);
    expect(colonnes.map((c) => c.key)).toEqual([
      'impe', 'client', 'dpt', 'cp_client', 'partenaire', 'date',
      'porta_commentaires', 'heure', 'tech', 'nom_tech', 'nom_cp', 'statut',
      'commentaires_planif', 'materiel_recu', 'num_chrono', 'infos_facturation',
    ]);
  });

  it('importe 200 lignes pour la feuille AOUT 2026 dans le mois 2026-08', async () => {
    const feuille = rapport.sheets.find((s) => s.sheet === 'AOUT 2026');
    expect(feuille).toMatchObject({ month: '2026-08', archived: false, imported: 200 });
    expect(await prisma.row.count({ where: { month: '2026-08', archived: false } })).toBe(200);
  });

  it('traite les 18 feuilles mensuelles et ignore TEST et Feuille1', () => {
    const mensuelles = rapport.sheets.filter((s) => !s.archived);
    expect(mensuelles).toHaveLength(18);
    expect(rapport.sheets.map((s) => s.sheet)).not.toContain('TEST');
    expect(rapport.sheets.map((s) => s.sheet)).not.toContain('Feuille1');
  });

  it('importe la feuille ARCHIVES OK avec archived=true', async () => {
    const feuille = rapport.sheets.find((s) => s.archived);
    expect(feuille?.sheet.trim()).toBe('ARCHIVES OK');
    expect(feuille?.imported).toBeGreaterThan(0);

    const archives: Row[] = await prisma.row.findMany({ where: { archived: true } });
    expect(archives.length).toBe(feuille?.imported);
    expect(archives.every((ligne) => ligne.archived)).toBe(true);
    expect(archives.every((ligne) => /^\d{4}-\d{2}$/.test(ligne.month))).toBe(true);
  });

  it('colore EVERLINK avec le fond #229955 relevé dans le classeur', async () => {
    const everlink = await prisma.choice.findFirstOrThrow({
      where: { label: 'EVERLINK', column: { key: 'partenaire' } },
    });
    expect(everlink.bgColor).toBe('#229955');
  });

  it('reprend au moins un surlignage manuel rouge ou jaune', async () => {
    const surlignees = await prisma.$queryRaw<{ total: bigint }[]>`
      SELECT COUNT(*)::bigint AS total FROM "Row" WHERE "formats"::text <> '{}'
    `;
    expect(Number(surlignees[0].total)).toBeGreaterThan(0);
  });

  it('est rejouable : un second import redonne les mêmes compteurs', async () => {
    const second = await importWorkbook(prisma, FICHIER_REEL);
    expect(second.columns).toBe(rapport.columns);
    expect(second.choices).toBe(rapport.choices);
    expect(second.rows).toBe(rapport.rows);
  }, 300000);
});
```

- [ ] **Étape 2: lancer le test**

```bash
pnpm --filter @suivi/api test:e2e -- import-fichier-reel.e2e-spec
```

Attendu, **si le classeur est présent** : **FAIL** possible sur `imported: 200` ou sur les compteurs de feuilles tant que les garde-fous (`MAX_LIGNES`, filtrage des lignes vides) n'ont pas été confrontés au vrai fichier. Attendu **si le classeur est absent** : suite entièrement skippée avec le message `[import réel] suite ignorée : classeur introuvable…` et statut vert.

- [ ] **Étape 3: corriger l'import d'après le rapport réel**

Lancer l'import réel en CLI pour lire le rapport complet :

```bash
pnpm --filter @suivi/api import:xlsx "/home/dev/Téléchargements/TABLEAU SUIVI COMMANDES 2026(1).xlsx"
```

Attendu : le tableau du rapport liste 19 feuilles (18 mensuelles + `ARCHIVES OK `), `AOUT 2026` à 200 lignes importées, et la section « Anomalies détaillées » énumère par feuille les colonnes hors périmètre (`DERNIERE ADV`, `SUIVI LIENS`, `CR ET PV ENVOYES ET CLASSES`, `COLLECTE`, `MESSAGE`) et les valeurs de liste inconnues.

Si un écart apparaît, corriger **uniquement** dans `apps/api/src/import/` :

- un en-tête réel non prévu par la table `ALIAS` (Task 9.5) apparaît dans les anomalies alors qu'il correspond à une colonne du contrat → ajouter l'alias dans `ALIAS` **et** son cas dans `header-mapping.spec.ts` ;
- un décalage de date d'un jour → appliquer la note de la Task 9.3 (accesseurs locaux dans `versDateIso`) ;
- un nombre de lignes importées supérieur à l'attendu sur une feuille → vérifier que les lignes de total/commentaire en bas de feuille tombent bien dans le filtre « ligne vide ».

- [ ] **Étape 4: relancer le test**

```bash
pnpm --filter @suivi/api test:e2e -- import-fichier-reel.e2e-spec
```

Attendu : **PASS** — 7 cas verts (16 colonnes, 200 lignes en `2026-08`, 18 feuilles mensuelles, archives `archived=true`, `EVERLINK` en `#229955`, surlignages présents, import rejouable).

- [ ] **Étape 5: commit**

```bash
git add apps/api/test/import-fichier-reel.e2e-spec.ts apps/api/src/import && git commit -m "test(import): integration conditionnelle sur le classeur Zoho reel"
```

> À vérifier à l'exécution : la requête `prisma.$queryRaw` cible la table `"Row"` telle que nommée par Prisma (pas de `@@map` dans le schéma des contrats). Si le nom physique différait, remplacer l'assertion par un `findMany` sur `Row` puis un filtre `Object.keys(row.formats as object).length > 0` en TypeScript.

---

### Task 9.10: Vérification complète du périmètre et merge dans `develop`

**Files:**
- Modify: aucun — exécution des suites et intégration.
- Test: l'ensemble des suites unitaires et e2e de `@suivi/api` et `@suivi/shared`.

**Interfaces:**
- Consomme : tout ce qui a été produit par les Tasks 9.1 à 9.9.
- Produit : branche `feature/import-xlsx` fusionnée dans `develop` et poussée ; commande `pnpm --filter @suivi/api import:xlsx <fichier>` disponible pour la mise en service (spec §8) ; modules `repair-zoho`, `month-mapping`, `normalize`, `colors`, `header-mapping`, `import.service` réutilisables par un futur import incrémental.

- [ ] **Étape 1: vérifier la compilation TypeScript stricte de l'API**

```bash
pnpm --filter @suivi/api build
```

Attendu : **PASS** — build terminé sans erreur (aucun `any` implicite, `exceljs`/`jszip` correctement typés).

- [ ] **Étape 2: lancer tous les tests unitaires du périmètre import**

```bash
pnpm --filter @suivi/api test:unit -- --testPathPattern "src/import"
```

Attendu : **PASS** — 6 suites vertes : `repair-zoho.spec.ts` (4 cas), `month-mapping.spec.ts` (5 cas), `normalize.spec.ts` (10 cas), `colors.spec.ts` (11 cas), `header-mapping.spec.ts` (8 cas), `format-report.spec.ts` (4 cas) — 42 cas au total.

- [ ] **Étape 3: lancer les suites e2e du périmètre import**

```bash
pnpm --filter @suivi/api test:e2e -- import
```

Attendu : **PASS** — `import-schema.e2e-spec.ts` (6 cas), `import-rows.e2e-spec.ts` (9 cas), `import-fichier-reel.e2e-spec.ts` (7 cas verts si le classeur est présent, suite skippée avec message sinon).

- [ ] **Étape 4: relancer la totalité des tests du monorepo**

```bash
pnpm -r test
```

Attendu : **PASS** — `@suivi/shared`, `@suivi/api` (et `@suivi/web` si sa suite existe déjà) verts. Aucun test rouge : condition obligatoire du merge (spec §11).

**Remarque :** les suites e2e des Features 2 à 4 vident et re-seedent la base ; l'import réel effectué en Task 9.9 est donc écrasé. Rejouer l'import après la campagne de tests si la base doit rester chargée :

```bash
pnpm --filter @suivi/api import:xlsx "/home/dev/Téléchargements/TABLEAU SUIVI COMMANDES 2026(1).xlsx"
```

- [ ] **Étape 5: fusionner dans `develop` et pousser**

```bash
git checkout develop && git merge --no-ff feature/import-xlsx -m "merge: feature/import-xlsx" && git push origin develop
```

Attendu : merge sans conflit (seuls `apps/api/package.json` et `pnpm-lock.yaml` sont partagés avec les autres features, et uniquement par ajout), puis push accepté.
