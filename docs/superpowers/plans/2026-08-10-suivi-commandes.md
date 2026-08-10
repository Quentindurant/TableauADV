# Plan d'implémentation — Application de suivi des commandes

> **Pour les agents d'exécution :** SOUS-COMPÉTENCE REQUISE — utilisez
> `superpowers:subagent-driven-development` (recommandé) ou
> `superpowers:executing-plans` pour exécuter ce plan tâche par tâche.
> Les étapes utilisent la syntaxe case à cocher (`- [ ]`) pour le suivi.

**Goal :** Remplacer le classeur Zoho Sheet de suivi des commandes télécom par
une application web auto-hébergée, fidèle visuellement, entièrement
paramétrable (colonnes, listes, couleurs), multi-utilisateurs avec co-édition
en temps réel.

**Architecture :** Monorepo pnpm. Front Next.js 15 (App Router) ; API + WebSocket
NestJS 11 (Socket.IO) ; Prisma + PostgreSQL 16. Colonnes dynamiques → valeurs
des lignes en JSONB. Déploiement VPS Debian derrière Apache2 (reverse proxy +
mod_proxy_wstunnel), sous-domaine HTTPS, PM2.

**Tech Stack :** Node 22, pnpm 10, Next.js 15 / React 19, NestJS 11,
@nestjs/jwt, socket.io 4, Prisma 6, PostgreSQL 16, ag-grid-community 34,
zustand 5, zod 3, argon2, jszip + exceljs (import), vitest + Playwright (front),
jest + supertest (API).

## Contrats partagés (à lire AVANT toute tâche)

Le fichier [`sections/_contracts.md`](sections/_contracts.md) fixe les noms et
signatures partagés par toutes les sections : schéma Prisma définitif, types
`@suivi/shared`, les 21 routes REST avec leurs `ErrorCode`, les événements
Socket.IO, le mécanisme d'erreur unique (`ApiException` + `parseOrThrow`), le
client HTTP web (`apiFetch` + `ApiRequestError`), les variables
d'environnement et les couleurs initiales. **Aucune tâche ne redéfinit ces
noms — elle les consomme tels quels.**

## Global Constraints

- Node 22 LTS, pnpm 10 (workspace). Packages : `@suivi/web`, `@suivi/api`,
  `@suivi/shared`. Ports : web 3000, api 3001. Préfixe API global `/api`.
- TypeScript strict partout. Messages d'erreur utilisateur en français.
- **Gitflow obligatoire** : chaque fonctionnalité sur une branche
  `feature/<nom>` créée depuis `develop` ; fin de fonctionnalité = tests verts
  puis `git merge --no-ff` dans `develop` + `git push origin develop`. Jamais
  de commit direct sur `develop` ou `main`. `main` réservée aux mises en
  production (tags).
- **TDD strict** à chaque tâche : test qui échoue → implémentation minimale →
  test qui passe → commit. Cas d'erreur (`ErrorCode` des contrats) chacun
  testé avant merge.
- Un seul mécanisme d'erreur (`ApiException` / `ApiExceptionFilter`) et un seul
  de validation (`parseOrThrow`), livrés par la Feature 2, consommés partout.
- Base de données de dev alignée sur `docker-compose.dev.yml` :
  `postgresql://suivi:dev@localhost:5432/suivi?schema=public`.

## Ordre d'exécution des fonctionnalités

Les fonctionnalités s'exécutent dans l'ordre. Chaque section est un fichier
autonome de tâches TDD. Dépendances indiquées entre parenthèses.

| # | Fonctionnalité | Fichier | Tâches |
|---|---|---|---|
| 0 | Socle monorepo | [00-scaffold.md](sections/00-scaffold.md) | 5 |
| 1 | Schéma de données + seed (← 0) | [01-db-schema.md](sections/01-db-schema.md) | 7 |
| 2 | Authentification + équipe (← 1) | [02-auth.md](sections/02-auth.md) | 10 |
| 3 | Colonnes & listes CRUD (← 2) | [03-columns-choices.md](sections/03-columns-choices.md) | 10 |
| 4 | Lignes : CRUD, fusion, versions (← 2) | [04-rows-crud.md](sections/04-rows-crud.md) | 10 |
| 5 | Passerelle temps réel (← 3, 4) | [05-realtime-gateway.md](sections/05-realtime-gateway.md) | 7 |
| 6 | Grille tableur (← 3, 4) | [06-grid-ui.md](sections/06-grid-ui.md) | 12 |
| 7 | Co-édition visible (← 5, 6) | [07-coedition-ui.md](sections/07-coedition-ui.md) | 9 |
| 8 | Paramètres (← 3, 6) | [08-settings-ui.md](sections/08-settings-ui.md) | 12 |
| 9 | Import du classeur Zoho (← 1) | [09-import-xlsx.md](sections/09-import-xlsx.md) | 10 |
| 10 | Déploiement VPS (← tout) | [10-deploy.md](sections/10-deploy.md) | 6 |

**Total : 88 tâches.** Chemin critique : 0 → 1 → 2 → {3, 4} → {5, 6} → {7, 8}.
Les Features 9 (import) et 10 (déploiement) peuvent être menées en parallèle du
chemin critique une fois leurs dépendances satisfaites.

## Décisions produit intégrées

- **Type de colonne** : modifiable à tout moment ; les valeurs existantes ne
  sont pas converties (réinterprétées par le nouveau type), avertissement
  affiché à l'utilisateur.
- **Copier-coller** : niveau AG Grid Community — copie de la cellule focalisée,
  collage sur une cellule ou sur une sélection verticale d'une colonne. Les
  plages rectangulaires façon Excel (Enterprise) sont hors périmètre v1.
- **Couleurs partenaires** : chaque partenaire coloré (6 couleurs issues de
  l'Excel, palette pastel déterministe pour les autres), modifiable dans les
  Paramètres.
- **Co-édition** : présence par cellule, verrous 30 s, fusion par clé, refus
  propre (409) sur conflit résiduel.

## Auto-revue effectuée

Ce plan a été relu automatiquement (cohérence avec les contrats et la spec,
chasse aux placeholders, couverture). 20 incohérences inter-sections détectées
et corrigées (chemins d'import, collisions de noms, configurations de test
contradictoires), 4 écarts avec la spec comblés (type de colonne modifiable,
copier-coller, barre du haut unifiée, alias racine `import:xlsx`). Aucune
signature divergente ni placeholder restant.

## Spec source

[`docs/superpowers/specs/2026-08-10-suivi-commandes-design.md`](../specs/2026-08-10-suivi-commandes-design.md)
