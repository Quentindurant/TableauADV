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
    // Restaure l'état seedé (16 colonnes + choix) pour les suites voisines
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

  it('crée les 16 colonnes dans l’ordre A..P avec leurs libellés', async () => {
    const colonnes = await prisma.column.findMany({ orderBy: { position: 'asc' } });
    expect(colonnes).toHaveLength(16);
    expect(colonnes.map((c) => c.key)).toEqual([
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
