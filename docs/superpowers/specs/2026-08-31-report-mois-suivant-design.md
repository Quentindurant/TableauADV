# Spec — Report automatique des dossiers au mois suivant

Date : 2026-08-31 · Validée par le responsable projet (Quentin)

## Besoin

Les dossiers se chevauchent d'un mois sur l'autre : à la création du nouveau mois, les ADV perdaient le fil des dossiers d'août installés en septembre ou pas encore planifiés. À la création d'un mois via le « + », l'application propose de **recopier** (choix validé : copie, pas déplacement — comme dans Zoho) les dossiers concernés du dernier mois existant.

## Lignes candidates (depuis le dernier mois actif existant)

Une ligne est reprise si elle est **non archivée** et :

- `data.date` (date d'installation, ISO `YYYY-MM-DD`) tombe dans le mois cible, **OU**
- `data.date` est vide/absente ;

**sauf** si `data.statut` ∈ { `CLOTUREE`, `ANNULEE` } (dossiers terminés, jamais repris).

Non retenu (YAGNI, décision responsable) : dates au-delà du mois cible ; re-synchronisation après création (pas de bouton manuel pour l'instant).

## API (module `months`)

- `GET /months/report-preview?to=YYYY-MM` → `{ from: 'YYYY-MM' | null, count: number }`. `from` = dernier mois actif < `to` (null si aucun → count 0). Ne modifie rien.
- `POST /months/report` body `{ to: 'YYYY-MM' }` → recopie en **une transaction** les candidates de `from` vers `to` :
  - nouvel id, `month = to`, positions en tête de mois dans l'ordre relatif du mois source ;
  - `data` copié intégralement, `formats` (surlignages) copiés, `version 0`, `archived false`, `createdBy` = utilisateur courant ;
  - `RowEvent` type `create` par ligne avec payload `{ reportFrom: <idSource>, sourceMonth: <from> }` ;
  - si 0 candidate : création d'une ligne vide (comportement historique) pour matérialiser le mois ;
  - retourne `{ from, created }`.
- Realtime : `row.created` émis par ligne dans la room du mois cible (mécanique existante).

## Web

Clic « + » (MonthNav) → `GET report-preview` → dialogue de confirmation (style RowDeleteDialog) :

> **X dossiers repris depuis AOUT 2026** — date d'installation en septembre ou sans date, hors clôturés/annulés.
> [ Reprendre ] [ Créer vide ] [ Annuler ]

- « Reprendre » → `POST /months/report` puis navigation vers le mois créé.
- « Créer vide » → comportement actuel (`createRow({ month })`).
- « Annuler » → rien.
- Si `count = 0` : pas de dialogue, création vide directe.

## Garde-fous

- Le « + » cible toujours le mois suivant le dernier existant → pas de double report sur un mois déjà créé.
- Copie en transaction unique : pas d'état partiel.
- Le mois source reste intact (aucune ligne déplacée ni modifiée).

## Tests

- e2e API : filtre date dans le mois cible ; date vide reprise ; CLOTUREE/ANNULEE exclus même sans date ; archivées exclues ; ordre relatif préservé ; `formats` copiés ; 0 candidate → ligne vide ; `from` = dernier mois actif (mois à trous).
- Web : dialogue affiché avec le bon compte ; « Créer vide » ne reporte rien ; « Reprendre » appelle l'API et navigue.
