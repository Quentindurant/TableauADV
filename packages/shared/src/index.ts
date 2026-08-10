// Point d'entrée du package partagé `@suivi/shared`.
//
// Consommation (voir plan section 00, Task 0.2) :
// - apps/web : transpilePackages ['@suivi/shared'] (next.config.ts)
// - apps/api : tsconfig "paths" + jest "moduleNameMapper" vers ce fichier
//
// Les types et schémas des contrats (UserDTO, ColumnDTO, RowDTO, ErrorCode,
// schémas zod, PASTEL_PALETTE, pastelFor) sont ajoutés en Feature 1.
// La constante ci-dessous est un marqueur temporaire qui prouve que le
// câblage inter-packages fonctionne ; elle sera supprimée en Feature 1.
export const SHARED_READY = true as const;
