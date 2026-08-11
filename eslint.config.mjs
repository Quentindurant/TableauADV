import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

// Globals Node.js (CommonJS et ESM scripts)
const nodeGlobals = {
  __dirname: 'readonly',
  __filename: 'readonly',
  clearImmediate: 'readonly',
  clearInterval: 'readonly',
  clearTimeout: 'readonly',
  console: 'readonly',
  global: 'readonly',
  module: 'readonly',
  process: 'readonly',
  require: 'readonly',
  setImmediate: 'readonly',
  setInterval: 'readonly',
  setTimeout: 'readonly',
};

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      '**/next-env.d.ts',
      '**/coverage/**',
      '.claude/**',
      '.superpowers/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  // Configuration pour fichiers CommonJS (.cjs et *.config.js)
  {
    files: ['**/*.cjs', '**/webpack.config.js', '**/jest.config.js'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: nodeGlobals,
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  // Configuration pour scripts Node ESM (.mjs)
  {
    files: ['**/*.mjs'],
    languageOptions: {
      sourceType: 'module',
      globals: nodeGlobals,
    },
  },
);
