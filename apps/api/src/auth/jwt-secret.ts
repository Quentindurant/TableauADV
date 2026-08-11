/**
 * Secret de signature des JWT. Obligatoire en production ; en dev/test, un
 * secret par défaut évite d'imposer un `.env` pour lancer les tests unitaires.
 */
export function jwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (secret && secret.length > 0) {
    return secret;
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET est obligatoire en production (apps/api/.env).');
  }
  return 'dev-secret-non-securise';
}
