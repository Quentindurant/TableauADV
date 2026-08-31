import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { pastelFor } from '@suivi/shared';
import { seed } from '../prisma/seed';
import { importWorkbook, DEFAULT_COLUMN_WIDTH } from '../src/import/import.service';
import { buildTestWorkbookBuffer } from './helpers/build-workbook';

const TEMOIN_EMAIL = 'temoin-import@example.test';

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
    // Supprime les lignes synthétiques importées par les tests.
    await prisma.rowEvent.deleteMany();
    await prisma.row.deleteMany();
    // Restaure l'état seedé (17 colonnes + choix) pour les suites voisines
    // et retire l'utilisateur témoin créé par le test ci-dessous.
    await seed(prisma);
    await prisma.user.deleteMany({ where: { email: TEMOIN_EMAIL } });
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

  it('crée les 17 colonnes dans l’ordre du classeur avec leurs libellés', async () => {
    const colonnes = await prisma.column.findMany({ orderBy: { position: 'asc' } });
    expect(colonnes).toHaveLength(17);
    expect(colonnes.map((c) => c.key)).toEqual([
      'impe',
      'no',
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
    expect(colonnes.map((c) => c.position)).toEqual([...Array(17).keys()]);
    expect(colonnes[12]).toMatchObject({ label: 'INSTALLATION', type: 'SELECT' });
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

  it('crée les 88 choix avec les couleurs des contrats', async () => {
    expect(await prisma.choice.count()).toBe(88);

    const partenaire = await prisma.column.findUniqueOrThrow({
      where: { key: 'partenaire' },
      include: { choices: { orderBy: { position: 'asc' } } },
    });
    const parLabel = Object.fromEntries(partenaire.choices.map((c) => [c.label, c]));
    expect(partenaire.choices).toHaveLength(41);
    expect(parLabel['EVERLINK']).toMatchObject({ bgColor: '#7DCEA0', textColor: '#0E4D28' });
    expect(parLabel['CUBE']).toMatchObject({
      bgColor: pastelFor('CUBE').bg,
      textColor: pastelFor('CUBE').text,
    });

    const statut = await prisma.column.findUniqueOrThrow({
      where: { key: 'statut' },
      include: { choices: true },
    });
    const statuts = Object.fromEntries(statut.choices.map((c) => [c.label, c]));
    expect(statuts['NEW']).toMatchObject({ bgColor: '#F7DC6F', textColor: '#6B5504', bold: true });
    expect(statuts['ATT GC']).toMatchObject({ bgColor: '#F8B5C8', textColor: '#943126', bold: true });
    expect(statuts['A DISTANCE']).toMatchObject({ bgColor: null, textColor: null, bold: false });
  });

  it('rend un rapport avec les compteurs globaux', async () => {
    const rapport = await importWorkbook(prisma, chemin);
    expect(rapport.file).toBe(chemin);
    expect(rapport.columns).toBe(17);
    expect(rapport.choices).toBe(88);
    expect(rapport.sheets.map((s) => s.sheet)).toEqual(['AOUT 2026', 'MARS 2025', 'ARCHIVES OK ']);
  }, 120000);
});
