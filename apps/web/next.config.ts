import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // @suivi/shared est publié en source TypeScript (main: src/index.ts) :
  // Next.js doit le transpiler lui-même. Ne jamais retirer cette ligne.
  transpilePackages: ['@suivi/shared'],

  // Déploiement (Feature 10) : PAS de `output: 'standalone'`.
  // Le VPS héberge le monorepo complet avec ses node_modules ; PM2 lance
  // `pnpm start` (= `next start --port 3000`) dans apps/web. Le mode
  // standalone n'apporterait qu'un gain de taille de bundle inutile ici
  // et compliquerait la résolution des dépendances du workspace pnpm.
};

export default nextConfig;
