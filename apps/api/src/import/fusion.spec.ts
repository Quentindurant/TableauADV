import {
  construirePlanFusion,
  normaliserClient,
  type LigneBase,
  type LigneFichier,
} from './fusion';

function ligneFichier(
  numero: number,
  data: Record<string, string>,
  formats: Record<string, { bg: string }> = {},
): LigneFichier {
  return { numero, data, formats };
}

function ligneBase(
  id: string,
  data: Record<string, string | number>,
  formats: Record<string, { bg?: string }> = {},
): LigneBase {
  return { id, data, formats };
}

describe('normaliserClient', () => {
  it('trime, met en majuscules, retire les accents et compacte les espaces', () => {
    expect(normaliserClient('  Société  Générale ')).toBe('SOCIETE GENERALE');
    expect(normaliserClient('cabinet latès')).toBe('CABINET LATES');
  });

  it("renvoie null si la valeur est vide ou n'est pas un texte", () => {
    expect(normaliserClient(null)).toBeNull();
    expect(normaliserClient(undefined)).toBeNull();
    expect(normaliserClient('')).toBeNull();
    expect(normaliserClient('   ')).toBeNull();
    expect(normaliserClient(42)).toBeNull();
  });
});

describe('construirePlanFusion', () => {
  it('met à jour une correspondance non ambigüe avec les seuls champs non vides et différents', () => {
    const plan = construirePlanFusion(
      [ligneFichier(2, { client: 'ARCADIA', impe: '2026-08-03' })],
      [ligneBase('row-1', { client: 'ARCADIA', tech: 'DIRECT' })],
    );

    expect(plan.creations).toHaveLength(0);
    expect(plan.ambiguites).toHaveLength(0);
    expect(plan.inchangees).toBe(0);
    expect(plan.misesAJour).toHaveLength(1);
    expect(plan.misesAJour[0].rowId).toBe('row-1');
    // `client` est identique : il ne fait pas partie du patch.
    expect(plan.misesAJour[0].patch).toEqual({ impe: '2026-08-03' });
    expect(plan.misesAJour[0].changedKeys).toEqual(['impe']);
  });

  it("une cellule vide côté fichier n'écrase JAMAIS une valeur existante", () => {
    // `tech` et `commentaires_planif` absents du fichier (cellules vides) :
    // ils ne doivent pas apparaître dans le patch.
    const plan = construirePlanFusion(
      [ligneFichier(2, { client: 'ARCADIA', statut: 'NEW' })],
      [
        ligneBase('row-1', {
          client: 'ARCADIA',
          tech: 'DIRECT',
          commentaires_planif: 'RAS',
        }),
      ],
    );

    expect(plan.misesAJour).toHaveLength(1);
    expect(plan.misesAJour[0].patch).toEqual({ statut: 'NEW' });
    expect(Object.keys(plan.misesAJour[0].patch)).not.toContain('tech');
    expect(Object.keys(plan.misesAJour[0].patch)).not.toContain('commentaires_planif');
  });

  it('compte inchangée une ligne dont toutes les valeurs fichier sont déjà en base', () => {
    // 78 (nombre en base) et '78' (texte fichier) sont la même valeur.
    const plan = construirePlanFusion(
      [ligneFichier(2, { client: 'ARCADIA', num_chrono: '78' })],
      [ligneBase('row-1', { client: 'ARCADIA', num_chrono: 78, tech: 'DIRECT' })],
    );

    expect(plan.misesAJour).toHaveLength(0);
    expect(plan.inchangees).toBe(1);
    expect(plan.creations).toHaveLength(0);
  });

  it('crée une ligne fichier sans correspondance en base', () => {
    const nouvelle = ligneFichier(3, { client: 'NOUVEAU CLIENT', statut: 'NEW' });
    const plan = construirePlanFusion(
      [nouvelle],
      [ligneBase('row-1', { client: 'ARCADIA' })],
    );

    expect(plan.creations).toEqual([nouvelle]);
    expect(plan.misesAJour).toHaveLength(0);
    expect(plan.ambiguites).toHaveLength(0);
  });

  it('rapproche les clients malgré casse, accents et espaces multiples', () => {
    const plan = construirePlanFusion(
      [ligneFichier(2, { client: 'cabinet  latès ', impe: '2026-08-01' })],
      [ligneBase('row-1', { client: 'CABINET LATES' })],
    );

    expect(plan.misesAJour).toHaveLength(1);
    expect(plan.misesAJour[0].rowId).toBe('row-1');
  });

  it('consigne une ambiguïté quand plusieurs lignes base portent le même client — sans rien toucher', () => {
    const plan = construirePlanFusion(
      [ligneFichier(2, { client: 'CABINET LATES', impe: '2026-08-01' })],
      [
        ligneBase('row-1', { client: 'CABINET LATES' }),
        ligneBase('row-2', { client: 'CABINET LATES' }),
      ],
    );

    expect(plan.misesAJour).toHaveLength(0);
    expect(plan.creations).toHaveLength(0);
    expect(plan.ambiguites).toHaveLength(1);
    expect(plan.ambiguites[0].client).toBe('CABINET LATES');
    expect(plan.ambiguites[0].lignesFichier).toEqual([2]);
    expect(plan.ambiguites[0].lignesBase).toEqual(['row-1', 'row-2']);
  });

  it('consigne une ambiguïté quand plusieurs lignes fichier visent la même ligne base', () => {
    const plan = construirePlanFusion(
      [
        ligneFichier(2, { client: 'ARCADIA', impe: '2026-08-01' }),
        ligneFichier(5, { client: 'Arcadia', impe: '2026-08-02' }),
      ],
      [ligneBase('row-1', { client: 'ARCADIA' })],
    );

    expect(plan.misesAJour).toHaveLength(0);
    expect(plan.creations).toHaveLength(0);
    expect(plan.ambiguites).toHaveLength(1);
    expect(plan.ambiguites[0].lignesFichier).toEqual([2, 5]);
    expect(plan.ambiguites[0].lignesBase).toEqual(['row-1']);
  });

  it('consigne une ambiguïté pour une ligne fichier sans nom client', () => {
    const plan = construirePlanFusion(
      [ligneFichier(4, { statut: 'NEW' })],
      [],
    );

    expect(plan.creations).toHaveLength(0);
    expect(plan.ambiguites).toHaveLength(1);
    expect(plan.ambiguites[0].raison).toBe('nom client absent');
    expect(plan.ambiguites[0].lignesFichier).toEqual([4]);
    expect(plan.ambiguites[0].lignesBase).toEqual([]);
  });

  it('crée plusieurs lignes fichier de même client quand aucune ligne base ne correspond', () => {
    const plan = construirePlanFusion(
      [
        ligneFichier(2, { client: 'DOUBLON SARL', impe: '2026-08-01' }),
        ligneFichier(3, { client: 'DOUBLON SARL', impe: '2026-08-02' }),
      ],
      [],
    );

    expect(plan.creations).toHaveLength(2);
    expect(plan.ambiguites).toHaveLength(0);
  });

  it('ne propose JAMAIS de suppression : les lignes base absentes du fichier restent hors du plan', () => {
    const plan = construirePlanFusion(
      [ligneFichier(2, { client: 'ARCADIA', impe: '2026-08-03' })],
      [
        ligneBase('row-1', { client: 'ARCADIA' }),
        ligneBase('row-2', { client: 'INTOUCHABLE', tech: 'DIRECT' }),
      ],
    );

    expect(plan.misesAJour.map((mise) => mise.rowId)).toEqual(['row-1']);
    expect(plan.creations).toHaveLength(0);
    expect(plan.ambiguites).toHaveLength(0);
    // Aucun champ du plan ne référence row-2 : elle est intacte par construction.
    expect(JSON.stringify(plan)).not.toContain('row-2');
  });

  it('reprend un surlignage fichier absent en base, sans jamais retirer un surlignage existant', () => {
    const plan = construirePlanFusion(
      [ligneFichier(2, { client: 'ARCADIA' }, { statut: { bg: '#FF0000' } })],
      [
        ligneBase(
          'row-1',
          { client: 'ARCADIA' },
          { commentaires_planif: { bg: '#FFFF00' } },
        ),
      ],
    );

    expect(plan.misesAJour).toHaveLength(1);
    expect(plan.misesAJour[0].formats).toEqual({ statut: { bg: '#FF0000' } });
    expect(plan.misesAJour[0].changedKeys).toEqual(['statut']);
  });

  it('ne compte pas comme changement un surlignage identique en base', () => {
    const plan = construirePlanFusion(
      [ligneFichier(2, { client: 'ARCADIA' }, { statut: { bg: '#FF0000' } })],
      [ligneBase('row-1', { client: 'ARCADIA' }, { statut: { bg: '#FF0000' } })],
    );

    expect(plan.misesAJour).toHaveLength(0);
    expect(plan.inchangees).toBe(1);
  });
});
