# Spec — Colonne NO, statut ATT GC, IMPE bicolore, palette douce, menu mois

Date : 2026-08-31 · Validée par le responsable projet (Quentin) · Aperçu couleurs : artifact « Refonte couleurs — Tableau Suivi »

## Contexte

Quatre évolutions apparues dans la feuille Zoho depuis la mise en production, plus un bug d'affichage :

1. Colonne **NO** (bon de commande selon partenaire) — onglet AOUT 2026, col B.
2. Nouvel état **ATT GC** dans la colonne INSTALLATION.
3. **IMPE** limitée à 2 couleurs de surlignage (rouge, orange).
4. Couleurs de surlignage et pastilles **trop vives** — fatigue visuelle.
5. Bug : le **menu déroulant des mois** est rogné (invisible).

## Lot 1 — Colonne NO (TEXT libre)

Usage constaté dans le Zoho : HIGHCOM = n° BC numérique (6384–7279), EVERLINK = code de lot (L1A/L1B/L1C/POC), autres partenaires = vide. Décision : **TEXT libre**, pas de liste.

- Nouvelle `Column` : key `no`, label `NO`, type TEXT, position 1 (entre IMPE et CLIENT), width 90.
- Migration SQL **idempotente** : si `key='no'` absent → décaler `position >= 1` de +1, puis insérer.
- `seed.ts` : insertion + renumérotation des positions.
- `import/colors.ts` : insertion à l'index 1 (l'index du tableau = position à l'import).
- `import/header-mapping.ts` : alias `NO` → `no` (`NO CHRONO` reste sur `num_chrono`, table à correspondance exacte).
- Import complet **et** import fusion couverts (même `buildHeaderMap`).
- Test : sur l'onglet AOUT 2026 du fichier réel, **aucun en-tête non mappé** et valeurs NO importées (6534…, L1A…).

## Lot 2 — Statut ATT GC

- Nouveau `Choice` sur la colonne `statut` : label `ATT GC`, bg `#F8B5C8`, texte `#943126`, gras — famille visuelle des ATT.
- Migration SQL idempotente sur le modèle de `20260821120000_statuts_everlink` (INSERT … ON CONFLICT DO NOTHING).
- `seed.ts` + `import/colors.ts` mis à jour ; au passage `colors.ts` rattrape les 4 statuts Everlink manquants (TECHNIQUE, OPER, PORTA, PV) → 20 statuts partout.

## Lot 3 — IMPE : rouge/orange seulement

- Palette surligneur restreinte **par colonne** : `{ impe: [Rouge, Orange] }` (constante côté web, `HighlightPalette` filtrée via la clé de colonne transmise par `RowContextMenu`).
- Autres colonnes : 6 couleurs.
- Import : `SURLIGNAGES` étendu — `FF0000` → rouge doux, `FFFF00` → jaune doux, **`FFC000` → orange doux** (l'orange Zoho était perdu).
- Surlignages IMPE existants non conformes : **conservés** (décision responsable).

## Lot 4 — Palette douce (validée contraste ≥ 4,5:1, daltonisme OK sur duo IMPE)

### Surligneur (6 couleurs, `HighlightPalette.tsx` + conversion des données)

| Couleur | Avant | Après |
|---|---|---|
| Rouge | #FF0000 | **#EE7A6D** |
| Orange | — | **#F5B041** (nouveau) |
| Jaune | #FFFF00 | **#F7DC6F** |
| Vert | #9BDEB4 | **#7DCEA0** |
| Bleu | #85C1E9 | #85C1E9 (inchangé) |
| Violet | #C39BD3 | **#BB8FCE** |

Migration de données : remap des `Row.formats[*].bg` existants selon ce tableau.

### Statuts (colonne `statut`) — 8 inchangés sur 20

| Statut | bg / texte après |
|---|---|
| NEW | #F7DC6F / #6B5504 gras |
| STAGING, ATT TECH, ATT PARTE, ATT 5 COM, ATT CLIENT, **ATT GC** | #F8B5C8 / #943126 gras (texte seul corrigé) |
| A SUIVRE | #FAD7A0 / #874D0B gras |
| A PLANIFIER | #A3E4D7 / #0E6251 gras |
| ANNULEE | #E6B0AA / #78281F gras |
| CLOTUREE | #D5D8DC / #4D5656 |
| TECHNIQUE | #E9C46A / #6E4A08 gras |
| Inchangés | ATT PV, EN COLLECTE, STAND BY, INSTALLATION, A DISTANCE, OPER, PORTA, PV |

### Partenaires (6 figés ; 35 pastels automatiques inchangés)

| Partenaire | bg / texte après |
|---|---|
| EVERLINK | #7DCEA0 / #0E4D28 |
| ENTREPRISE PRO | #A9CCE3 / #1B4F72 |
| OR-TEL | #F7DC6F / #6B5504 |
| HIGHCOM | #C39BD3 / #4A235A (texte seul) |
| VIP TELECOM | #AED6F1 / #1B4F72 (texte seul) |
| WETELGROUP | #FCDAE3 / #943126 (texte seul) |

### Tech (couleurs de texte)

DIRECT `#009ADF` → `#0072A8` ; revendeurs `#229955` → `#196F3D`.

Livraison : migration SQL de données (UPDATE `Choice` par label + remap `Row.formats`) + `seed.ts` + `colors.ts`. Le front ne change pas (couleurs servies par la DB), sauf `HighlightPalette.tsx`.

## Lot 5 — Bug menu déroulant des mois

Cause : `.gc-monthnav__menu` (absolute, ouvre vers le haut) est rogné par `.gc-tabs` qui porte `overflow-x: auto` (qui force le rognage vertical). Correctif : rendu du panneau en **portail React** (`document.body`), `position: fixed` calculée depuis la pilule, fermeture sur clic extérieur/scroll/resize — pattern existant de `RowContextMenu`. La barre garde son défilement horizontal.

## Contraintes transverses

- Migrations idempotentes (bases déjà déployées) ; seed = état initial seulement, la DB reste source de vérité.
- Tests e2e mis à jour (compteurs seed : 17 colonnes, 20 statuts) + nouveau test « zéro en-tête non mappé sur AOUT 2026 ».
- Build + tests verts avant push. Commits conventionnels FR sur `develop`.
