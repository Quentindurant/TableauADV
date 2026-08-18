# Installation en production — suivi des commandes

Cible : VPS **Debian 13 (trixie)**, accès `sudo`, sous-domaine dédié
(exemple : `suivi.exemple.fr`) dont l'enregistrement DNS **A** pointe déjà
sur l'adresse IP du VPS.

Résultat attendu à la fin : `https://suivi.exemple.fr` affiche la page de
connexion, l'API répond sur `/api`, la co-édition temps réel fonctionne, les
deux process redémarrent tout seuls après un reboot, et la base est
sauvegardée chaque nuit.

Durée : environ 45 minutes. Toutes les commandes sont à exécuter dans l'ordre.

Conventions de ce document :

| Marqueur | À remplacer par |
|---|---|
| `suivi.exemple.fr` | votre sous-domaine réel |
| `MOT_DE_PASSE_PG` | un mot de passe fort généré (voir étape 3.2) |
| `LE_SECRET_GENERE_PAR_OPENSSL` | le secret JWT généré à l'étape 5.1 |
| `<compte>/<depot>` | le chemin GitHub réel du dépôt |

---

## 1. Mise à jour du système et paquets de base

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl ca-certificates gnupg git build-essential \
  apache2 openssl shellcheck
```

Vérification :

```bash
apache2 -v
```

Attendu : `Server version: Apache/2.4.x`.

## 2. Node.js 22 LTS (dépôt NodeSource) et pnpm

Debian ne fournit pas Node 22. On utilise le dépôt officiel NodeSource :

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
```

Vérification :

```bash
node --version
```

Attendu : `v22.x.x`.

pnpm est fourni par corepack (livré avec Node) :

```bash
sudo corepack enable
sudo corepack prepare pnpm@10.34.5 --activate
pnpm --version
```

Attendu : `10.34.5` (la version doit correspondre au champ `packageManager`
du `package.json` racine — vérifier avec `grep packageManager package.json`
si le dépôt a évolué depuis la rédaction de ce document).

## 3. PostgreSQL 16

### 3.1 Installation depuis le dépôt PGDG

Le paquet `postgresql` de Debian 13 n'est pas en version 16 ; on installe donc
depuis le dépôt officiel PostgreSQL :

```bash
sudo install -d /usr/share/postgresql-common/pgdg
sudo curl -fsSL -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc \
  https://www.postgresql.org/media/keys/ACCC4CF8.asc
. /etc/os-release
echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt ${VERSION_CODENAME}-pgdg main" \
  | sudo tee /etc/apt/sources.list.d/pgdg.list
sudo apt update
sudo apt install -y postgresql-16
```

> Si `apt update` signale que `trixie-pgdg` n'existe pas encore, remplacer
> `${VERSION_CODENAME}` par `bookworm` dans le fichier `pgdg.list` (dépôt
> compatible) et relancer `sudo apt update`. À défaut, la version de
> PostgreSQL fournie nativement par Debian 13 convient aussi : le schéma
> Prisma de ce projet est compatible PostgreSQL 16 comme 17.

Vérification :

```bash
psql --version
sudo systemctl is-active postgresql
```

Attendu : `psql (PostgreSQL) 16.x` (ou 17.x selon le paquet réellement
installé) et `active`.

### 3.2 Utilisateur et base

Générer un mot de passe et le **conserver** (gestionnaire de mots de passe) :

```bash
openssl rand -base64 24
```

Créer le rôle et la base (remplacer `MOT_DE_PASSE_PG` par la valeur générée) :

```bash
sudo -u postgres psql -c "CREATE USER suivi WITH PASSWORD 'MOT_DE_PASSE_PG';"
sudo -u postgres psql -c "CREATE DATABASE suivi_commandes OWNER suivi;"
```

Vérification de la connexion :

```bash
PGPASSWORD='MOT_DE_PASSE_PG' psql -h 127.0.0.1 -U suivi -d suivi_commandes -c '\conninfo'
```

Attendu : `You are connected to database "suivi_commandes" as user "suivi"…`.

La chaîne de connexion à utiliser plus bas est donc :

```
DATABASE_URL=postgresql://suivi:MOT_DE_PASSE_PG@127.0.0.1:5432/suivi_commandes?schema=public
```

> Si le mot de passe contient `@`, `:`, `/` ou `?`, il doit être encodé URL
> dans `DATABASE_URL`. Le plus simple est de régénérer un mot de passe
> alphanumérique : `openssl rand -hex 24`.

