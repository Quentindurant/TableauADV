import { existsSync } from 'node:fs';
import { PrismaClient, type Row } from '@prisma/client';
import { seed } from '../prisma/seed';
import { importWorkbook, type ImportReport } from '../src/import/import.service';

const FICHIER_REEL = '/home/dev/Téléchargements/TABLEAU SUIVI COMMANDES 2026(1).xlsx';
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
    // Restaure les 16 colonnes et 83 choix seedés pour les suites voisines.
    await seed(prisma);
    await prisma.$disconnect();
  }, 60000);

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
