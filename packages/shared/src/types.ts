export type ColumnType =
  | 'TEXT'
  | 'LONGTEXT'
  | 'DATE'
  | 'TIME'
  | 'NUMBER'
  | 'SELECT'
  | 'LINK';

export interface UserDTO {
  id: string;
  email: string;
  displayName: string;
  cursorColor: string;
}

export interface ChoiceDTO {
  id: string;
  columnId: string;
  label: string;
  bgColor: string | null;
  textColor: string | null;
  bold: boolean;
  position: number;
  archived: boolean;
}

export interface ColumnDTO {
  id: string;
  key: string;
  label: string;
  type: ColumnType;
  position: number;
  width: number;
  visible: boolean;
  choices: ChoiceDTO[];
}

export type CellValue = string | number | null;

export interface CellFormat {
  bg?: string;
}

export interface RowDTO {
  id: string;
  month: string;
  position: number;
  data: Record<string, CellValue>;
  formats: Record<string, CellFormat>;
  version: number;
  archived: boolean;
  updatedAt: string;
}

export interface RowEventDTO {
  id: string;
  rowId: string;
  userId: string;
  userName: string;
  at: string;
  type: 'create' | 'update' | 'delete' | 'move' | 'archive' | 'format';
  payload: unknown;
}

export interface MonthInfo {
  month: string;
  count: number;
}

/** Aperçu du report vers un nouveau mois (GET /api/months/report-preview). */
export interface ReportPreviewDTO {
  /** Dernier mois actif avant le mois cible, null si aucun (alors count = 0). */
  from: string | null;
  /** Nombre de dossiers qui seraient repris. */
  count: number;
}

/** Résultat du report (POST /api/months/report). */
export interface ReportResultDTO {
  /** Mois source du report, null si aucun mois antérieur n'existait. */
  from: string | null;
  /** Nombre de dossiers recopiés (0 si une ligne vide a matérialisé le mois). */
  created: number;
}

/** Correspondance multiple relevée par l'import fusion : rien n'est modifié. */
export interface ImportAmbiguiteDTO {
  client: string;
  raison: string;
  /** Numéros de ligne Excel concernés (1 = en-tête). */
  lignesFichier: number[];
  /** Ids des lignes en base concernées. */
  lignesBase: string[];
}

/** Rapport de fusion d'un onglet-mois du classeur importé. */
export interface ImportOngletDTO {
  mois: string;
  creees: number;
  misesAJour: number;
  inchangees: number;
  /** Lignes dont la position a changé : « la feuille fait foi » pour l'ordre. */
  reordonnees: number;
  ambiguites: ImportAmbiguiteDTO[];
  /** Valeurs hors listes de choix, importées telles quelles. */
  horsListe: string[];
}

/** Rapport global de POST /api/import (fusion incrémentale, jamais de suppression). */
export interface ImportFusionReportDTO {
  parOnglet: ImportOngletDTO[];
  erreurs: string[];
}

export type ErrorCode =
  | 'AUTH_INVALID'
  | 'AUTH_REQUIRED'
  | 'VALIDATION_FAILED'
  | 'NOT_FOUND'
  | 'VERSION_CONFLICT'
  | 'COLUMN_HAS_DATA'
  | 'CHOICE_IN_USE'
  | 'LOCKED';

export interface ApiError {
  code: ErrorCode;
  message: string;
  details?: unknown;
}
