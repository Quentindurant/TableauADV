import { ColumnType, PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import { pastelFor } from '@suivi/shared';

interface ColumnSeed {
  key: string;
  label: string;
  type: ColumnType;
  position: number;
  width: number;
}

interface ChoiceSeed {
  label: string;
  bgColor?: string | null;
  textColor?: string | null;
  bold?: boolean;
}

// Les 16 colonnes de la spec §2.1, ordre Excel, largeurs par défaut en px.
const COLUMNS: ColumnSeed[] = [
  { key: 'impe',                label: 'IMPE',                             type: 'DATE',     position: 0,  width: 110 },
  { key: 'client',              label: 'CLIENT',                           type: 'TEXT',     position: 1,  width: 220 },
  { key: 'dpt',                 label: 'DPT',                              type: 'TEXT',     position: 2,  width: 70 },
  { key: 'cp_client',           label: 'CP CLIENT',                        type: 'TEXT',     position: 3,  width: 100 },
  { key: 'partenaire',          label: 'PARTE',                            type: 'SELECT',   position: 4,  width: 160 },
  { key: 'date',                label: 'DATE',                             type: 'DATE',     position: 5,  width: 110 },
  { key: 'porta_commentaires',  label: 'PORTA ET COMMENTAIRES IMPORTANT',  type: 'LONGTEXT', position: 6,  width: 320 },
  // La spec garde l'heure en texte libre (« 14H », « 14h »...) : type TEXT, pas TIME.
  { key: 'heure',               label: 'HEURE',                            type: 'TEXT',     position: 7,  width: 90 },
  { key: 'tech',                label: 'TECH',                             type: 'SELECT',   position: 8,  width: 130 },
  { key: 'nom_tech',            label: 'NOM TECH',                         type: 'TEXT',     position: 9,  width: 160 },
  { key: 'nom_cp',              label: 'NOM CP',                           type: 'SELECT',   position: 10, width: 130 },
  { key: 'statut',              label: 'INSTALLATION',                     type: 'SELECT',   position: 11, width: 150 },
  { key: 'commentaires_planif', label: 'COMMENTAIRES PLANIF',              type: 'LONGTEXT', position: 12, width: 320 },
  { key: 'materiel_recu',       label: 'MATERIEL RECU',                    type: 'SELECT',   position: 13, width: 140 },
  { key: 'num_chrono',          label: 'N° CHRONO',                        type: 'TEXT',     position: 14, width: 120 },
  { key: 'infos_facturation',   label: 'INFOS FACTURATION',                type: 'TEXT',     position: 15, width: 220 },
];

// Statuts : couleurs exactes du contrat (§Couleurs initiales).
const STATUTS: ChoiceSeed[] = [
  { label: 'NEW',         bgColor: '#FFFF00', textColor: '#FF0000', bold: true },
  { label: 'STAGING',     bgColor: '#F8B5C8', textColor: '#E64219', bold: true },
  { label: 'A SUIVRE',    bgColor: '#FFA600', textColor: '#FF0000', bold: true },
  { label: 'ATT TECH',    bgColor: '#F8B5C8', textColor: '#E64219', bold: true },
  { label: 'ATT PARTE',   bgColor: '#F8B5C8', textColor: '#E64219', bold: true },
  { label: 'ATT PV',      bgColor: '#744388', textColor: '#FFFFFF', bold: true },
  { label: 'ATT 5 COM',   bgColor: '#F8B5C8', textColor: '#E64219', bold: true },
  { label: 'ATT CLIENT',  bgColor: '#F8B5C8', textColor: '#E64219', bold: true },
  { label: 'EN COLLECTE', bgColor: '#F9E79F', textColor: '#786208', bold: false },
  { label: 'STAND BY',    bgColor: '#85C1E9', textColor: '#002060', bold: true },
  { label: 'A PLANIFIER', bgColor: '#13ED0C', textColor: '#FF0000', bold: true },
  { label: 'INSTALLATION', bgColor: '#9BDEB4', textColor: '#176638', bold: true },
  { label: 'A DISTANCE',  bgColor: null,      textColor: null,      bold: false },
  { label: 'ANNULEE',     bgColor: '#FF0000', textColor: '#000000', bold: true },
  { label: 'CLOTUREE',    bgColor: '#A6A6A6', textColor: '#ABEBC6', bold: false },
];

// 41 partenaires (ordre de la spec §2.2). 6 couleurs figées de l'Excel,
// texte #000000 (contrat) ; les 35 autres passent par pastelFor.
const PARTENAIRES: string[] = [
  'OR-TEL', 'ENTREPRISE PRO', 'CUBE', 'VIP TELECOM', 'ESPACE BUREAUTIQUE',
  'IT ADEPT', 'WETELGROUP', 'HIGHCOM', '2A Consulting', 'ALLIPCOM',
  'BUREAUTIK SERVICES', 'MABUROTIC', 'CG CONEKT', 'LEA NUMERIQUE', 'COM2S',
  'DBTELECOM', 'ECS', 'GOOD MORNING OFFICE', 'GROUPE TCV', 'KOTEL',
  'I PLANETHI', 'DJEFFREY', 'LDS SOLUTIONS', 'MIKADO SOLUTIONS', 'MY OBS',
  'ODH SOLUTIONS', 'OMNITEL', 'PRO FIBRE', 'RESEAU LINE', 'SNS SOLUTIONS',
  'SQUARTIS', 'TELPRO', 'ODS', 'TOPLINIE', 'UNITED TELECOM', 'YOWIGO',
  'VD COM', 'REVOLY', 'FR TELECOM', 'EVERLINK', 'HOIST GROUP',
];

const PARTENAIRE_COULEURS_EXCEL: Record<string, { bg: string; text: string }> = {
  'EVERLINK':       { bg: '#229955', text: '#000000' },
  'HIGHCOM':        { bg: '#C39BD3', text: '#000000' },
  'ENTREPRISE PRO': { bg: '#2772A4', text: '#000000' },
  'OR-TEL':         { bg: '#F1C40F', text: '#000000' },
  'VIP TELECOM':    { bg: '#AED6F1', text: '#000000' },
  'WETELGROUP':     { bg: '#FCDAE3', text: '#000000' },
};

// Tech : DIRECT en bleu gras, 8 revendeurs en vert gras, le reste neutre.
const TECHS: string[] = [
  'DIRECT', 'ADWEB', 'DELTINFO', 'SOSINFO', 'NETWORK', 'KRYCIA', 'OCCITECH',
  'SPOTER', 'LAMIE', 'VOSGES INFO', 'PSITEK', 'TOULINFO', 'IMPECPRO', 'AUTRE',
];
const TECHS_VERTS = new Set([
  'ADWEB', 'DELTINFO', 'SOSINFO', 'OCCITECH', 'PSITEK', 'TOULINFO',
  'VOSGES INFO', 'LAMIE',
]);

const NOMS_CP: string[] = [
  'LAURENT', 'PIERRE', 'GEOFFROY', 'QUENTIN', 'KORANTIN', 'ADRIEN', 'MARCO',
  'ADV', 'AURELIEN', 'DYLAN',
];

const MATERIEL_RECU: string[] = ['ENVOYE', 'LIVRE', 'POINT RELAIS'];

async function upsertChoices(
  prisma: PrismaClient,
  columnKey: string,
  choices: ChoiceSeed[],
): Promise<void> {
  const column = await prisma.column.findUniqueOrThrow({
    where: { key: columnKey },
  });
  for (const [position, choice] of choices.entries()) {
    const attributes = {
      bgColor: choice.bgColor ?? null,
      textColor: choice.textColor ?? null,
      bold: choice.bold ?? false,
      position,
    };
    await prisma.choice.upsert({
      where: { columnId_label: { columnId: column.id, label: choice.label } },
      update: attributes,
      create: { columnId: column.id, label: choice.label, ...attributes },
    });
  }
}

export async function seed(prisma: PrismaClient): Promise<void> {
  // 1. Colonnes — upsert par clé unique `key`.
  for (const column of COLUMNS) {
    const attributes = {
      label: column.label,
      type: column.type,
      position: column.position,
      width: column.width,
    };
    await prisma.column.upsert({
      where: { key: column.key },
      update: attributes,
      create: { key: column.key, ...attributes },
    });
  }

  // 2. Choix des 5 listes — upsert par (columnId, label).
  await upsertChoices(prisma, 'statut', STATUTS);
  await upsertChoices(
    prisma,
    'partenaire',
    PARTENAIRES.map((label) => {
      const couleurs = PARTENAIRE_COULEURS_EXCEL[label] ?? pastelFor(label);
      return { label, bgColor: couleurs.bg, textColor: couleurs.text, bold: false };
    }),
  );
  await upsertChoices(
    prisma,
    'tech',
    TECHS.map((label) => {
      if (label === 'DIRECT') {
        return { label, bgColor: null, textColor: '#009ADF', bold: true };
      }
      if (TECHS_VERTS.has(label)) {
        return { label, bgColor: null, textColor: '#229955', bold: true };
      }
      return { label };
    }),
  );
  await upsertChoices(prisma, 'nom_cp', NOMS_CP.map((label) => ({ label })));
  await upsertChoices(prisma, 'materiel_recu', MATERIEL_RECU.map((label) => ({ label })));

  // 3. Utilisateur initial — upsert par email ; `update: {}` pour ne jamais
  // écraser un mot de passe ou un profil modifié depuis l'interface.
  const passwordHash = await argon2.hash('changeme');
  await prisma.user.upsert({
    where: { email: 'quentin.durant49@orange.fr' },
    update: {},
    create: {
      email: 'quentin.durant49@orange.fr',
      displayName: 'Quentin',
      passwordHash,
      cursorColor: '#3498DB',
    },
  });
}

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    await seed(prisma);
    console.log('Seed terminé : 16 colonnes, 83 choix, 1 utilisateur.');
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error('Échec du seed :', error);
    process.exit(1);
  });
}
