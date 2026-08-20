import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Prisma, PrismaClient } from '@prisma/client';
import { pastelFor } from '@suivi/shared';
import { seed } from '../prisma/seed';

const MIGRATIONS_DIR = join(__dirname, '..', 'prisma', 'migrations');
const MIGRATION_SUFFIX = '_nom_tech_select_referentiel';

/** SQL brut de la migration, tel qu'il sera rejoué en prod par `prisma migrate deploy`. */
function migrationSql(): string {
  const dossier = readdirSync(MIGRATIONS_DIR).find((nom) => nom.endsWith(MIGRATION_SUFFIX));
  if (dossier === undefined) {
    throw new Error(`Migration ${MIGRATION_SUFFIX} introuvable dans ${MIGRATIONS_DIR}.`);
  }
  return readFileSync(join(MIGRATIONS_DIR, dossier, 'migration.sql'), 'utf8');
}

/**
 * Rejoue la migration `nom_tech_select_referentiel` sur un état « legacy » reconstruit
 * (colonne nom_tech en TEXT, aucun choice, lignes réparties sur plusieurs mois dont une
 * archivée) et vérifie le contrat : type SELECT, un choice par valeur distincte non vide,
 * positions alphabétiques, couleurs pastelFor (parité djb2 SQL/TS), données de lignes
 * intactes, migration rejouable sans doublon.
 */
describe('Migration nom_tech → SELECT (référentiel techniciens)', () => {
  const prisma = new PrismaClient();

  // BERNARD < DURAND < MARTIN < PÉPIN : initiales ASCII distinctes, l'ordre alphabétique
  // attendu ne dépend donc pas de la collation de la base.
  const LIGNES = [
    { month: '2026-05', position: 0, archived: true,  data: { nom_tech: 'DURAND', client: 'ARCHIVE SARL' } },
    { month: '2026-06', position: 0, archived: false, data: { nom_tech: 'MARTIN', client: 'ACME' } },
    { month: '2026-06', position: 1, archived: false, data: { nom_tech: 'BERNARD' } },
    { month: '2026-07', position: 0, archived: false, data: { nom_tech: 'MARTIN' } }, // doublon inter-mois
    { month: '2026-07', position: 1, archived: false, data: { nom_tech: 'PÉPIN' } }, // accent : parité djb2
    { month: '2026-07', position: 2, archived: false, data: { nom_tech: '   ' } }, // blanc → ignoré
    { month: '2026-07', position: 3, archived: false, data: { nom_tech: '' } }, // vide → ignoré
    { month: '2026-07', position: 4, archived: false, data: { client: 'SANS TECH' } }, // absent → ignoré
  ];
  const LABELS_ATTENDUS = ['BERNARD', 'DURAND', 'MARTIN', 'PÉPIN'];

  beforeAll(async () => {
    // État legacy : colonne nom_tech encore en TEXT, sans aucun choice.
    await prisma.row.deleteMany();
    await prisma.choice.deleteMany();
    await prisma.column.deleteMany();
    await prisma.column.create({
      data: { key: 'nom_tech', label: 'NOM TECH', type: 'TEXT', position: 9, width: 160 },
    });
    await prisma.row.createMany({
      data: LIGNES.map((ligne) => ({ ...ligne, data: ligne.data as Prisma.InputJsonValue })),
    });

    const sql = migrationSql();
    await prisma.$executeRawUnsafe(sql);
    await prisma.$executeRawUnsafe(sql); // idempotente : rejouable sans doublon ni erreur
  }, 60000);

  afterAll(async () => {
    // Restaure l'état seedé pour les suites voisines.
    await prisma.row.deleteMany();
    await prisma.choice.deleteMany();
    await prisma.column.deleteMany();
    await seed(prisma);
    await prisma.$disconnect();
  });

  it('passe la colonne nom_tech en SELECT sans toucher au reste de sa définition', async () => {
    const colonne = await prisma.column.findUniqueOrThrow({ where: { key: 'nom_tech' } });
    expect(colonne).toMatchObject({ label: 'NOM TECH', type: 'SELECT', position: 9, width: 160 });
  });

  it('crée un choice par valeur distincte non vide — tous mois confondus, archivés inclus — même rejouée deux fois', async () => {
    const choix = await prisma.choice.findMany({
      where: { column: { key: 'nom_tech' } },
      orderBy: { position: 'asc' },
    });
    expect(choix.map((c) => c.label)).toEqual(LABELS_ATTENDUS);
    expect(choix.map((c) => c.position)).toEqual([0, 1, 2, 3]);
    expect(choix.every((c) => !c.archived && !c.bold)).toBe(true);
  });

  it('colore chaque choice via la palette pastelFor (parité djb2 entre SQL et TypeScript)', async () => {
    const choix = await prisma.choice.findMany({ where: { column: { key: 'nom_tech' } } });
    expect(choix).toHaveLength(LABELS_ATTENDUS.length);
    for (const choice of choix) {
      const attendu = pastelFor(choice.label);
      expect({ label: choice.label, bg: choice.bgColor, text: choice.textColor }).toEqual({
        label: choice.label,
        bg: attendu.bg,
        text: attendu.text,
      });
    }
  });

  it('ne modifie aucune donnée de ligne (data, archived, version)', async () => {
    const lignes = await prisma.row.findMany({
      orderBy: [{ month: 'asc' }, { position: 'asc' }],
    });
    expect(lignes).toHaveLength(LIGNES.length);
    for (const [index, ligne] of lignes.entries()) {
      expect(ligne.data).toEqual(LIGNES[index].data);
      expect(ligne.archived).toBe(LIGNES[index].archived);
      expect(ligne.version).toBe(0);
    }
  });
});
