# Spec — Filtres multi-sélection, plages de dates, ligne active

Date : 2026-09-01 · Validée par le responsable projet (Quentin) · Retour ADV jour 1 de migration

## Besoin

Les filtres texte uniques sont peu pratiques : sur PARTE, les ADV veulent cocher les partenaires voulus. Étendu après cadrage : toutes les colonnes à choix + plages de dates + surbrillance de la ligne active au clic.

## 1. Filtre multi-sélection (colonnes SELECT)

Colonnes : `partenaire`, `statut`, `tech`, `nom_tech`, `nom_cp`, `materiel_recu`.

Composant de filtre custom AG Grid (Community, composant React via `colDef.filter`) :

- Cases à cocher listant les choix de la colonne (`ChoiceDTO`), rendus en pastilles colorées (mêmes couleurs que les cellules), choix archivés exclus ;
- Champ de recherche en tête (insensible casse/accents, comme `SelectCellEditor`) ;
- Actions « Tout cocher » / « Tout décocher » ;
- Entrée « (Vide) » qui matche les cellules sans valeur ;
- Sémantique : aucun état ou tout coché = pas de filtre ; sinon `doesFilterPass` = valeur de cellule ∈ cochées ;
- Filtre flottant custom compact : « Tous » ou « N sélectionnés », clic = ouverture du panneau de filtre ;
- Le composant expose un modèle AG Grid standard (`getModel`/`setModel`) : « Réinitialiser » (`setFilterModel(null)`) et compteur « X / N dossiers » existants fonctionnent sans modification. La vue Archives, qui réutilise `DataGrid`, en profite telle quelle.

## 2. Plage de dates (colonnes DATE : `impe`, `date`)

`agDateColumnFilter` natif Community, `inRange` proposé par défaut, sélecteur de date navigateur ; comparateur branché sur le format stocké ISO `YYYY-MM-DD`. Valeur de cellule non-ISO (résidus Zoho type « 31/09 ») : non comparable, la ligne est exclue des résultats d'un filtre par plage — comportement neutre, aucune donnée modifiée.

## 3. Ligne active

Au clic (ou focus clavier) sur une cellule, toute la ligne prend un fond léger issu du thème (nouvelle variable `--gc-row-active`, teinte pétrole plus marquée que `--gc-row-hover`). La surbrillance suit les déplacements aux flèches. Les surlignages métier des cellules (styles inline) restent visibles par-dessus. Aucune interaction avec la sélection/édition existante.

## Périmètre

`apps/web` uniquement — aucun changement API, aucune migration. Fichiers principaux : `columnDefs.ts` (branchement filtres), nouveau `SelectColumnFilter.tsx` (+ filtre flottant), `DataGrid.tsx` + `globals.css` (ligne active).

## Tests

- `SelectColumnFilter` : cocher/décocher, recherche, (Vide), tout cocher = pas de filtre, modèle get/set, reset global ;
- `columnDefs` : branchement par type (SELECT → custom, DATE → agDateColumnFilter avec comparateur ISO, autres → texte inchangé) ;
- comparateur de dates : ISO valide, invalide, bornes ;
- ligne active : classe posée sur la ligne focus, retirée au changement de focus.
