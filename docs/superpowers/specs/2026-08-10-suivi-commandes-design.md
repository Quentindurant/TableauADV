# Spec — Application de suivi des commandes

Date : 2026-08-10
Statut : validé en brainstorming, en attente de relecture finale

## 1. Contexte et objectif

L'équipe suit ses commandes/installations télécom dans un classeur Zoho Sheet
(« TABLEAU SUIVI COMMANDES 2026 ») : une feuille par mois, une ligne par
commande, listes déroulantes et couleurs par statut/partenaire/technicien.

Objectif : remplacer ce classeur par une application web auto-hébergée,
fidèle visuellement (mêmes colonnes, mêmes couleurs), entièrement
paramétrable depuis l'interface (colonnes, listes, couleurs), multi-utilisateurs
avec co-édition en temps réel.

Décisions actées avec l'utilisateur :

| Sujet | Décision |
|---|---|
| Comptes | Login simple par membre (email + mot de passe), pas de rôles |
| Organisation | Table unique en base, vues par mois + vue Archives + recherche globale |
| Paramétrage | Listes, couleurs **et** colonnes (ajout/renommage/type/ordre/masquage) |
| Données | Import complet du classeur (17 feuilles mensuelles + archives) |
| Édition | Grille type tableur (édition dans la cellule, clavier) |
| Synchro | Co-édition complète : présence, verrous de cellule, diffusion instantanée |
| Déploiement | VPS, Apache2 en reverse proxy, sous-domaine dédié + HTTPS |
| Stack | Next.js (front) + NestJS (API + WebSocket) + Prisma + PostgreSQL |

## 2. L'existant (analysé depuis le fichier)

### 2.1 Colonnes (feuille active « AOUT 2026 », lignes 2-201)

| # | Clé proposée | Libellé Excel | Type |
|---|---|---|---|
| A | impe | IMPE | date |
| B | client | CLIENT | texte |
| C | dpt | DPT | texte |
| D | cp_client | CP CLIENT | texte |
| E | partenaire | PARTE | liste |
| F | date | DATE | date |
| G | porta_commentaires | PORTA ET COMMENTAIRES IMPORTANT | texte long |
| H | heure | HEURE | texte |
| I | tech | TECH | liste |
| J | nom_tech | NOM TECH | texte |
| K | nom_cp | NOM CP | liste |
| L | statut | INSTALLATION | liste |
| M | commentaires_planif | COMMENTAIRES PLANIF | texte long |
| N | materiel_recu | MATERIEL RECU | liste |
| O | num_chrono | N° CHRONO | texte |
| P | infos_facturation | INFOS FACTURATION | texte |

Notes : DPT et CP CLIENT restent en texte (codes, pas des nombres : « 2A »,
zéros initiaux). Les largeurs de colonnes sont reprises du fichier à l'import.

### 2.2 Listes déroulantes (validations Excel)

- **statut** (L) : NEW, STAGING, A SUIVRE, ATT TECH, ATT PARTE, ATT PV,
  ATT 5 COM, ATT CLIENT, EN COLLECTE, STAND BY, A PLANIFIER, INSTALLATION,
  A DISTANCE, ANNULEE, CLOTUREE
- **nom_cp** (K) : LAURENT, PIERRE, GEOFFROY, QUENTIN, KORANTIN, ADRIEN,
  MARCO, ADV, AURELIEN, DYLAN
- **materiel_recu** (N) : ENVOYE, LIVRE, POINT RELAIS
- **tech** (I) : DIRECT, ADWEB, DELTINFO, SOSINFO, NETWORK, KRYCIA, OCCITECH,
  SPOTER, LAMIE, VOSGES INFO, PSITEK, TOULINFO, IMPECPRO, AUTRE
