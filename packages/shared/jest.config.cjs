/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  // Le tsconfig du package cible `module: esnext` (Feature 0) : ts-jest doit
  // émettre du CommonJS pour le runner jest, sans modifier tsconfig.json.
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: { module: 'commonjs' } }],
  },
};
