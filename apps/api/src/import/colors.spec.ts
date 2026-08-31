import { pastelFor } from '@suivi/shared';
import {
  allowedValues,
  CHOICES_BY_COLUMN,
  COLUMNS,
  SELECT_KEYS,
  type ChoiceSeed,
} from './colors';

function parLabel(key: string): Record<string, ChoiceSeed> {
  return Object.fromEntries((CHOICES_BY_COLUMN[key] ?? []).map((c) => [c.label, c]));
}

describe('COLUMNS', () => {
  it('décrit les 17 colonnes (spec §2.1 + NO) dans l’ordre du classeur', () => {
    expect(COLUMNS.map((c) => c.key)).toEqual([
      'impe',
      'no',
      'client',
      'dpt',
      'cp_client',
      'partenaire',
      'date',
      'porta_commentaires',
      'heure',
      'tech',
      'nom_tech',
      'nom_cp',
      'statut',
      'commentaires_planif',
      'materiel_recu',
      'num_chrono',
      'infos_facturation',
    ]);
  });

  it('reprend les libellés et types du contrat', () => {
    const parCle = Object.fromEntries(COLUMNS.map((c) => [c.key, c]));
    expect(parCle['impe']).toEqual({ key: 'impe', label: 'IMPE', type: 'DATE' });
    expect(parCle['no']).toEqual({ key: 'no', label: 'NO', type: 'TEXT' });
    expect(parCle['statut']).toEqual({ key: 'statut', label: 'INSTALLATION', type: 'SELECT' });
    expect(parCle['heure']).toEqual({ key: 'heure', label: 'HEURE', type: 'TEXT' });
    expect(parCle['porta_commentaires']).toEqual({
      key: 'porta_commentaires',
      label: 'PORTA ET COMMENTAIRES IMPORTANT',
      type: 'LONGTEXT',
    });
    expect(parCle['num_chrono']).toEqual({ key: 'num_chrono', label: 'N° CHRONO', type: 'TEXT' });
  });

  it('déclare exactement 5 colonnes de type SELECT', () => {
    expect(SELECT_KEYS).toEqual(['partenaire', 'tech', 'nom_cp', 'statut', 'materiel_recu']);
    expect(COLUMNS.filter((c) => c.type === 'SELECT').map((c) => c.key).sort()).toEqual(
      [...SELECT_KEYS].sort(),
    );
  });
});

