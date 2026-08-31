import type { CellFormat, CellValue } from '@suivi/shared';

/**
 * Fusion incrémentale d'un onglet-mois du classeur Zoho avec les lignes déjà
 * en base : fonctions PURES (aucune I/O) construisant un plan d'application.
 *
 * Rapprochement par nom client normalisé UNIQUEMENT (l'analyse du classeur a
 * montré qu'aucune clé naturelle n'est fiable : `impe` est vide à 72,9 %).
 * Règles dures : une cellule vide n'écrase jamais une valeur existante,
 * toute correspondance multiple est une ambiguïté à ne PAS toucher, et le
 * plan ne contient par construction aucune suppression.
 */

/** Ligne lue dans le fichier (`readRowCells`) : valeurs déjà normalisées. */
export interface LigneFichier {
  /** Numéro de ligne Excel (1 = en-tête). */
  numero: number;
  data: Record<string, string>;
  formats: Record<string, { bg: string }>;
}

/** Ligne active du mois telle qu'elle existe en base. */
export interface LigneBase {
  id: string;
  data: Record<string, CellValue>;
  formats: Record<string, CellFormat>;
}

/** Mise à jour planifiée d'une correspondance non ambigüe. */
export interface MiseAJourPlanifiee {
  rowId: string;
  /** Champs non vides côté fichier ET différents de la base. */
  patch: Record<string, string>;
  /** Surlignages fichier absents ou différents en base (jamais de retrait). */
  formats: Record<string, CellFormat>;
  /** Union ordonnée des clés touchées (data puis formats). */
  changedKeys: string[];
}

/** Correspondance multiple consignée dans le rapport, sans rien toucher. */
export interface AmbiguitePlanifiee {
  client: string;
  raison: string;
  lignesFichier: number[];
  lignesBase: string[];
}

/**
 * Correspondance 1 ↔ 1 (modifiée OU inchangée) : matière première de l'ordre
 * feuille — `numero` est le numéro de ligne Excel de la ligne fichier appariée.
 */
export interface AppariementPlanifie {
  rowId: string;
  numero: number;
}

export interface PlanFusion {
  creations: LigneFichier[];
  misesAJour: MiseAJourPlanifiee[];
  inchangees: number;
  ambiguites: AmbiguitePlanifiee[];
  appariements: AppariementPlanifie[];
}

/**
 * Normalise un nom client pour le rapprochement : trim, majuscules, accents
 * retirés, espaces multiples compactés. `null` si la valeur est inexploitable.
 */
export function normaliserClient(valeur: unknown): string | null {
  if (typeof valeur !== 'string') {
    return null;
  }
  const normalise = valeur
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
  return normalise === '' ? null : normalise;
}

/** Deux valeurs de cellule sont égales si leur représentation texte l'est. */
function memeValeur(fichier: string, base: CellValue): boolean {
  return base !== null && base !== undefined && String(base) === fichier;
}

/** Date d'installation exploitable pour le départage : texte non vide. */
function dateDe(valeur: unknown): string | null {
  if (valeur === null || valeur === undefined) {
    return null;
  }
  const texte = String(valeur).trim();
  return texte === '' ? null : texte;
}

/**
 * Départage d'un groupe multiple (même client) par la colonne `date` : une
 * paire n'est retenue que si sa date est présente et unique DES DEUX côtés.
 * Tout le reste (dates vides, en double, sans vis-à-vis) est laissé au
 * traitement d'ambiguïté — jamais de création dans un groupe multiple, une
 * ligne fichier restante pourrait être la même commande dont la date a changé.
 */
