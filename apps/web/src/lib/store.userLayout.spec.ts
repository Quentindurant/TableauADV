import { beforeEach, describe, expect, it } from 'vitest';
import type { ColumnDTO, UserColumnLayoutDTO } from '@suivi/shared';
import { fusionnerDisposition, indexerDisposition, useAppStore } from './store';

function colonne(
  id: string,
  position: number,
  surcharge: Partial<ColumnDTO> = {},
): ColumnDTO {
  return {
    id,
    key: id.replace('col-', ''),
    label: id.toUpperCase(),
    type: 'TEXT',
    position,
    width: 150,
    visible: true,
    choices: [],
    ...surcharge,
  };
}

function entree(
  columnId: string,
  surcharge: Partial<UserColumnLayoutDTO> = {},
): UserColumnLayoutDTO {
  return { columnId, width: null, position: null, hidden: false, ...surcharge };
}

const colonnes: ColumnDTO[] = [
  colonne('col-client', 0, { width: 220 }),
  colonne('col-statut', 1, { width: 140 }),
  colonne('col-date', 2, { width: 110 }),
];

describe('indexerDisposition', () => {
  it('indexe les entrées par columnId en omettant les champs null (héritage du standard)', () => {
    const layout = indexerDisposition([
      entree('col-client', { width: 320 }),
      entree('col-statut', { position: 0, hidden: true }),
    ]);
    expect(layout).toEqual({
      'col-client': { width: 320 },
      'col-statut': { position: 0, hidden: true },
    });
  });

  it('omet aussi hidden=false : l’entrée reste vide, la fusion retombe partout sur le standard', () => {
    expect(indexerDisposition([entree('col-client')])).toEqual({ 'col-client': {} });
  });
});

describe('fusionnerDisposition', () => {
  it('sans disposition perso, rend les colonnes standard (largeurs et visibilité intactes, positions réécrites en rangs)', () => {
    const effectives = fusionnerDisposition(colonnes, {});
    expect(effectives.map((c) => c.id)).toEqual(['col-client', 'col-statut', 'col-date']);
    expect(effectives.map((c) => c.width)).toEqual([220, 140, 110]);
    expect(effectives.map((c) => c.position)).toEqual([0, 1, 2]);
    expect(effectives.every((c) => c.visible)).toBe(true);
  });

  it('applique la largeur perso quand elle existe, sinon la largeur standard', () => {
    const effectives = fusionnerDisposition(colonnes, { 'col-statut': { width: 300 } });
    expect(effectives.map((c) => c.width)).toEqual([220, 300, 110]);
  });

  it('trie par position perso quand elle existe, sinon par position standard', () => {
    const effectives = fusionnerDisposition(colonnes, {
      'col-date': { position: 0 },
      'col-client': { position: 1 },
      'col-statut': { position: 2 },
    });
    expect(effectives.map((c) => c.id)).toEqual(['col-date', 'col-client', 'col-statut']);
    // Les positions retournées sont matérialisées en rangs : buildColumnDefs
    // retrie par `position`, un ordre non matérialisé y serait perdu.
    expect(effectives.map((c) => c.position)).toEqual([0, 1, 2]);
  });

  it('départage STABLE par position standard quand deux colonnes ont la même clé de tri', () => {
    // col-date reçoit la position perso 0, identique à la position standard
    // de col-client : le départage standard garde col-client (0) devant
    // col-date (2).
    const effectives = fusionnerDisposition(colonnes, { 'col-date': { position: 0 } });
    expect(effectives.map((c) => c.id)).toEqual(['col-client', 'col-date', 'col-statut']);
  });

  it('visible = visible global ET non masquée perso', () => {
    const avecInvisibleGlobale = [
      ...colonnes,
      colonne('col-technicien', 3, { visible: false }),
    ];
    const effectives = fusionnerDisposition(avecInvisibleGlobale, {
      'col-statut': { hidden: true },
      // Masquer perso une colonne déjà invisible globalement ne la fait pas
      // réapparaître, et re-cocher perso ne peut pas outrepasser l'admin.
      'col-technicien': { hidden: false },
    });
    expect(effectives.map((c) => [c.id, c.visible])).toEqual([
      ['col-client', true],
      ['col-statut', false],
      ['col-date', true],
      ['col-technicien', false],
    ]);
  });

  it('ne mute pas le tableau de colonnes reçu (fonction pure)', () => {
    const avant = colonnes.map((c) => ({ ...c }));
    fusionnerDisposition(colonnes, { 'col-client': { width: 999, position: 2 } });
    expect(colonnes).toEqual(avant);
  });
});

describe('userLayout (store)', () => {
  beforeEach(() => {
    useAppStore.setState({ userLayout: {} });
  });

  it('setUserLayout remplace la disposition entière', () => {
    useAppStore.getState().setUserLayout({ 'col-client': { width: 320 } });
    expect(useAppStore.getState().userLayout).toEqual({ 'col-client': { width: 320 } });
    useAppStore.getState().setUserLayout({});
    expect(useAppStore.getState().userLayout).toEqual({});
  });

  it('applyUserLayoutEntries fusionne les entrées upsertées, chaque entrée serveur remplaçant celle de sa colonne', () => {
    useAppStore.getState().setUserLayout({
      'col-client': { width: 320 },
      'col-statut': { hidden: true },
    });
    useAppStore.getState().applyUserLayoutEntries([
      // L'entrée serveur de col-statut est COMPLÈTE : hidden repassé à false
      // et largeur posée — l'ancien { hidden: true } ne doit pas survivre.
      entree('col-statut', { width: 180 }),
      entree('col-date', { position: 0 }),
    ]);
    expect(useAppStore.getState().userLayout).toEqual({
      'col-client': { width: 320 },
      'col-statut': { width: 180 },
      'col-date': { position: 0 },
    });
  });
});