- **partenaire** (E) : OR-TEL, ENTREPRISE PRO, CUBE, VIP TELECOM,
  ESPACE BUREAUTIQUE, IT ADEPT, WETELGROUP, HIGHCOM, 2A Consulting, ALLIPCOM,
  BUREAUTIK SERVICES, MABUROTIC, CG CONEKT, LEA NUMERIQUE, COM2S, DBTELECOM,
  ECS, GOOD MORNING OFFICE, GROUPE TCV, KOTEL, I PLANETHI, DJEFFREY,
  LDS SOLUTIONS, MIKADO SOLUTIONS, MY OBS, ODH SOLUTIONS, OMNITEL, PRO FIBRE,
  RESEAU LINE, SNS SOLUTIONS, SQUARTIS, TELPRO, ODS, TOPLINIE, UNITED TELECOM,
  YOWIGO, VD COM, REVOLY, FR TELECOM, EVERLINK, HOIST GROUP

À l'import, les valeurs sont normalisées (trim des espaces parasites :
« ATT CLIENT  » → « ATT CLIENT », « 14H » / « 14h » restent du texte libre).

### 2.3 Couleurs (formats conditionnels Excel, résolues en hex)

Statuts :

| Statut | Fond | Texte | Gras |
|---|---|---|---|
| NEW | #FFFF00 | #FF0000 | oui |
| STAGING | #F8B5C8 | #E64219 | oui |
| A SUIVRE | #FFA600 | #FF0000 | oui |
| ATT TECH / ATT PARTE / ATT 5 COM / ATT CLIENT | #F8B5C8 | #E64219 | oui |
| ATT PV | #744388 | #FFFFFF | oui |
| EN COLLECTE | #F9E79F | #786208 | non |
| STAND BY | #85C1E9 | #002060 | oui |
| A PLANIFIER | #13ED0C | #FF0000 | oui |
| INSTALLATION | #9BDEB4 | #176638 | oui |
| A DISTANCE | (neutre) | (neutre) | non |
| ANNULEE | #FF0000 | #000000 | oui |
| CLOTUREE | #A6A6A6 | #ABEBC6 | non |

Partenaires : **chaque partenaire a sa couleur**. Six couleurs proviennent
du fichier : EVERLINK fond #229955, HIGHCOM fond #C39BD3, ENTREPRISE PRO
fond #2772A4, OR-TEL fond #F1C40F, VIP TELECOM fond #AED6F1, WETELGROUP
fond #FCDAE3. Les 35 autres partenaires (neutres dans l'Excel) reçoivent à
l'import une couleur distincte auto-attribuée depuis une palette pastel
lisible (texte foncé assorti), modifiable ensuite dans les Paramètres.

Tech : DIRECT texte #009ADF gras sur fond blanc ; autres revendeurs
(ADWEB, DELTINFO, SOSINFO, OCCITECH, PSITEK, TOULINFO, VOSGES INFO, LAMIE)
texte #229955 gras sur fond blanc.

Toutes ces couleurs sont des **données initiales**, modifiables ensuite dans
les Paramètres. Les chevauchements de règles Excel (ex. « ATT PV » matchait
deux règles) sont tranchés ici par une couleur exacte par valeur.

Surlignages manuels observés (indépendants du statut) : rouge #FF0000 et
jaune #FFFF00 posés à la main sur des cellules (colonnes A, N, O surtout).
Repris tels quels à l'import dans `rows.formats`.

## 3. Architecture

```
Navigateur ── HTTPS ── Apache (suivi.<domaine>.fr)
                        ├── /            → Next.js  :3000  (interface)
                        ├── /api         → NestJS   :3001  (REST)
                        └── /socket.io   → NestJS   :3001  (WebSocket)
                                              │
                                          PostgreSQL (via Prisma)
```

- Monorepo pnpm : `apps/web` (Next.js App Router, TypeScript),
  `apps/api` (NestJS, TypeScript), `packages/shared` (types partagés,
  schémas de validation zod).
- Deux process PM2. Apache : `ProxyPass` + `mod_proxy_wstunnel`, certbot.
- Un seul environnement (production). Dev en local.

## 4. Modèle de données (Prisma)

