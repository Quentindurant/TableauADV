// Configuration webpack de NestJS : par défaut, `@nestjs/cli` externalise tout
// `node_modules` (via webpack-node-externals). `@suivi/shared` est publié en
// source TypeScript (main: src/index.ts) sans étape de build : il DOIT donc
// être transpilé et empaqueté par webpack, sinon Node tente de charger le .ts
// à l'exécution et échoue sur les imports relatifs sans extension (ESM).
// On retire donc `@suivi/shared` de la liste des externals.
const nodeExternals = require('webpack-node-externals');

module.exports = function (options) {
  return {
    ...options,
    externals: [
      nodeExternals({
        // Empaqueter @suivi/shared (source TS) au lieu de l'externaliser.
        allowlist: [/^@suivi\/shared/],
      }),
    ],
  };
};
