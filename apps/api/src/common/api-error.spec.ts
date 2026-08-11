import { HttpStatus } from '@nestjs/common';
import { createUserSchema, loginSchema } from '@suivi/shared';
import { ApiException } from './api.exception';
import { parseOrThrow } from './api-error';

describe('parseOrThrow', () => {
  it('retourne la valeur parsée quand elle est valide', () => {
    expect(parseOrThrow(loginSchema, { email: 'test@suivi.local', password: 'motdepasse' })).toEqual({
      email: 'test@suivi.local',
      password: 'motdepasse',
    });
  });

  it('lève une ApiException VALIDATION_FAILED en 422 quand la valeur est invalide', () => {
    expect(() => parseOrThrow(loginSchema, { email: 'pas-un-email', password: '' })).toThrow(
      ApiException,
    );

    try {
      parseOrThrow(loginSchema, { email: 'pas-un-email', password: '' });
      fail('parseOrThrow aurait dû lever une exception');
    } catch (error) {
      const api = error as ApiException;
      expect(api.code).toBe('VALIDATION_FAILED');
      expect(api.getStatus()).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
      expect(api.userMessage).toBe('Données invalides.');
    }
  });

  it('expose les détails champ par champ, avec les messages français des schémas', () => {
    try {
      parseOrThrow(createUserSchema, {
        email: 'nouveau@exemple.fr',
        displayName: 'Pierre',
        password: 'court',
        cursorColor: 'rouge',
      });
      fail('parseOrThrow aurait dû lever une exception');
    } catch (error) {
      const details = (error as ApiException).details as { path: string; message: string }[];
      expect(details).toEqual(
        expect.arrayContaining([
          { path: 'password', message: 'Mot de passe : 8 caractères minimum' },
          { path: 'cursorColor', message: 'Couleur hexadécimale attendue (ex. #AABBCC)' },
        ]),
      );
    }
  });

  it('signale la racine par un chemin vide (valeur non-objet)', () => {
    try {
      parseOrThrow(loginSchema, 'pas un objet');
      fail('parseOrThrow aurait dû lever une exception');
    } catch (error) {
      const details = (error as ApiException).details as { path: string; message: string }[];
      expect(details.length).toBeGreaterThan(0);
      expect(typeof details[0].path).toBe('string');
    }
  });
});