## 4. Utilisateur système et code source

L'application ne tourne pas en root :

```bash
sudo adduser --disabled-password --gecos "" suivi
sudo -iu suivi
```

Toutes les commandes des sections 4 à 7 s'exécutent **en tant que `suivi`**
(l'invite affiche `suivi@…$`).

```bash
git clone https://github.com/<compte>/<depot>.git ~/suivi-commandes
cd ~/suivi-commandes
git checkout main
pnpm install --frozen-lockfile
```

Attendu : `Done in …s`, aucun `ERR_PNPM_OUTDATED_LOCKFILE`.

## 5. Fichiers d'environnement

### 5.1 API

Générer le secret JWT :

```bash
openssl rand -base64 32
```

Créer `~/suivi-commandes/apps/api/.env` (remplacer les deux valeurs) :

```bash
cat > ~/suivi-commandes/apps/api/.env <<'EOF'
DATABASE_URL=postgresql://suivi:MOT_DE_PASSE_PG@127.0.0.1:5432/suivi_commandes?schema=public
JWT_SECRET=LE_SECRET_GENERE_PAR_OPENSSL
APP_URL=https://suivi.exemple.fr
PORT=3001
EOF
chmod 600 ~/suivi-commandes/apps/api/.env
```

### 5.2 Web

En production, le navigateur appelle l'API sur la **même origine**
(`https://suivi.exemple.fr/api`) : `NEXT_PUBLIC_API_URL` reste donc vide. En
revanche les Server Components (layout `(app)`, vérification de session) appellent
l'API depuis le serveur et exigent une **URL absolue** : c'est le rôle de
`API_INTERNAL_URL`, qui doit pointer vers le port local de l'API.

```bash
cat > ~/suivi-commandes/apps/web/.env <<'EOF'
NEXT_PUBLIC_API_URL=
API_INTERNAL_URL=http://127.0.0.1:3101
EOF
```

Vérification :

```bash
ls -l ~/suivi-commandes/apps/api/.env ~/suivi-commandes/apps/web/.env
```

Attendu : les deux fichiers existent, `.env` de l'API en `-rw-------`.

> Ces deux fichiers ne sont **pas** versionnés (`.gitignore`). Recopiez-les
> dans votre gestionnaire de mots de passe : ils ne sont pas dans les
> sauvegardes de base (voir `deploy/backup.md`).

## 6. Base de données : migrations, seed, import du classeur

```bash
cd ~/suivi-commandes
pnpm --filter @suivi/api exec prisma generate
```

Attendu : `✔ Generated Prisma Client`. Indispensable ici : pnpm 10 ignore par
défaut les scripts `postinstall` (voir étape 4 et `pnpm-workspace.yaml`,
`onlyBuiltDependencies`), donc rien ne garantit que le client Prisma existe
déjà à ce stade ; sans lui, `prisma db seed` échoue et le build de l'étape 7
échoue aussi (erreurs `Property 'user' does not exist on type
'PrismaService'`).

```bash
pnpm --filter @suivi/api exec prisma migrate deploy
```

Attendu : `All migrations have been successfully applied.`
(`migrate deploy` est la commande de production : elle applique les migrations
existantes et n'en génère jamais de nouvelle, contrairement à `migrate dev`.)

Données de départ (colonnes, listes, couleurs, premier compte) :

```bash
pnpm --filter @suivi/api exec prisma db seed
```

Attendu : `Seed terminé : 16 colonnes, 83 choix, 1 utilisateur.` Le compte
créé est fixe (email `quentin.durant49@orange.fr`, mot de passe `changeme`) :
connectez-vous avec ces identifiants puis changez immédiatement le mot de
passe depuis Paramètres > Équipe (`PATCH /users/me`).

Import du classeur Zoho (transférer d'abord le fichier `.xlsx` sur le VPS,
par exemple avec `scp` depuis votre poste) :

```bash
pnpm --filter @suivi/api run import:xlsx "/home/suivi/TABLEAU SUIVI COMMANDES 2026.xlsx"
```

Attendu : le rapport d'import (compteurs par feuille, anomalies signalées).

> L'import **purge et recharge** les lignes : il ne doit être joué qu'avant la
> mise en service, jamais sur une base déjà utilisée par l'équipe.

Contrôle rapide :

```bash
PGPASSWORD='MOT_DE_PASSE_PG' psql -h 127.0.0.1 -U suivi -d suivi_commandes \
  -c 'SELECT month, count(*) FROM "Row" GROUP BY month ORDER BY month;'
```

Attendu : une ligne par mois importé, avec des compteurs non nuls.

## 7. Build de production des deux applications

```bash
cd ~/suivi-commandes
pnpm --filter @suivi/api build
NODE_ENV=production pnpm --filter @suivi/web build
```

Attendu : deux sorties en code 0, `apps/api/dist/main.js` et `apps/web/.next/`
présents :

```bash
ls -l apps/api/dist/main.js && ls -d apps/web/.next
```

## 8. PM2 (démarrage et redémarrage automatique)

Revenir en utilisateur `sudo` uniquement pour l'installation globale :

```bash
exit                      # quitte la session « suivi »
sudo npm install -g pm2
sudo install -d -o suivi -g suivi /var/log/pm2
sudo -iu suivi
```

Démarrer les deux process (depuis la racine du dépôt : les `cwd` du fichier
ecosystem sont relatifs) :

```bash
cd ~/suivi-commandes
pm2 start deploy/ecosystem.config.js
pm2 status
```

Attendu : deux lignes `suivi-api` et `suivi-web` en statut `online`.

Vérification locale, avant même Apache :

```bash
curl -s http://127.0.0.1:3101/api/health
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3100/
```

Attendu : `{"status":"ok"}` puis `200` (ou `307` si la racine redirige vers
`/login` — les deux sont acceptables).

Persister la liste et l'installer au démarrage du serveur :

```bash
pm2 save
pm2 startup systemd
```

`pm2 startup` **affiche** une commande `sudo env PATH=… pm2 startup systemd -u suivi --hp /home/suivi`.
Sortir de la session `suivi` (`exit`) et coller cette commande telle quelle,
puis vérifier :

```bash
sudo systemctl is-enabled pm2-suivi
```

Attendu : `enabled`.

En cas de doute, tester réellement : `sudo reboot`, puis après reconnexion
`sudo -iu suivi pm2 status` doit afficher les deux process `online`.

## 9. Apache : modules, VirtualHost, HTTPS

### 9.1 Modules

```bash
sudo a2enmod proxy proxy_http proxy_wstunnel rewrite ssl headers
sudo systemctl restart apache2
```

Vérification :

```bash
apache2ctl -M | grep -E 'proxy_http|proxy_wstunnel|rewrite|ssl|headers'
```

Attendu : les cinq modules listés (`proxy_http_module`,
`proxy_wstunnel_module`, `rewrite_module`, `ssl_module`, `headers_module`).

### 9.2 VirtualHost

```bash
sudo cp /home/suivi/suivi-commandes/deploy/apache-vhost.conf \
  /etc/apache2/sites-available/suivi-commandes.conf
sudo sed -i 's/suivi\.exemple\.fr/suivi.exemple.fr/g' \
  /etc/apache2/sites-available/suivi-commandes.conf
```

(Dans la commande `sed`, remplacer la **deuxième** occurrence par votre vrai
sous-domaine.)

```bash
sudo a2ensite suivi-commandes
sudo apachectl configtest
```

Attendu : `Syntax OK`. En cas d'erreur, la corriger avant d'aller plus loin —
à une exception près : une erreur `AH02572` (« Failed to configure at least
one certificate and key ») est normale tant que les lignes
`SSLCertificateFile`/`SSLCertificateKeyFile` restent commentées dans le
VirtualHost `*:443` ; passez alors directement à l'étape 9.3, certbot les
insère puis revalide lui-même la configuration.

```bash
sudo systemctl reload apache2
curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' http://suivi.exemple.fr/
```

Attendu : `301 https://suivi.exemple.fr/`.

### 9.3 Certificat TLS

```bash
sudo apt install -y certbot python3-certbot-apache
sudo certbot --apache -d suivi.exemple.fr
```

Répondre : adresse email d'administration, acceptation des conditions
Let's Encrypt, et **ne pas** demander la redirection automatique (elle est
déjà dans le VirtualHost `*:80`).

Vérifier le renouvellement automatique :

```bash
sudo certbot renew --dry-run
sudo systemctl list-timers | grep certbot
```

Attendu : `Congratulations, all simulated renewals succeeded` et un timer actif.

```bash
sudo apachectl configtest && sudo systemctl reload apache2
```

Vérifier que certbot n'a pas perdu les directives de reverse proxy (WebSocket,
`/api`) en insérant le certificat :

