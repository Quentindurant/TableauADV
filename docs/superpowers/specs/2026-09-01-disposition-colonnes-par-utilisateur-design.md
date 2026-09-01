# Spec — Disposition des colonnes par utilisateur

Date : 2026-09-01 · Validée par le responsable projet (Quentin)

## Besoin

Le redimensionnement et le déplacement des colonnes écrivent aujourd'hui la config globale (`PATCH /columns/:id` + `config.changed` broadcast) : chaque ADV écrase la vue des autres. La disposition — largeurs, ordre, colonnes masquées — devient **propre à chaque compte** et mémorisée en base (retrouvée sur n'importe quel poste).

## Données

Nouveau modèle Prisma `UserColumnLayout` :

- `userId` (FK User, cascade), `columnId` (FK Column, cascade), `@@unique([userId, columnId])` ;
- `width Int?`, `position Int?`, `hidden Boolean @default(false)` — champ nul = hérite du réglage standard (table `Column`).

Migration SQL dans le style des migrations existantes.

## API (auth JWT, comme le reste)

- `GET /me/column-layout` → `[{ columnId, width, position, hidden }]` de l'utilisateur courant (entrées existantes uniquement).
- `PATCH /me/column-layout/:columnId` body `{ width? , position?, hidden? }` (au moins un champ) → upsert de l'entrée, 404 si colonne inconnue. Pas d'émission temps réel (préférence personnelle).
- `DELETE /me/column-layout` → purge toutes les entrées de l'utilisateur (réinitialisation), retourne `{ deleted }`.
- `PATCH /columns/:id` global **inchangé** : réservé à l'écran admin Paramètres > Colonnes, qui continue de définir le réglage standard.

## Fusion côté grille (web)

- Store : `userLayout: Record<columnId, { width?, position?, hidden? }>` chargé au bootstrap avec les colonnes.
- Effectif par colonne : largeur = perso ?? standard ; tri = position perso ?? position standard (départage stable par position standard) ; visible = `visible` global ET non masquée perso.
- `onColumnResized` / `onColumnMoved` de la grille écrivent le layout perso (mécanique debounce 400 ms par colonne conservée, `columnLayout.ts` repointé sur la route perso). Un déplacement enregistre la position perso de toutes les colonnes affichées (ordre complet, pas de trous ambigus).
- `config.changed 'columns'` (admin) : recharge le global puis ré-applique le layout perso — la disposition personnelle n'est plus jamais écrasée. Colonne créée après coup : place et largeur standards.

## UI — panneau « Colonnes »

Bouton « Colonnes » dans la barre de statut du bas (à côté du compteur / Réinitialiser les filtres) :

- cases à cocher afficher/masquer par colonne (libellés, dans l'ordre effectif) — décocher = masquer pour soi seulement ; les colonnes invisibles globalement n'apparaissent pas ;
- bouton « Réinitialiser la disposition » → `DELETE /me/column-layout` + retour immédiat au standard ;
- fermeture au clic extérieur/Échap, style des panneaux existants (MonthNav menu).

## Tests

- e2e API : isolation entre 2 comptes (le PATCH de l'un n'affecte pas l'autre), upsert partiel (width seul puis hidden), 404 colonne inconnue, DELETE purge le seul utilisateur courant, cascade à la suppression de colonne, 422/401.
- Web : fusion largeur/ordre/masquage (fonctions pures), panneau (cocher/décocher → PATCH, réinit → DELETE + rechargement), ré-application du layout après config.changed.