describe('CHOICES_BY_COLUMN', () => {
  it('compte 88 choix répartis sur les 5 listes', () => {
    expect(CHOICES_BY_COLUMN['statut']).toHaveLength(20);
    expect(CHOICES_BY_COLUMN['partenaire']).toHaveLength(41);
    expect(CHOICES_BY_COLUMN['tech']).toHaveLength(14);
    expect(CHOICES_BY_COLUMN['nom_cp']).toHaveLength(10);
    expect(CHOICES_BY_COLUMN['materiel_recu']).toHaveLength(3);
    expect(
      Object.values(CHOICES_BY_COLUMN).reduce((total, liste) => total + liste.length, 0),
    ).toBe(88);
  });

  it('applique les couleurs exactes des statuts (palette douce)', () => {
    const statuts = parLabel('statut');
    expect(statuts['NEW']).toEqual({
      label: 'NEW', bgColor: '#F7DC6F', textColor: '#6B5504', bold: true,
    });
    expect(statuts['ATT PV']).toEqual({
      label: 'ATT PV', bgColor: '#744388', textColor: '#FFFFFF', bold: true,
    });
    expect(statuts['EN COLLECTE']).toEqual({
      label: 'EN COLLECTE', bgColor: '#F9E79F', textColor: '#786208', bold: false,
    });
    expect(statuts['A DISTANCE']).toEqual({
      label: 'A DISTANCE', bgColor: null, textColor: null, bold: false,
    });
    expect(statuts['CLOTUREE']).toEqual({
      label: 'CLOTUREE', bgColor: '#D5D8DC', textColor: '#4D5656', bold: false,
    });
    expect(statuts['TECHNIQUE']).toEqual({
      label: 'TECHNIQUE', bgColor: '#E9C46A', textColor: '#6E4A08', bold: true,
    });
    expect(statuts['ATT GC']).toEqual({
      label: 'ATT GC', bgColor: '#F8B5C8', textColor: '#943126', bold: true,
    });
  });

  it('fige les 6 partenaires colorés dans l’Excel', () => {
    const partenaires = parLabel('partenaire');
    expect(partenaires['EVERLINK']).toMatchObject({ bgColor: '#7DCEA0', textColor: '#0E4D28' });
    expect(partenaires['HIGHCOM']).toMatchObject({ bgColor: '#C39BD3', textColor: '#4A235A' });
    expect(partenaires['ENTREPRISE PRO']).toMatchObject({ bgColor: '#A9CCE3', textColor: '#1B4F72' });
    expect(partenaires['OR-TEL']).toMatchObject({ bgColor: '#F7DC6F', textColor: '#6B5504' });
    expect(partenaires['VIP TELECOM']).toMatchObject({ bgColor: '#AED6F1', textColor: '#1B4F72' });
    expect(partenaires['WETELGROUP']).toMatchObject({ bgColor: '#FCDAE3', textColor: '#943126' });
  });

  it('attribue aux 35 autres partenaires une couleur pastelFor stable', () => {
    const partenaires = parLabel('partenaire');
    expect(partenaires['CUBE']).toMatchObject({
      bgColor: pastelFor('CUBE').bg,
      textColor: pastelFor('CUBE').text,
    });
    expect(partenaires['2A Consulting']).toMatchObject({
      bgColor: pastelFor('2A Consulting').bg,
      textColor: pastelFor('2A Consulting').text,
    });
    expect(partenaires['HOIST GROUP']).toMatchObject({
      bgColor: pastelFor('HOIST GROUP').bg,
      textColor: pastelFor('HOIST GROUP').text,
    });
  });

  it('rejoue deux fois la table sans changer une seule couleur (import rejouable)', () => {
    const premier = (CHOICES_BY_COLUMN['partenaire'] ?? []).map((c) => `${c.label}:${c.bgColor}`);
    const second = (CHOICES_BY_COLUMN['partenaire'] ?? []).map(
      (c) => `${c.label}:${pastelFor(c.label).bg}`,
    );
    const figes = new Set([
      'EVERLINK', 'HIGHCOM', 'ENTREPRISE PRO', 'OR-TEL', 'VIP TELECOM', 'WETELGROUP',
    ]);
    premier.forEach((entree, index) => {
      const label = entree.slice(0, entree.lastIndexOf(':'));
      if (!figes.has(label)) {
        expect(entree).toBe(second[index]);
      }
    });
  });

  it('colore la liste tech selon le contrat', () => {
    const techs = parLabel('tech');
    expect(techs['DIRECT']).toEqual({
      label: 'DIRECT', bgColor: null, textColor: '#0072A8', bold: true,
    });
    expect(techs['ADWEB']).toEqual({
      label: 'ADWEB', bgColor: null, textColor: '#196F3D', bold: true,
    });
    expect(techs['VOSGES INFO']).toEqual({
      label: 'VOSGES INFO', bgColor: null, textColor: '#196F3D', bold: true,
    });
    expect(techs['NETWORK']).toEqual({
      label: 'NETWORK', bgColor: null, textColor: null, bold: false,
    });
  });

  it('laisse nom_cp et materiel_recu neutres', () => {
    for (const key of ['nom_cp', 'materiel_recu']) {
      for (const choix of CHOICES_BY_COLUMN[key] ?? []) {
        expect(choix).toMatchObject({ bgColor: null, textColor: null, bold: false });
      }
    }
  });
});

describe('allowedValues', () => {
  it('expose les libellés autorisés d’une liste', () => {
    expect(allowedValues('statut').has('ATT CLIENT')).toBe(true);
    expect(allowedValues('statut').has('ATT GC')).toBe(true);
    expect(allowedValues('statut').has('ATT CLIENTS')).toBe(false);
    expect(allowedValues('partenaire').size).toBe(41);
  });

  it('renvoie un ensemble vide pour une colonne qui n’est pas une liste', () => {
    expect(allowedValues('client').size).toBe(0);
    expect(allowedValues('inconnue').size).toBe(0);
  });
});
