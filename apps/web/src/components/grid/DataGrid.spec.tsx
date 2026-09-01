import { describe, expect, it } from 'vitest';
import type { RowClassParams } from 'ag-grid-community';
import type { RowDTO } from '@suivi/shared';
import {
  appliquerLigneActive,
  changementLigneActive,
  CLASSE_LIGNE_ACTIVE,
  ligneContientSurlignage,
  reglesLigneActive,
} from './DataGrid';

// Le rendu complet d'AG Grid est trop lourd (et trop instable) en jsdom : on
// teste la logique de ligne active extraite en fonctions pures exportées par
// DataGrid.tsx, sur un DOM factice reproduisant la structure `.ag-row[row-id]`.

function ligne(id: string): RowDTO {
  return {
    id,
    month: '2026-08',
    position: 0,
    data: {},
    formats: {},
    version: 1,
    archived: false,
    updatedAt: '2026-08-10T10:00:00.000Z',
  };
}

function paramsPour(data: RowDTO | undefined): RowClassParams<RowDTO> {
  return { data } as RowClassParams<RowDTO>;
}

/**
 * Grille factice : chaque ligne est rendue en DEUX fragments `[row-id]`,
 * comme AG Grid le fait avec un conteneur central et des colonnes épinglées.
 */
function grilleFactice(rowIds: string[]): HTMLElement {
  const racine = document.createElement('div');
  for (const id of rowIds) {
    for (let fragment = 0; fragment < 2; fragment += 1) {
      const element = document.createElement('div');
      element.className = 'ag-row';
      element.setAttribute('row-id', id);
      racine.appendChild(element);
    }
  }
  return racine;
}

function fragments(racine: HTMLElement, rowId: string): Element[] {
  return Array.from(racine.querySelectorAll(`.ag-row[row-id="${rowId}"]`));
}

describe('ligneContientSurlignage', () => {
  const ligne = (formats: Record<string, { bg?: string }>) =>
    ({ id: 'r1', formats }) as unknown as Parameters<typeof ligneContientSurlignage>[0];

  it("passe quand n'importe quelle cellule porte le surlignage cherché", () => {
    expect(ligneContientSurlignage(ligne({ impe: { bg: '#F7DC6F' } }), '#F7DC6F')).toBe(true);
    expect(
      ligneContientSurlignage(ligne({ client: { bg: '#EE7A6D' }, date: { bg: '#F7DC6F' } }), '#F7DC6F'),
    ).toBe(true);
  });

  it('échoue sans surlignage de cette couleur ou sans formats', () => {
    expect(ligneContientSurlignage(ligne({ impe: { bg: '#EE7A6D' } }), '#F7DC6F')).toBe(false);
    expect(ligneContientSurlignage(ligne({}), '#F7DC6F')).toBe(false);
  });

  it('ciblé sur une colonne : seule la cellule de cette colonne compte', () => {
    const formats = { impe: { bg: '#F7DC6F' }, client: { bg: '#EE7A6D' } };
    expect(ligneContientSurlignage(ligne(formats), '#F7DC6F', 'impe')).toBe(true);
    expect(ligneContientSurlignage(ligne(formats), '#F7DC6F', 'client')).toBe(false);
    expect(ligneContientSurlignage(ligne(formats), '#F7DC6F', 'date')).toBe(false);
  });
});

describe('changementLigneActive', () => {
  it('rend null quand la ligne au focus ne change pas', () => {
    expect(changementLigneActive(null, null)).toBeNull();
    expect(changementLigneActive('row-1', 'row-1')).toBeNull();
  });

  it('premier focus : pose sans rien retirer', () => {
    expect(changementLigneActive(null, 'row-1')).toEqual({
      retirerDe: null,
      poserSur: 'row-1',
    });
  });

  it('changement de ligne : retire l’ancienne et pose la nouvelle', () => {
    expect(changementLigneActive('row-1', 'row-2')).toEqual({
      retirerDe: 'row-1',
      poserSur: 'row-2',
    });
  });

  it('focus quitté : retire seulement', () => {
    expect(changementLigneActive('row-1', null)).toEqual({
      retirerDe: 'row-1',
      poserSur: null,
    });
  });
});

describe('appliquerLigneActive', () => {
  it('pose la classe sur tous les fragments de la ligne au focus', () => {
    const racine = grilleFactice(['row-1', 'row-2']);
    appliquerLigneActive(racine, { retirerDe: null, poserSur: 'row-1' });
    for (const fragment of fragments(racine, 'row-1')) {
      expect(fragment).toHaveClass(CLASSE_LIGNE_ACTIVE);
    }
    for (const fragment of fragments(racine, 'row-2')) {
      expect(fragment).not.toHaveClass(CLASSE_LIGNE_ACTIVE);
    }
  });

  it('retire la classe de l’ancienne ligne quand le focus change', () => {
    const racine = grilleFactice(['row-1', 'row-2']);
    appliquerLigneActive(racine, { retirerDe: null, poserSur: 'row-1' });
    appliquerLigneActive(racine, { retirerDe: 'row-1', poserSur: 'row-2' });
    for (const fragment of fragments(racine, 'row-1')) {
      expect(fragment).not.toHaveClass(CLASSE_LIGNE_ACTIVE);
    }
    for (const fragment of fragments(racine, 'row-2')) {
      expect(fragment).toHaveClass(CLASSE_LIGNE_ACTIVE);
    }
  });

  it('retire la classe quand le focus quitte la grille', () => {
    const racine = grilleFactice(['row-1']);
    appliquerLigneActive(racine, { retirerDe: null, poserSur: 'row-1' });
    appliquerLigneActive(racine, { retirerDe: 'row-1', poserSur: null });
    for (const fragment of fragments(racine, 'row-1')) {
      expect(fragment).not.toHaveClass(CLASSE_LIGNE_ACTIVE);
    }
  });

  it('ligne disparue (supprimée ou hors virtualisation) : aucun plantage', () => {
    const racine = grilleFactice(['row-2']);
    expect(() =>
      appliquerLigneActive(racine, { retirerDe: 'row-1', poserSur: 'row-2' }),
    ).not.toThrow();
    for (const fragment of fragments(racine, 'row-2')) {
      expect(fragment).toHaveClass(CLASSE_LIGNE_ACTIVE);
    }
  });
});

describe('reglesLigneActive', () => {
  it('la règle vaut vrai pour la ligne active seulement, résolue à l’appel', () => {
    let active: string | null = 'row-1';
    const regle = reglesLigneActive(() => active)[CLASSE_LIGNE_ACTIVE];
    expect(regle(paramsPour(ligne('row-1')))).toBe(true);
    expect(regle(paramsPour(ligne('row-2')))).toBe(false);
    active = 'row-2';
    expect(regle(paramsPour(ligne('row-2')))).toBe(true);
  });

  it('vaut faux sans donnée de ligne ou sans ligne active', () => {
    const regle = reglesLigneActive(() => null)[CLASSE_LIGNE_ACTIVE];
    expect(regle(paramsPour(undefined))).toBe(false);
    expect(regle(paramsPour(ligne('row-1')))).toBe(false);
  });
});
