import { jwtSecret } from './jwt-secret';

describe('jwtSecret', () => {
  const previousSecret = process.env.JWT_SECRET;
  const previousEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.JWT_SECRET = previousSecret;
    process.env.NODE_ENV = previousEnv;
  });

  it('renvoie le secret déclaré', () => {
    process.env.JWT_SECRET = 'un-secret-solide';
    expect(jwtSecret()).toBe('un-secret-solide');
  });

  it('ignore les espaces autour du secret', () => {
    process.env.JWT_SECRET = '  un-secret-avec-espaces  ';
    expect(jwtSecret()).toBe('un-secret-avec-espaces');
  });

  it('traite un secret composé uniquement d espaces comme absent (dev : secret par défaut)', () => {
    process.env.NODE_ENV = 'test';
    process.env.JWT_SECRET = '   ';
    expect(jwtSecret()).toBe('dev-secret-non-securise');
  });

  it('refuse un secret composé uniquement d espaces en production', () => {
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = '   ';
    expect(() => jwtSecret()).toThrow('JWT_SECRET est obligatoire en production');
  });
});
