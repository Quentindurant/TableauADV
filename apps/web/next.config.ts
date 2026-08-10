import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // @suivi/shared est publié en source TypeScript (main: src/index.ts) :
  // Next.js doit le transpiler lui-même. Ne jamais retirer cette ligne.
  transpilePackages: ['@suivi/shared'],
};

export default nextConfig;
