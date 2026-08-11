import type { CellFormat, CellValue } from '@suivi/shared';

/** Contenu du JSONB `Row.data`. */
export type RowData = Record<string, CellValue>;
/** Contenu du JSONB `Row.formats`. */
export type RowFormats = Record<string, CellFormat>;
/** Patch de formats : `null` demande le retrait du format de la clé. */
export type FormatsPatch = Record<string, CellFormat | null>;

/**
 * Fusion clé par clé de `data`. Une valeur `null` efface la clé
 * (et non « stocke null »), conformément aux contrats.
 */
export function mergeData(current: RowData, patch: RowData): RowData {
  const next: RowData = { ...current };
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) {
      delete next[key];
    } else {
      next[key] = value;
    }
  }
  return next;
}

/**
 * Fusion clé par clé de `formats`. Une valeur `null` retire le surlignage
 * de la clé ; sinon le format de la clé est remplacé en entier.
 */
export function mergeFormats(current: RowFormats, patch: FormatsPatch): RowFormats {
  const next: RowFormats = { ...current };
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) {
      delete next[key];
    } else {
      next[key] = value;
    }
  }
  return next;
}

/** Union ordonnée des clés touchées par un PATCH (data puis formats). */
export function changedKeysOf(patch: RowData, formats: FormatsPatch): string[] {
  const keys = Object.keys(patch);
  for (const key of Object.keys(formats)) {
    if (!keys.includes(key)) {
      keys.push(key);
    }
  }
  return keys;
}

/** Journal de modification : { clé: { from, to } } pour le panneau historique. */
export function buildDiff(
  current: RowData,
  patch: RowData,
): Record<string, { from: CellValue; to: CellValue }> {
  const diff: Record<string, { from: CellValue; to: CellValue }> = {};
  for (const [key, value] of Object.entries(patch)) {
    diff[key] = { from: current[key] ?? null, to: value };
  }
  return diff;
}

/** Lit `payload.changedKeys` de façon défensive (payload est un JSONB libre). */
export function changedKeysOfPayload(payload: unknown): string[] {
  if (typeof payload !== 'object' || payload === null) {
    return [];
  }
  const value = (payload as { changedKeys?: unknown }).changedKeys;
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((key): key is string => typeof key === 'string');
}

/** Lit `payload.version` (version PRODUITE par l'événement) ou null. */
export function versionOfPayload(payload: unknown): number | null {
  if (typeof payload !== 'object' || payload === null) {
    return null;
  }
  const value = (payload as { version?: unknown }).version;
  return typeof value === 'number' ? value : null;
}

/**
 * Intersection entre les clés du patch courant et les clés modifiées par les
 * événements postérieurs à `expectedVersion`. Vide => pas de conflit, la
 * fusion peut avoir lieu même si la version a bougé.
 */
export function conflictKeys(
  events: readonly { payload: unknown }[],
  keys: readonly string[],
): string[] {
  const modified = new Set<string>();
  for (const event of events) {
    for (const key of changedKeysOfPayload(event.payload)) {
      modified.add(key);
    }
  }
  return keys.filter((key) => modified.has(key));
}
