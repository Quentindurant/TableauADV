import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import { pastelFor } from '@suivi/shared';
import { seed } from '../prisma/seed';

describe('Seed initial (idempotent)', () => {
  const prisma = new PrismaClient();

  beforeAll(async () => {
    // Etat propre : la migration nom_tech_select_referentiel peut avoir créé des
    // choix supplémentaires depuis les données existantes — les comptages ci-dessous
    // ne portent que sur ce que le seed produit.
    await prisma.row.deleteMany();
    await prisma.choice.deleteMany();
    await prisma.column.deleteMany();
    await seed(prisma);
    await seed(prisma); // rejouable : la 2e exécution ne doit rien dupliquer
  }, 60000);

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('crée exactement 17 colonnes, sans doublon après deux exécutions', async () => {
    expect(await prisma.column.count()).toBe(17);
    const statut = await prisma.column.findUniqueOrThrow({ where: { key: 'statut' } });
    expect(statut).toMatchObject({ label: 'INSTALLATION', type: 'SELECT', position: 12, width: 150 });
    const impe = await prisma.column.findUniqueOrThrow({ where: { key: 'impe' } });
    expect(impe).toMatchObject({ label: 'IMPE', type: 'DATE', position: 0 });
    const no = await prisma.column.findUniqueOrThrow({ where: { key: 'no' } });
    expect(no).toMatchObject({ label: 'NO', type: 'TEXT', position: 1, width: 90 });
  });

  it('crée 96 choix (20 statuts + 41 partenaires + 14 tech + 8 noms tech + 10 CP + 3 matériel)', async () => {
    expect(await prisma.choice.count()).toBe(96);
    const parCle = async (key: string) =>
      prisma.choice.count({ where: { column: { key } } });
    expect(await parCle('statut')).toBe(20);
    expect(await parCle('partenaire')).toBe(41);
    expect(await parCle('tech')).toBe(14);
    expect(await parCle('nom_tech')).toBe(8);
    expect(await parCle('nom_cp')).toBe(10);
    expect(await parCle('materiel_recu')).toBe(3);
  });

  it('couvre le vocabulaire de statuts poussé et lu par Everlink', async () => {
    const statut = await prisma.column.findUniqueOrThrow({
      where: { key: 'statut' },
      include: { choices: true },
    });
    const parLabel = Object.fromEntries(statut.choices.map((c) => [c.label, c]));
    expect(parLabel['PORTA']).toMatchObject({ bgColor: '#C39BD3', bold: true });
    expect(parLabel['TECHNIQUE']).toMatchObject({ bgColor: '#E9C46A' });
    expect(parLabel['OPER']).toMatchObject({ bgColor: '#EBDEF0' });
    expect(parLabel['PV']).toMatchObject({ bgColor: '#763E8D', textColor: '#FFFFFF' });
  });

  it('applique les couleurs exactes des statuts (palette douce)', async () => {
    const statut = await prisma.column.findUniqueOrThrow({
      where: { key: 'statut' },
      include: { choices: true },
    });
    const parLabel = Object.fromEntries(statut.choices.map((c) => [c.label, c]));
    expect(parLabel['NEW']).toMatchObject({ bgColor: '#F7DC6F', textColor: '#6B5504', bold: true });
    expect(parLabel['ATT PV']).toMatchObject({ bgColor: '#744388', textColor: '#FFFFFF', bold: true });
    expect(parLabel['ATT GC']).toMatchObject({ bgColor: '#F8B5C8', textColor: '#943126', bold: true });
    expect(parLabel['EN COLLECTE']).toMatchObject({ bgColor: '#F9E79F', textColor: '#786208', bold: false });
    expect(parLabel['A DISTANCE']).toMatchObject({ bgColor: null, textColor: null, bold: false });
    expect(parLabel['CLOTUREE']).toMatchObject({ bgColor: '#D5D8DC', textColor: '#4D5656', bold: false });
  });

  it('colore les 6 partenaires Excel en dur et les autres via pastelFor', async () => {
    const parte = await prisma.column.findUniqueOrThrow({
      where: { key: 'partenaire' },
      include: { choices: true },
    });
    const parLabel = Object.fromEntries(parte.choices.map((c) => [c.label, c]));
    expect(parLabel['EVERLINK']).toMatchObject({ bgColor: '#7DCEA0', textColor: '#0E4D28' });
    expect(parLabel['OR-TEL']).toMatchObject({ bgColor: '#F7DC6F', textColor: '#6B5504' });
    expect(parLabel['WETELGROUP']).toMatchObject({ bgColor: '#FCDAE3', textColor: '#943126' });
    expect(parLabel['CUBE']).toMatchObject({
      bgColor: pastelFor('CUBE').bg,
      textColor: pastelFor('CUBE').text,
    });
    expect(parLabel['2A Consulting']).toMatchObject({
      bgColor: pastelFor('2A Consulting').bg,
      textColor: pastelFor('2A Consulting').text,
    });
  });

  it('colore la liste tech selon le contrat', async () => {
    const tech = await prisma.column.findUniqueOrThrow({
      where: { key: 'tech' },
      include: { choices: true },
    });
    const parLabel = Object.fromEntries(tech.choices.map((c) => [c.label, c]));
    expect(parLabel['DIRECT']).toMatchObject({ bgColor: null, textColor: '#0072A8', bold: true });
    expect(parLabel['ADWEB']).toMatchObject({ bgColor: null, textColor: '#196F3D', bold: true });
    expect(parLabel['VOSGES INFO']).toMatchObject({ bgColor: null, textColor: '#196F3D', bold: true });
    expect(parLabel['NETWORK']).toMatchObject({ bgColor: null, textColor: null, bold: false });
  });

  it('crée le référentiel techniciens : nom_tech en SELECT, choix colorés via pastelFor', async () => {
    const nomTech = await prisma.column.findUniqueOrThrow({
      where: { key: 'nom_tech' },
      include: { choices: { orderBy: { position: 'asc' } } },
    });
    expect(nomTech).toMatchObject({ label: 'NOM TECH', type: 'SELECT', position: 10 });
    expect(nomTech.choices.map((c) => c.label)).toEqual([
      'ANTHONY', 'BENJAMIN', 'CHRISTOPHE', 'DAVID', 'FABIEN', 'JULIEN', 'MICKAEL',
      'SEBASTIEN',
    ]);
    for (const choice of nomTech.choices) {
      expect(choice).toMatchObject({
        bgColor: pastelFor(choice.label).bg,
        textColor: pastelFor(choice.label).text,
        bold: false,
        archived: false,
      });
    }
  });

  it("crée l'utilisateur initial une seule fois, avec un hash argon2 valide", async () => {
    const users = await prisma.user.findMany({
      where: { email: 'quentin.durant49@orange.fr' },
    });
    expect(users).toHaveLength(1);
    expect(users[0]).toMatchObject({ displayName: 'Quentin', cursorColor: '#3498DB' });
    await expect(argon2.verify(users[0].passwordHash, 'changeme')).resolves.toBe(true);
  });
});