```prisma
model User {
  id           String   @id @default(cuid())
  email        String   @unique
  passwordHash String
  displayName  String
  cursorColor  String   // hex, pour la présence
  createdAt    DateTime @default(now())
}

model Column {
  id        String     @id @default(cuid())
  key       String     @unique // "client", "statut", ...
  label     String
  type      ColumnType // TEXT | LONGTEXT | DATE | TIME | NUMBER | SELECT | LINK
  position  Int
  width     Int        // px
  visible   Boolean    @default(true)
  choices   Choice[]
}

model Choice {
  id        String  @id @default(cuid())
  columnId  String
  column    Column  @relation(...)
  label     String
  bgColor   String? // hex
  textColor String? // hex
  bold      Boolean @default(false)
  position  Int
  archived  Boolean @default(false)
  @@unique([columnId, label])
}

model Row {
  id        String   @id @default(cuid())
  month     String   // "2026-08" — l'équivalent de l'onglet
  position  Int      // ordre manuel dans le mois
  data      Json     // { "client": "ARCADIA", "statut": "ATT CLIENT", ... }
  formats   Json     // { "num_chrono": { "bg": "#FF0000" } } surlignages manuels
  version   Int      @default(0)
  archived  Boolean  @default(false)
  createdBy String?
  updatedAt DateTime @updatedAt
}

model RowEvent {
  id       String   @id @default(cuid())
  rowId    String
  userId   String
  at       DateTime @default(now())
  type     String   // create | update | delete | move | archive | format
  payload  Json     // { colKey: { from, to } } ou snapshot
}
```

Choix assumés :

- Valeurs en JSONB (`Row.data`) car les colonnes sont dynamiques. Les valeurs
  de listes sont stockées par **libellé** (pas par id) : lisible, robuste à
  l'archivage d'un choix ; le renommage d'un choix déclenche une mise à jour
  en masse des lignes concernées (dans une transaction).
- Une ligne appartient à un mois explicitement (`month`), comme les onglets
  actuels — la date d'intervention peut différer du mois de rattachement
  (constaté dans les données).
- `version` incrémentée à chaque écriture ; sert au refus propre des
  écritures croisées (section 6).
- `RowEvent` : traçabilité (« qui a modifié quoi »), affichée dans un panneau
  historique de ligne. Pas de fonction « annuler » en v1.

## 5. API REST (NestJS)

Toutes les routes sous `/api`, cookie JWT httpOnly obligatoire sauf login.

- `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`
- `GET /rows?month=2026-08` · `GET /rows?archived=true` ·
  `GET /rows/search?q=...` (recherche plein texte sur `data`, tous mois)
- `POST /rows` (création, avec mois + position)
- `PATCH /rows/:id` — corps : `{ expectedVersion, patch: {colKey: value},
  formats?: {...} }`. Fusion par clé côté serveur (section 6).
- `POST /rows/:id/move` (changement de mois ou de position),
  `POST /rows/:id/archive`, `DELETE /rows/:id`
- `GET /rows/:id/events` (historique)
- `GET /columns` · `POST /columns` · `PATCH /columns/:id` ·
  `DELETE /columns/:id` (refusée si des lignes ont une valeur pour cette
  colonne, sauf confirmation explicite `?force=true`)
