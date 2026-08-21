import {
  construirePlanFusion,
  construirePlanOrdre,
  normaliserClient,
  type LigneBase,
  type LigneFichier,
  type PlanFusion,
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

  it('ne réécrit jamais le nom client (clé de rapprochement) sur une correspondance', () => {
    // 'Arcadia' et 'ARCADIA' se rapprochent par normalisation : la graphie
    // en base est conservée, seule la vraie nouveauté (impe) est appliquée.
    const plan = construirePlanFusion(
      [ligneFichier(2, { client: 'Arcadia', impe: '2026-08-03' })],
      [ligneBase('row-1', { client: 'ARCADIA' })],
    );

    expect(plan.misesAJour).toHaveLength(1);
    expect(plan.misesAJour[0].patch).toEqual({ impe: '2026-08-03' });
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

  it('consigne chaque appariement non ambigu (modifié OU inchangé) avec son numéro de ligne fichier', () => {
    const plan = construirePlanFusion(
      [
        ligneFichier(2, { client: 'ARCADIA', impe: '2026-08-03' }),
        ligneFichier(3, { client: 'IDENTIQUE' }),
        ligneFichier(4, { client: 'NOUVEAU CLIENT' }),
        ligneFichier(5, { client: 'AMBIGU' }),
      ],
      [
        ligneBase('row-arcadia', { client: 'ARCADIA' }),
        ligneBase('row-identique', { client: 'IDENTIQUE' }),
        ligneBase('row-ambigu-1', { client: 'AMBIGU' }),
        ligneBase('row-ambigu-2', { client: 'AMBIGU' }),
      ],
    );

    // Les appariements couvrent la mise à jour ET l'inchangée, jamais
    // l'ambiguïté ni la création : c'est la matière première de l'ordre feuille.
    expect(plan.appariements).toEqual([
      { rowId: 'row-arcadia', numero: 2 },
      { rowId: 'row-identique', numero: 3 },
    ]);
  });
});

describe('construirePlanOrdre — « la feuille fait foi » pour l’ordre du mois', () => {
  function planVide(): PlanFusion {
    return { creations: [], misesAJour: [], inchangees: 0, ambiguites: [], appariements: [] };
  }

  it('mois vide : les créations prennent l’ordre feuille même si le plan les groupe par client', () => {
    // Fichier : ligne 2 DOUBLON, ligne 3 AUTRE, ligne 4 DOUBLON.
    // `construirePlanFusion` groupe par client : créations [2, 4, 3], donc
    // positions à la création 0, 1, 2 — l'ordre feuille exige [2, 3, 4].
    const reecritures = construirePlanOrdre(
      planVide(),
      [],
      [
        { id: 'c-2', position: 0, numero: 2 },
        { id: 'c-4', position: 1, numero: 4 },
        { id: 'c-3', position: 2, numero: 3 },
      ],
      new Set(),
    );

    // Réécritures triées par position cible ; c-2 est déjà en tête, intacte.
    expect(reecritures).toEqual([
      { rowId: 'c-3', position: 1 },
      { rowId: 'c-4', position: 2 },
    ]);
  });

  it('mélange : bloc feuille (appariées + créées, numéro croissant) puis lignes hors fichier dans leur ordre relatif', () => {
    // Base : A(0), X(1, absente du fichier), B(2), AMB(3, ambigüe).
    // Fichier : ligne 2 = B, ligne 3 = A, ligne 4 = création N.
    const plan: PlanFusion = {
      ...planVide(),
      appariements: [
        { rowId: 'row-b', numero: 2 },
        { rowId: 'row-a', numero: 3 },
      ],
    };

    const reecritures = construirePlanOrdre(
      plan,
      [
        { id: 'row-a', position: 0 },
        { id: 'row-x', position: 1 },
        { id: 'row-b', position: 2 },
        { id: 'row-amb', position: 3 },
      ],
      [{ id: 'row-n', position: 4, numero: 4 }],
      new Set(),
    );

    // Ordre cible : B, A, N (feuille) puis X, AMB (ordre relatif actuel).
    expect(reecritures).toEqual([
      { rowId: 'row-b', position: 0 },
      { rowId: 'row-a', position: 1 },
      { rowId: 'row-n', position: 2 },
      { rowId: 'row-x', position: 3 },
      { rowId: 'row-amb', position: 4 },
    ]);
  });

  it('aucune position ne change quand la base est déjà dans l’ordre feuille : zéro écriture', () => {
    const plan: PlanFusion = {
      ...planVide(),
      appariements: [
        { rowId: 'row-a', numero: 2 },
        { rowId: 'row-b', numero: 3 },
      ],
    };

    const reecritures = construirePlanOrdre(
      plan,
      [
        { id: 'row-a', position: 0 },
        { id: 'row-b', position: 1 },
        { id: 'row-x', position: 2 },
      ],
      [],
      new Set(),
    );

    expect(reecritures).toEqual([]);
  });

  it('est idempotent : rejouer le calcul sur l’ordre produit ne réécrit plus rien', () => {
    const plan: PlanFusion = {
      ...planVide(),
      appariements: [
        { rowId: 'row-b', numero: 2 },
        { rowId: 'row-a', numero: 3 },
      ],
    };
    const base = [
      { id: 'row-a', position: 0 },
      { id: 'row-x', position: 1 },
      { id: 'row-b', position: 2 },
    ];

    const premieres = construirePlanOrdre(plan, base, [], new Set());
    expect(premieres).not.toEqual([]);

    // Applique les réécritures puis rejoue : la feuille et la base coïncident.
    const positions = new Map(base.map((ligne) => [ligne.id, ligne.position]));
    for (const { rowId, position } of premieres) {
      positions.set(rowId, position);
    }
    const rejouee = [...positions]
      .map(([id, position]) => ({ id, position }))
      .sort((gauche, droite) => gauche.position - droite.position);

    expect(construirePlanOrdre(plan, rejouee, [], new Set())).toEqual([]);
  });

  it('une ligne en conflit de version rejoint le bloc « après », sa ligne fichier est ignorée', () => {
    // Fichier : ligne 2 = B, ligne 3 = A — mais A a été modifiée pendant
    // l'import (garde de version) : elle reste après le bloc feuille.
    const plan: PlanFusion = {
      ...planVide(),
      appariements: [
        { rowId: 'row-b', numero: 2 },
        { rowId: 'row-a', numero: 3 },
      ],
    };

    const reecritures = construirePlanOrdre(
      plan,
      [
        { id: 'row-a', position: 0 },
        { id: 'row-b', position: 1 },
      ],
      [],
      new Set(['row-a']),
    );

    expect(reecritures).toEqual([
      { rowId: 'row-b', position: 0 },
      { rowId: 'row-a', position: 1 },
    ]);
  });
});