function apparierParDate(
  groupeFichier: readonly LigneFichier[],
  groupeBase: readonly LigneBase[],
): {
  paires: { fichier: LigneFichier; base: LigneBase }[];
  fichierRestant: LigneFichier[];
  baseRestante: LigneBase[];
} {
  const parDateFichier = new Map<string, LigneFichier[]>();
  for (const ligne of groupeFichier) {
    const date = dateDe(ligne.data['date']);
    if (date !== null) {
      parDateFichier.set(date, [...(parDateFichier.get(date) ?? []), ligne]);
    }
  }
  const parDateBase = new Map<string, LigneBase[]>();
  for (const ligne of groupeBase) {
    const date = dateDe(ligne.data['date']);
    if (date !== null) {
      parDateBase.set(date, [...(parDateBase.get(date) ?? []), ligne]);
    }
  }

  const paires: { fichier: LigneFichier; base: LigneBase }[] = [];
  const fichierApparie = new Set<LigneFichier>();
  const baseAppariee = new Set<LigneBase>();
  for (const [date, lignesFichier] of parDateFichier) {
    const lignesBase = parDateBase.get(date);
    if (lignesFichier.length === 1 && lignesBase?.length === 1) {
      paires.push({ fichier: lignesFichier[0], base: lignesBase[0] });
      fichierApparie.add(lignesFichier[0]);
      baseAppariee.add(lignesBase[0]);
    }
  }

  return {
    paires,
    fichierRestant: groupeFichier.filter((ligne) => !fichierApparie.has(ligne)),
    baseRestante: groupeBase.filter((ligne) => !baseAppariee.has(ligne)),
  };
}

/**
 * Calcule le patch d'une correspondance : uniquement les champs non vides du
 * fichier absents ou différents en base. Les clés absentes du fichier
 * (cellules vides) ne figurent jamais dans le patch.
 */
function patchDeFusion(
  fichier: LigneFichier,
  base: LigneBase,
): Pick<MiseAJourPlanifiee, 'patch' | 'formats' | 'changedKeys'> {
  const patch: Record<string, string> = {};
  for (const [cle, valeur] of Object.entries(fichier.data)) {
    // `client` est la clé de rapprochement : sur une correspondance, il ne
    // diffère que par la graphie (casse/accents/espaces) — on conserve la base.
    if (cle === 'client') {
      continue;
    }
    if (!memeValeur(valeur, base.data[cle])) {
      patch[cle] = valeur;
    }
  }

  const formats: Record<string, CellFormat> = {};
  for (const [cle, format] of Object.entries(fichier.formats)) {
    if (base.formats[cle]?.bg !== format.bg) {
      formats[cle] = format;
    }
  }

  const changedKeys = Object.keys(patch);
  for (const cle of Object.keys(formats)) {
    if (!changedKeys.includes(cle)) {
      changedKeys.push(cle);
    }
  }
  return { patch, formats, changedKeys };
}

/**
 * Construit le plan de fusion d'un onglet-mois :
 * - 1 ligne fichier ↔ 1 ligne base : mise à jour (ou inchangée si rien à faire) ;
 * - ligne fichier sans correspondance : création ;
 * - correspondances multiples (dans un sens ou l'autre) : ambiguïté, rien n'est touché ;
 * - lignes base absentes du fichier : hors du plan, donc intactes (jamais de suppression).
 */
