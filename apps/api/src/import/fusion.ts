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

export interface PlanFusion {
  creations: LigneFichier[];
  misesAJour: MiseAJourPlanifiee[];
  inchangees: number;
  ambiguites: AmbiguitePlanifiee[];
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
  const plan: PlanFusion = { creations: [], misesAJour: [], inchangees: 0, ambiguites: [] };

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
      const detail = patchDeFusion(groupeFichier[0], groupeBase[0]);
      if (detail.changedKeys.length === 0) {
        plan.inchangees += 1;
      } else {
        plan.misesAJour.push({ rowId: groupeBase[0].id, ...detail });
      }
      continue;
    }

    plan.ambiguites.push({
      client,
      raison: `${groupeFichier.length} ligne(s) fichier pour ${groupeBase.length} ligne(s) en base`,
      lignesFichier: groupeFichier.map((ligne) => ligne.numero),
      lignesBase: groupeBase.map((ligne) => ligne.id),
    });
  }

  return plan;
}
