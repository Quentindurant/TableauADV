import {
  createChoiceSchema,
  createColumnSchema,
  createRowSchema,
  createUserSchema,
  loginSchema,
  moveRowSchema,
  patchRowSchema,
  updateChoiceSchema,
  updateColumnSchema,
  updateMeSchema,
} from './schemas';

describe('loginSchema', () => {
  it('accepte email + mot de passe', () => {
    expect(
      loginSchema.safeParse({ email: 'a@b.fr', password: 'x' }).success,
    ).toBe(true);
  });

  it('rejette un email invalide et un mot de passe vide', () => {
    expect(loginSchema.safeParse({ email: 'pas-un-email', password: 'x' }).success).toBe(false);
    expect(loginSchema.safeParse({ email: 'a@b.fr', password: '' }).success).toBe(false);
  });
});

describe('createUserSchema', () => {
  const valid = {
    email: 'nouveau@exemple.fr',
    displayName: 'Pierre',
    password: 'motdepasse',
    cursorColor: '#E74C3C',
  };

  it('accepte un utilisateur complet', () => {
    expect(createUserSchema.safeParse(valid).success).toBe(true);
  });

  it('rejette un mot de passe trop court (< 8)', () => {
    expect(createUserSchema.safeParse({ ...valid, password: 'court' }).success).toBe(false);
  });

  it('rejette une couleur non hexadécimale', () => {
    expect(createUserSchema.safeParse({ ...valid, cursorColor: 'rouge' }).success).toBe(false);
  });
});

describe('updateMeSchema', () => {
  it('accepte une mise à jour partielle', () => {
    expect(updateMeSchema.safeParse({ displayName: 'Quentin D.' }).success).toBe(true);
  });

  it('rejette un objet vide (aucun champ à modifier)', () => {
    expect(updateMeSchema.safeParse({}).success).toBe(false);
  });
});

describe('createColumnSchema / updateColumnSchema', () => {
  it('accepte {label, type} avec un type du contrat', () => {
    expect(createColumnSchema.safeParse({ label: 'Réf devis', type: 'TEXT' }).success).toBe(true);
  });

  it('rejette un type hors enum', () => {
    expect(createColumnSchema.safeParse({ label: 'X', type: 'CHECKBOX' }).success).toBe(false);
  });

  it('updateColumnSchema accepte position/width/visible partiels', () => {
    expect(updateColumnSchema.safeParse({ width: 200, visible: false }).success).toBe(true);
  });

  it('updateColumnSchema accepte un changement de type valide', () => {
    expect(updateColumnSchema.safeParse({ type: 'NUMBER' }).success).toBe(true);
  });

  it('updateColumnSchema rejette un type hors enum', () => {
    expect(updateColumnSchema.safeParse({ type: 'CHECKBOX' }).success).toBe(false);
  });

  it('updateColumnSchema rejette une largeur non entière', () => {
    expect(updateColumnSchema.safeParse({ width: 150.5 }).success).toBe(false);
  });
});

describe('createChoiceSchema / updateChoiceSchema', () => {
  it('accepte un choix avec couleurs et gras', () => {
    expect(
      createChoiceSchema.safeParse({
        label: 'NEW',
        bgColor: '#FFFF00',
        textColor: '#FF0000',
        bold: true,
      }).success,
    ).toBe(true);
  });

  it('rejette un label vide', () => {
    expect(createChoiceSchema.safeParse({ label: '   ' }).success).toBe(false);
  });

  it('updateChoiceSchema accepte bgColor null (retour au neutre)', () => {
    expect(updateChoiceSchema.safeParse({ bgColor: null, archived: true }).success).toBe(true);
  });
});

describe('createRowSchema / moveRowSchema', () => {
  it('accepte un mois YYYY-MM', () => {
    expect(createRowSchema.safeParse({ month: '2026-08' }).success).toBe(true);
    expect(createRowSchema.safeParse({ month: '2026-08', position: 3 }).success).toBe(true);
  });

  it('rejette un mois mal formé', () => {
    expect(createRowSchema.safeParse({ month: '2026-13' }).success).toBe(false);
    expect(createRowSchema.safeParse({ month: 'AOUT 2026' }).success).toBe(false);
  });

  it('moveRowSchema accepte month seul, position seule, ou les deux', () => {
    expect(moveRowSchema.safeParse({ month: '2026-09' }).success).toBe(true);
    expect(moveRowSchema.safeParse({ position: 0 }).success).toBe(true);
  });
});

describe('patchRowSchema (contrat exact)', () => {
  it('rejette expectedVersion manquant', () => {
    expect(patchRowSchema.safeParse({ patch: { client: 'ARCADIA' } }).success).toBe(false);
  });

  it('rejette expectedVersion non entier', () => {
    expect(patchRowSchema.safeParse({ expectedVersion: 1.5 }).success).toBe(false);
  });

  it('accepte un patch string/number/null', () => {
    expect(
      patchRowSchema.safeParse({
        expectedVersion: 3,
        patch: { client: 'ARCADIA', num_chrono: 78, dpt: null },
      }).success,
    ).toBe(true);
  });

  it('rejette une valeur de patch booléenne', () => {
    expect(
      patchRowSchema.safeParse({ expectedVersion: 3, patch: { archived: true } }).success,
    ).toBe(false);
  });

  it('accepte formats avec bg, et null pour effacer un surlignage', () => {
    expect(
      patchRowSchema.safeParse({
        expectedVersion: 0,
        formats: { num_chrono: { bg: '#FF0000' }, impe: null },
      }).success,
    ).toBe(true);
  });

  it('rejette un bg non string dans formats', () => {
    expect(
      patchRowSchema.safeParse({ expectedVersion: 0, formats: { impe: { bg: 42 } } }).success,
    ).toBe(false);
  });
});
