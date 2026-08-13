import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PrismaClient, type Row } from '@prisma/client';
import { seed } from '../prisma/seed';
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
    // Supprime les lignes synthétiques importées par le test.
    await prisma.rowEvent.deleteMany();
    await prisma.row.deleteMany();
    // Restaure l'état seedé (16 colonnes + choix) pour les suites voisines.
    await seed(prisma);
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