```bash
sudo apachectl -S
grep -E 'ProxyPass|RewriteRule.*socket' /etc/apache2/sites-available/suivi-commandes.conf
```

Attendu : les lignes `ProxyPass /socket.io/ …`, `ProxyPass /api …`,
`ProxyPass / …` et la règle de bascule WebSocket sont toujours présentes.

## 10. Pare-feu (optionnel mais recommandé)

```bash
sudo apt install -y ufw
sudo ufw allow OpenSSH
sudo ufw allow 'Apache Full'
sudo ufw --force enable
sudo ufw status
```

Attendu : seuls 22, 80 et 443 sont ouverts. Les ports 3000 et 3001 ne sont
**jamais** exposés : les process écoutent derrière Apache et le pare-feu.

## 11. Sauvegardes

Suivre `deploy/backup.md` (fichier `.pgpass`, dossier de sauvegarde, premier
dump manuel, ligne crontab de 3 h 00). À faire le jour de l'installation, pas
« plus tard ».

## 12. Vérifications finales

```bash
# API derrière HTTPS
curl -s https://suivi.exemple.fr/api/health

# Interface
curl -s -o /dev/null -w '%{http_code}\n' https://suivi.exemple.fr/

# Négociation WebSocket (Socket.IO en transport polling puis upgrade)
curl -s "https://suivi.exemple.fr/socket.io/?EIO=4&transport=polling" | head -c 120

# Process
sudo -iu suivi pm2 status
```

