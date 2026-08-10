# Suivi commandes

Application web auto-hébergée de suivi des commandes/installations télécom :
grille type tableur (AG Grid), co-édition temps réel (Socket.IO),
paramétrage complet des colonnes/listes/couleurs.
Remplace le classeur Zoho « TABLEAU SUIVI COMMANDES 2026 ».

## Stack

Monorepo pnpm :

| Package | Rôle | Port dev |
| --- | --- | --- |
| `apps/web` (`@suivi/web`) | Next.js 15 (App Router, React 19) | 3000 |
| `apps/api` (`@suivi/api`) | NestJS 11 (REST `/api` + Socket.IO) | 3001 |
| `packages/shared` (`@suivi/shared`) | Types + schémas zod partagés (source TS, sans build) | — |

Base : PostgreSQL 16 (Prisma 6).

## Prérequis

- Node 22 LTS (`nvm use` lit le `.nvmrc`)
- pnpm 10 (`corepack enable`)
- Docker (Postgres de dev)

## Démarrage rapide

```bash
pnpm install

# Base de données de dev (postgres:16, user suivi / mdp dev / base suivi)
docker compose -f docker-compose.dev.yml up -d

# Variables d'environnement
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local

# Lancer web (3000) + api (3001) en parallèle
pnpm dev
```

Vérifications :

- [http://localhost:3001/api/health](http://localhost:3001/api/health) → `{"status":"ok"}`
- [http://localhost:3000](http://localhost:3000) → page « Suivi commandes »

## Scripts racine

| Commande | Effet |
| --- | --- |
| `pnpm dev` | web + api en watch |
| `pnpm build` | build de tous les packages |
| `pnpm test` | tests de tous les packages (jest + supertest côté api) |
| `pnpm lint` | ESLint (flat config racine) |
| `pnpm format` | Prettier |

## Méthodologie

Gitflow : `main` (stable) / `develop` (intégration) / `feature/<nom>`.
Aucun commit direct sur `develop` ou `main` ; pas de merge avec des tests
rouges. Le plan d'implémentation détaillé est dans
`docs/superpowers/plans/`.
