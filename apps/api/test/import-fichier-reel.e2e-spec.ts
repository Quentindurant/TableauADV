import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient, type Row } from '@prisma/client';
import { seed } from '../prisma/seed';
import { importWorkbook, type ImportReport } from '../src/import/import.service';

// Export Zoho du 2026-08-31, premier classeur portant la colonne NO (col B
// de l'onglet AOUT 2026) et les en-têtes renommés PORTA / CONGES ET IMPORTANT
// et TEMPS ET COMM PLANIF.
const FICHIER_REEL = join(
  __dirname, '..', '..', '..', 'docs', 'TABLEAU SUIVI COMMANDES 2026(4).xlsx',
);
const disponible = existsSync(FICHIER_REEL);

if (!disponible) {
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
    // Purge les lignes réelles importées par cette suite (des milliers de
    // lignes issues du classeur Zoho, pas les données synthétiques des
    // suites voisines).
    await prisma.rowEvent.deleteMany();
    await prisma.row.deleteMany();
    // Restaure les 17 colonnes et 96 choix seedés pour les suites voisines.
    await seed(prisma);
    await prisma.$disconnect();
  }, 60000);

  it('crée les 17 colonnes du contrat', async () => {
    const colonnes = await prisma.column.findMany({ orderBy: { position: 'asc' } });
    expect(colonnes).toHaveLength(17);
    expect(colonnes.map((c) => c.key)).toEqual([
      'impe', 'no', 'client', 'dpt', 'cp_client', 'partenaire', 'date',
      'porta_commentaires', 'heure', 'tech', 'nom_tech', 'nom_cp', 'statut',
      'commentaires_planif', 'materiel_recu', 'num_chrono', 'infos_facturation',
    ]);
  });

  it('importe 252 lignes pour la feuille AOUT 2026 dans le mois 2026-08', async () => {
    const feuille = rapport.sheets.find((s) => s.sheet === 'AOUT 2026');
    expect(feuille).toMatchObject({ month: '2026-08', archived: false, imported: 252 });
    expect(await prisma.row.count({ where: { month: '2026-08', archived: false } })).toBe(252);
  });

  it('ne laisse aucun en-tête non mappé sur la feuille AOUT 2026', () => {
    const feuille = rapport.sheets.find((s) => s.sheet === 'AOUT 2026');
    expect(feuille?.anomalies).not.toEqual(
      expect.arrayContaining([
        expect.stringContaining('colonnes hors périmètre'),
      ]),
    );
  });

  it('mappe la colonne NO : n° de BC HIGHCOM et code de lot EVERLINK', async () => {
    const highcom = await prisma.row.findFirst({
      where: { month: '2026-08', archived: false, data: { path: ['no'], equals: '6534' } },
    });
    expect(highcom).not.toBeNull();
    expect((highcom?.data as Record<string, string>)['partenaire']).toBe('HIGHCOM');

    const everlink = await prisma.row.findFirst({
      where: { month: '2026-08', archived: false, data: { path: ['no'], equals: 'L1B' } },
    });
    expect(everlink).not.toBeNull();
    expect((everlink?.data as Record<string, string>)['partenaire']).toBe('EVERLINK');
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

  it('colore EVERLINK avec le fond doux #7DCEA0 de la palette validée', async () => {
    const everlink = await prisma.choice.findFirstOrThrow({
      where: { label: 'EVERLINK', column: { key: 'partenaire' } },
    });
    expect(everlink.bgColor).toBe('#7DCEA0');
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