Attendu :

1. `{"status":"ok"}` ;
2. `200` (ou `307` vers `/login`) ;
3. une réponse commençant par `0{"sid":"…` (poignée de main Socket.IO) — si la
   réponse est du HTML, c'est que `/socket.io` part vers Next.js : revoir
   l'ordre des `ProxyPass` dans le VirtualHost ;
4. `suivi-api` et `suivi-web` en `online`.

Puis, dans un navigateur :

1. ouvrir `https://suivi.exemple.fr` → page de connexion, cadenas valide ;
2. se connecter avec le compte du seed ;
3. ouvrir la même page dans une seconde fenêtre (autre navigateur ou navigation
   privée) avec un second compte → les deux avatars apparaissent dans la barre
   de présence ;
4. modifier une cellule dans une fenêtre → la valeur apparaît immédiatement
   dans l'autre (c'est la preuve que le tunnel WebSocket fonctionne) ;
5. recharger la page → la valeur est persistée.

## 13. Mettre à jour l'application (versions suivantes)

```bash
sudo -iu suivi
cd ~/suivi-commandes
git fetch origin && git checkout main && git pull
pnpm install --frozen-lockfile
pnpm --filter @suivi/api exec prisma generate
pnpm --filter @suivi/api exec prisma migrate deploy
pnpm --filter @suivi/api build
NODE_ENV=production pnpm --filter @suivi/web build
pm2 restart suivi-api suivi-web
pm2 status
curl -s https://suivi.exemple.fr/api/health
```

Avant toute mise à jour touchant la base, lancer une sauvegarde manuelle :

```bash
sudo /home/suivi/suivi-commandes/deploy/backup.sh
```

## 14. Diagnostic

| Symptôme | Où regarder |
|---|---|
| Page blanche / 502 | `sudo -iu suivi pm2 logs suivi-web --lines 50` |
| `/api` en 502 | `sudo -iu suivi pm2 logs suivi-api --lines 50` |
| Temps réel muet, bandeau « connexion perdue » | `sudo tail -f /var/log/apache2/suivi-commandes-error.log` puis vérifier `apache2ctl -M | grep wstunnel` |
| Déconnexion permanente après login | cookie `secure` refusé : vérifier que le site est bien servi en HTTPS et que `RequestHeader set X-Forwarded-Proto "https"` est présent dans le vhost |
| Erreur Prisma au démarrage | `apps/api/.env` absent ou `cwd` PM2 incorrect : `sudo -iu suivi pm2 describe suivi-api` (champ `exec cwd`) |
| Base injoignable | `sudo systemctl status postgresql` puis `sudo tail -n 50 /var/log/postgresql/postgresql-16-main.log` |
