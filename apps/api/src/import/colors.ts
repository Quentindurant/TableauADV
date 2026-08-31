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
 * Les 16 colonnes de la spec §2.1 plus la colonne NO (col B de l'onglet
 * AOUT 2026 : n° de BC HIGHCOM ou code de lot EVERLINK, texte libre).
 * L'index dans ce tableau est la `position` en base.
 * `heure` reste TEXT : le classeur contient « 14h », « 9H », « 14H30 ».
 */
export const COLUMNS: readonly ColumnSeed[] = [
  { key: 'impe', label: 'IMPE', type: 'DATE' },
  { key: 'no', label: 'NO', type: 'TEXT' },
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

// Statuts — palette douce validée (mêmes 20 statuts que le seed).
const STATUTS: readonly ChoiceSeed[] = [
  choix('NEW', '#F7DC6F', '#6B5504', true),
  choix('STAGING', '#F8B5C8', '#943126', true),
  choix('A SUIVRE', '#FAD7A0', '#874D0B', true),
  choix('ATT TECH', '#F8B5C8', '#943126', true),
  choix('ATT PARTE', '#F8B5C8', '#943126', true),
  choix('ATT PV', '#744388', '#FFFFFF', true),
  choix('ATT 5 COM', '#F8B5C8', '#943126', true),
  choix('ATT CLIENT', '#F8B5C8', '#943126', true),
  choix('EN COLLECTE', '#F9E79F', '#786208', false),
  choix('STAND BY', '#85C1E9', '#002060', true),
  choix('A PLANIFIER', '#A3E4D7', '#0E6251', true),
  choix('INSTALLATION', '#9BDEB4', '#176638', true),
  choix('A DISTANCE', null, null, false),
  choix('ANNULEE', '#E6B0AA', '#78281F', true),
  choix('CLOTUREE', '#D5D8DC', '#4D5656', false),
  // Vocabulaire du classeur Zoho poussé/lu par Everlink.
  choix('TECHNIQUE', '#E9C46A', '#6E4A08', true),
  choix('OPER', '#EBDEF0', '#4A235A', true),
  choix('PORTA', '#C39BD3', '#4A235A', true),
  choix('PV', '#763E8D', '#FFFFFF', true),
  // Attente Grands Comptes : même famille visuelle que les autres ATT.
  choix('ATT GC', '#F8B5C8', '#943126', true),
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

// Les 6 partenaires figés — palette douce, texte accordé au fond.
const PARTENAIRE_COULEURS_EXCEL: Readonly<Record<string, { bg: string; text: string }>> = {
  EVERLINK: { bg: '#7DCEA0', text: '#0E4D28' },
  HIGHCOM: { bg: '#C39BD3', text: '#4A235A' },
  'ENTREPRISE PRO': { bg: '#A9CCE3', text: '#1B4F72' },
  'OR-TEL': { bg: '#F7DC6F', text: '#6B5504' },
  'VIP TELECOM': { bg: '#AED6F1', text: '#1B4F72' },
  WETELGROUP: { bg: '#FCDAE3', text: '#943126' },
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
      return choix(label, null, '#0072A8', true);
    }
    if (TECHS_VERTS.has(label)) {
      return choix(label, null, '#196F3D', true);
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
