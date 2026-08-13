import { describe, expect, it } from 'vitest';

import { aCodeErreur, estErreurApi, messageErreurApi } from '../messages';

const erreur = (code: string, status = 409): unknown => ({
  status,
  code,
  message: 'message brut du serveur',
});

describe('messages — traduction française des ErrorCode', () => {
  it('reconnaît la forme structurelle d’une erreur API', () => {
    expect(estErreurApi(erreur('NOT_FOUND', 404))).toBe(true);
    expect(estErreurApi(new Error('réseau'))).toBe(false);
    expect(estErreurApi(null)).toBe(false);
    expect(estErreurApi('boum')).toBe(false);
  });

  it('aCodeErreur ne répond vrai que pour le code exact', () => {
    expect(aCodeErreur(erreur('COLUMN_HAS_DATA'), 'COLUMN_HAS_DATA')).toBe(true);
    expect(aCodeErreur(erreur('COLUMN_HAS_DATA'), 'CHOICE_IN_USE')).toBe(false);
    expect(aCodeErreur(new Error('réseau'), 'CHOICE_IN_USE')).toBe(false);
  });

  it('COLUMN_HAS_DATA parle de données existantes', () => {
    expect(messageErreurApi(erreur('COLUMN_HAS_DATA'))).toContain('données');
  });

  it('CHOICE_IN_USE conseille l’archivage', () => {
    const message = messageErreurApi(erreur('CHOICE_IN_USE'));
    expect(message).toContain('archiv');
    expect(message).toContain('utilisée');
  });

  it('AUTH_REQUIRED invite à se reconnecter', () => {
    expect(messageErreurApi(erreur('AUTH_REQUIRED', 401))).toContain('reconnecter');
  });

  it('VALIDATION_FAILED parle de champs invalides', () => {
    expect(messageErreurApi(erreur('VALIDATION_FAILED', 422))).toContain('invalides');
  });

  it('retombe sur un message générique pour une erreur non API', () => {
    expect(messageErreurApi(new Error('offline'))).toContain('Une erreur est survenue');
  });

  it('retombe sur le message du serveur pour un code inconnu', () => {
    expect(messageErreurApi({ status: 500, code: 'CODE_INCONNU', message: 'panne' })).toBe('panne');
  });
});
