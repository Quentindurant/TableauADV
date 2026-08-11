/**
 * Test de non-régression : @suivi/shared est empaqueté dans le bundle webpack.
 *
 * Problème évité : webpack-node-externals externalise par défaut tout node_modules.
 * Si @suivi/shared est externalisé (non empaqueté), Node tente de charger le .ts
 * source à l'exécution → ERR_MODULE_NOT_FOUND sur les imports sans extension ESM.
 *
 * Ce script lit dist/main.js APRÈS `nest build` et vérifie la présence des
 * symboles propres à shared. Il échoue avec exit code 1 si shared est absent.
 *
 * Usage (depuis apps/api/) :
 *   pnpm exec nest build && node test/bundle-shared.check.mjs
 *
 * Ou depuis la racine du monorepo :
 *   pnpm --filter @suivi/api exec nest build && node apps/api/test/bundle-shared.check.mjs
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const bundlePath = join(__dirname, '..', 'dist', 'main.js');

let bundle;
try {
  bundle = readFileSync(bundlePath, 'utf8');
} catch {
  console.error(`ERREUR : bundle introuvable → ${bundlePath}`);
  console.error('Lancez d\'abord : pnpm exec nest build');
  process.exit(1);
}

// Symboles propres à @suivi/shared — leur présence prouve que shared est inliné.
const SYMBOLES_SHARED = ['VALIDATION_FAILED', 'pastelFor'];

let echecs = 0;
for (const symbole of SYMBOLES_SHARED) {
  if (!bundle.includes(symbole)) {
    console.error(`ECHEC : symbole "${symbole}" absent du bundle → @suivi/shared n'est PAS empaqueté`);
    echecs++;
  }
}

if (echecs > 0) {
  console.error(
    '\nDiagnostic : vérifiez apps/api/webpack.config.js — ' +
    'allowlist: [/^@suivi\\/shared/] doit être présent dans nodeExternals().',
  );
  process.exit(1);
}

const occurrences = SYMBOLES_SHARED.map(s => {
  const count = (bundle.match(new RegExp(s, 'g')) || []).length;
  return `  ${s}: ${count} occurrence(s)`;
}).join('\n');

console.log('OK : @suivi/shared est bien empaqueté dans le bundle webpack.');
console.log('Occurrences des symboles shared dans dist/main.js :');
console.log(occurrences);