- `GET/POST/PATCH/DELETE /columns/:id/choices`
- `GET /users` · `POST /users` (ajout d'un membre) · `PATCH /users/me`
- `GET /months` (liste des mois existants + compteurs)

Validation : schémas zod partagés (`packages/shared`), typage des valeurs
selon `Column.type`. Erreurs en JSON `{ code, message }`, messages en français.

## 6. Temps réel (Socket.IO)

Authentification du socket par le même cookie JWT. Une room par vue :
`month:2026-08`, `archives`.

Événements serveur → clients :

| Événement | Contenu |
|---|---|
| `presence` | liste des connectés de la room (id, nom, couleur) |
| `cell.focus` | userId + rowId + colKey (cellule pointée par un collègue) |
| `cell.lock` / `cell.unlock` | rowId + colKey + userId |
| `row.created` / `row.updated` / `row.deleted` / `row.moved` | ligne complète ou patch + nouvelle version |
| `config.changed` | colonnes / choix / couleurs modifiés (rechargement de la config) |

Client → serveur : `cell.focus`, `cell.lock.request`, `cell.lock.release`.

Règles :

- **Verrou** : accordé si la cellule est libre ; refusé sinon (le client
  affiche la cellule verrouillée avec la couleur du détenteur). Détenu en
  mémoire du process API avec TTL de 30 s renouvelé pendant la frappe ;
  libéré à la validation, à l'annulation ou à la déconnexion.
- **Écritures** : toutes les mutations passent par REST. Après commit en
  base, l'API émet l'événement correspondant dans la room. Fusion par clé :
  deux `PATCH` concurrents sur des colonnes différentes de la même ligne
  réussissent tous les deux (le serveur applique `patch` clé par clé sur le
  JSONB et incrémente `version`).
- **Conflit résiduel** : `PATCH` dont `expectedVersion` est dépassée **et**
  qui touche une clé modifiée entre-temps → HTTP 409 avec la valeur à jour ;
  le client annule l'optimisme, affiche « Modifié par X entre-temps » et la
  nouvelle valeur.
- Un seul process API : l'état verrous/présence en mémoire suffit
  (pas de Redis).

## 7. Interface (Next.js)

Pages : `/login`, `/` (grille du mois courant), `/archives`, `/parametres`,
`/recherche?q=`.

### Grille

- AG Grid Community (MIT) : édition inline, navigation clavier (flèches,
  Tab, Entrée, F2), redimensionnement/réordonnancement des colonnes à la
  souris (persisté dans `Column`), copier-coller de cellules.
- Colonnes générées dynamiquement depuis `GET /columns`. En-têtes gras,
  mêmes libellés et ordre que le classeur.
- Cellule de type liste : éditeur menu déroulant avec pastilles colorées ;
  la cellule rend fond/texte/gras du choix sélectionné.
- Cellule date : datepicker ; format affiché `JJ/MM/AAAA`.
- Surlignage manuel : clic droit → palette (rouge, jaune, vert, bleu, violet,
  effacer) → écrit `formats` de la ligne.
- Lignes : bouton « + Ajouter une ligne » (en bas), insertion via clic droit,
  drag de la poignée de ligne pour réordonner, menu ligne : déplacer vers un
  autre mois, archiver, supprimer (confirmation), historique.
- Onglets de mois en bas de la grille (façon tableur) : mois existants +
  « + » pour créer le mois suivant. Vue Archives accessible à côté.
- Recherche globale dans la barre du haut (tous mois + archives).
- Barre du haut : logo/titre, recherche, avatars des connectés, menu compte.

### Co-édition visible

- Bordure de cellule à la couleur du collègue + étiquette nom au survol.
- Cellule verrouillée par un autre : hachure légère + curseur interdit.
- Modifs optimistes : la valeur saisie s'affiche immédiatement ; rollback +
  toast en cas de 409 ou d'erreur réseau.

### Paramètres (`/parametres`)

- **Colonnes** : liste triable (drag), ajout, renommage, type, visible/masquée,
  suppression (avec garde-fou), largeur.
- **Listes & couleurs** : par colonne de type liste — valeurs triables,
  ajout/renommage, color picker fond + texte + gras, archivage d'une valeur
  (les anciennes lignes la gardent, elle ne se propose plus).
- **Équipe** : ajout d'un membre (email, nom, mot de passe initial,
  couleur de curseur), modification de son propre profil.
- Tout changement émet `config.changed` → les grilles ouvertes se mettent
  à jour sans rechargement.

## 8. Import initial

Commande CLI côté API : `pnpm import:xlsx <fichier>`.