export function construirePlanFusion(
  lignesFichier: readonly LigneFichier[],
  lignesBase: readonly LigneBase[],
): PlanFusion {
  const plan: PlanFusion = {
    creations: [],
    misesAJour: [],
    inchangees: 0,
    ambiguites: [],
    appariements: [],
  };

  const baseParClient = new Map<string, LigneBase[]>();
  for (const ligne of lignesBase) {
    const client = normaliserClient(ligne.data['client'] as unknown);
    if (client === null) {
      continue;
    }
    const groupe = baseParClient.get(client);
    if (groupe === undefined) {
      baseParClient.set(client, [ligne]);
    } else {
      groupe.push(ligne);
    }
  }

  const fichierParClient = new Map<string, LigneFichier[]>();
  for (const ligne of lignesFichier) {
    const client = normaliserClient(ligne.data['client']);
    if (client === null) {
      plan.ambiguites.push({
        client: '',
        raison: 'nom client absent',
        lignesFichier: [ligne.numero],
        lignesBase: [],
      });
      continue;
    }
    const groupe = fichierParClient.get(client);
    if (groupe === undefined) {
      fichierParClient.set(client, [ligne]);
    } else {
      groupe.push(ligne);
    }
  }

  for (const [client, groupeFichier] of fichierParClient) {
    const groupeBase = baseParClient.get(client) ?? [];

    if (groupeBase.length === 0) {
      // Aucune correspondance : toutes les lignes fichier du client sont créées.
      plan.creations.push(...groupeFichier);
      continue;
    }

    if (groupeFichier.length === 1 && groupeBase.length === 1) {
      plan.appariements.push({ rowId: groupeBase[0].id, numero: groupeFichier[0].numero });
      const detail = patchDeFusion(groupeFichier[0], groupeBase[0]);
      if (detail.changedKeys.length === 0) {
        plan.inchangees += 1;
      } else {
        plan.misesAJour.push({ rowId: groupeBase[0].id, ...detail });
      }
      continue;
    }

    // Groupe multiple : tentative de départage par la date d'installation.
    const departage = apparierParDate(groupeFichier, groupeBase);
    for (const paire of departage.paires) {
      plan.appariements.push({ rowId: paire.base.id, numero: paire.fichier.numero });
      const detail = patchDeFusion(paire.fichier, paire.base);
      if (detail.changedKeys.length === 0) {
        plan.inchangees += 1;
      } else {
        plan.misesAJour.push({ rowId: paire.base.id, ...detail });
      }
    }

    // Une ligne fichier non départagée reste une ambiguïté (jamais une
    // création : ce pourrait être une commande dont la date a changé). Des
    // lignes base restantes seules = absentes du fichier, donc intactes.
    if (departage.fichierRestant.length > 0) {
      plan.ambiguites.push({
        client,
        raison: `${departage.fichierRestant.length} ligne(s) fichier pour ${departage.baseRestante.length} ligne(s) en base non départagées par la date`,
        lignesFichier: departage.fichierRestant.map((ligne) => ligne.numero),
        lignesBase: departage.baseRestante.map((ligne) => ligne.id),
      });
    }
  }

  return plan;
}

/** Ligne du mois réduite à son identité et sa position actuelle. */
export interface LigneOrdre {
  id: string;
  position: number;
}

/** Réécriture de position à appliquer (uniquement quand elle change). */
export interface ReecriturePosition {
  rowId: string;
  position: number;
}

/**
 * Ordre cible du mois après fusion : « la feuille fait foi ».
 * - Bloc feuille : lignes appariées non ambiguës (hors conflits de version) et
 *   lignes créées, position croissante selon le numéro de ligne fichier.
 * - Bloc « après » : lignes base absentes du fichier, ambiguës ou en conflit,
 *   dans leur ordre relatif actuel — contenu intact, jamais de suppression.
 * Seules les positions qui changent sont retournées : base déjà dans l'ordre
 * feuille (rejeu du même classeur) = zéro écriture.
 */
export function construirePlanOrdre(
  plan: PlanFusion,
  lignesBase: readonly LigneOrdre[],
  creees: readonly (LigneOrdre & { numero: number })[],
  idsEnConflit: ReadonlySet<string>,
): ReecriturePosition[] {
  const numeroParId = new Map<string, number>();
  for (const appariement of plan.appariements) {
    if (!idsEnConflit.has(appariement.rowId)) {
      numeroParId.set(appariement.rowId, appariement.numero);
    }
  }

  const blocFeuille: { id: string; numero: number }[] = creees.map((creee) => ({
    id: creee.id,
    numero: creee.numero,
  }));
  for (const ligne of lignesBase) {
    const numero = numeroParId.get(ligne.id);
    if (numero !== undefined) {
      blocFeuille.push({ id: ligne.id, numero });
    }
  }
  blocFeuille.sort((gauche, droite) => gauche.numero - droite.numero);

  const idsBlocFeuille = new Set(blocFeuille.map((entree) => entree.id));
  const ordre = [
    ...blocFeuille.map((entree) => entree.id),
    ...lignesBase.filter((ligne) => !idsBlocFeuille.has(ligne.id)).map((ligne) => ligne.id),
  ];

  const positionActuelle = new Map<string, number>();
  for (const ligne of lignesBase) {
    positionActuelle.set(ligne.id, ligne.position);
  }
  for (const creee of creees) {
    positionActuelle.set(creee.id, creee.position);
  }

  const reecritures: ReecriturePosition[] = [];
  for (let cible = 0; cible < ordre.length; cible += 1) {
    if (positionActuelle.get(ordre[cible]) !== cible) {
      reecritures.push({ rowId: ordre[cible], position: cible });
    }
  }
  return reecritures;
}
