import { execSync } from 'node:child_process';

/**
 * Le seed de la Feature 1 est idempotent : il garantit la présence de
 * l'utilisateur initial (quentin.durant49@orange.fr / changeme) utilisé par
 * les scénarios de connexion, sans rien dupliquer.
 */
export default function globalSetup(): void {
  execSync('pnpm --filter @suivi/api exec prisma db seed', { stdio: 'inherit', cwd: '../..' });
  // Comptes Alice et Bob utilisés par les scénarios de co-édition à deux
  // navigateurs. Idempotent (upsert par e-mail), comme le seed principal.
  execSync('pnpm --filter @suivi/api seed:e2e', { stdio: 'inherit', cwd: '../..' });
}