1. Réparation du XML Zoho (opérateurs de format conditionnel non standard —
   script déjà écrit pendant l'analyse) puis lecture du classeur.
2. Création des 16 colonnes avec libellés, ordre, largeurs du fichier.
3. Création des choix de listes avec les couleurs de la section 2.3 ;
   partenaires sans couleur Excel → attribution automatique depuis la
   palette pastel (déterministe : même partenaire, même couleur à chaque
   rejeu).
4. Feuilles mensuelles `MARS 2025` → `AOUT 2026` : chaque ligne non vide
   devient une `Row` du mois correspondant (mapping nom de feuille → YYYY-MM),
   ordre préservé. Feuilles `TEST` et `Feuille1` ignorées.
5. `ARCHIVES OK` : lignes importées avec `archived=true` (mois déduit de la
   date si présente, sinon mois d'import). Attention : cette feuille a des
   colonnes décalées/hétérogènes — mapping par en-tête, valeurs non mappables
   déposées dans `commentaires_planif` pour ne rien perdre.
6. Valeurs : dates Excel → ISO ; nombres flottants parasites (« 78.0 ») →
   texte propre (« 78 ») ; trim des espaces ; valeurs de listes hors liste
   (ex. fautes de frappe) importées telles quelles et signalées dans le
   rapport d'import.
7. Surlignages manuels rouge/jaune → `formats`.
8. Rapport final : compteurs par feuille, anomalies. Rejouable : l'import
   purge et recharge (uniquement avant mise en service).

## 9. Déploiement (VPS Debian, Apache2)

- Node 22 LTS, PostgreSQL 16, pnpm, PM2 (`web` :3000, `api` :3001,
  redémarrage auto, logs).
- VHost Apache fourni : redirection 80→443, certbot, `ProxyPass /api` et
  `/socket.io` (avec `upgrade=websocket`) vers :3001, `ProxyPass /` vers
  :3000.
- `.env` : `DATABASE_URL`, `JWT_SECRET`, `APP_URL`.
- Sauvegarde : cron `pg_dump` quotidien, rotation 30 jours, dossier
  `/var/backups/suivi-commandes/`.
- Livrables : `deploy/apache-vhost.conf`, `deploy/ecosystem.config.js`,
  `deploy/install.md` (pas de script magique — étapes documentées).

## 10. Gestion des erreurs

- API : validation zod à l'entrée, erreurs typées `{ code, message }` en
  français, 401 (non connecté), 403 (jamais en v1 — pas de rôles), 404,
  409 (conflit de version), 422 (validation).
- Front : toasts d'erreur, bandeau « connexion perdue » si le socket tombe
  (reconnexion auto Socket.IO + resynchronisation complète de la room au
  retour), rollback des modifs optimistes refusées.
- Verrous orphelins : TTL 30 s + libération à la déconnexion du socket.

## 11. Méthodologie de développement

- **Gitflow** : branches `main` (stable) et `develop` (intégration).
  Chaque fonctionnalité = branche `feature/<nom>` depuis `develop`,
  mergée dans `develop` et poussée sur GitHub à la fin de la
  fonctionnalité. Mise en production = merge `develop` → `main` (tag).
- **Tests à chaque fonctionnalité** : chaque feature NestJS embarque ses
  tests (unitaires + e2e ciblés) et la gestion de ses cas d'erreur avant
  merge. Pas de merge dans `develop` avec des tests rouges.

## 12. Tests

- **Unitaires (API)** : fusion par clé des PATCH concurrents, incrément de
  version + détection 409, machine à verrous (acquisition, refus, TTL,
  libération), normalisations d'import.
- **e2e API (supertest)** : auth, CRUD lignes/colonnes/choix, scénario
  conflit.
- **e2e front (Playwright)** : login → édition cellule → valeur persistée ;
  deux contextes navigateur → présence + verrou + diffusion visibles.
- Import : test sur le vrai fichier (compte de lignes par feuille attendu).

## 13. Hors périmètre v1 (YAGNI)

- Rôles/permissions fines, undo/redo, export Excel, notifications
  (email/push), application mobile, statistiques/dashboards, multi-tableaux.
- Le journal `RowEvent` et le paramétrage des colonnes posent les bases pour
  la plupart de ces évolutions.
