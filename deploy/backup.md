# Sauvegarde et restauration — suivi des commandes

Une seule chose est irremplaçable sur ce serveur : la base PostgreSQL
`suivi_commandes`. Le code se reclone depuis GitHub, les fichiers de
configuration sont dans `deploy/`. Ce document décrit la sauvegarde
quotidienne automatique et la restauration.

## 1. Ce qui est sauvegardé

| Élément | Sauvegardé | Où |
|---|---|---|
| Base `suivi_commandes` (lignes, colonnes, choix, utilisateurs, historique) | oui, chaque nuit | `/var/backups/suivi-commandes/AAAA-MM-JJ.dump` |
| Code de l'application | non (dépôt GitHub) | — |
| `apps/api/.env` (JWT_SECRET, DATABASE_URL) | non | à recopier depuis votre gestionnaire de mots de passe |
| Certificat TLS | non (regénérable par certbot) | — |

Format : `pg_dump --format=custom` (compressé, restaurable table par table).
Rétention : 30 jours glissants, les dumps plus anciens sont supprimés.

> Copiez `apps/api/.env` dans votre gestionnaire de mots de passe le jour de
> l'installation. Sans `JWT_SECRET`, toutes les sessions ouvertes sont invalidées
> à la restauration (les membres devront se reconnecter) ; sans `DATABASE_URL`,
> il faut recréer le mot de passe PostgreSQL.

## 2. Installation de la sauvegarde automatique

### 2.1 Fichier de mot de passe PostgreSQL

Le script ne prend jamais le mot de passe en argument. Il lit un fichier
`.pgpass` :

```bash
sudo install -d -m 700 /etc/suivi-commandes
sudo tee /etc/suivi-commandes/pgpass >/dev/null <<'EOF'
127.0.0.1:5432:suivi_commandes:suivi:LE_MOT_DE_PASSE_POSTGRES
EOF
sudo chmod 600 /etc/suivi-commandes/pgpass
```

Remplacer `LE_MOT_DE_PASSE_POSTGRES` par le mot de passe choisi à
l'installation (celui présent dans `DATABASE_URL` de `apps/api/.env`).

### 2.2 Dossier de sauvegarde

```bash
sudo install -d -m 700 /var/backups/suivi-commandes
```

### 2.3 Premier lancement manuel

```bash
sudo /home/suivi/suivi-commandes/deploy/backup.sh
```

Attendu : une ligne
`2026-08-11 10:12:03 — sauvegarde terminée : /var/backups/suivi-commandes/2026-08-11.dump (1,2M)`
et le fichier présent :

```bash
sudo ls -lh /var/backups/suivi-commandes/
```

### 2.4 Tâche cron quotidienne (3 h 00)

```bash
sudo crontab -e
```

Ajouter la ligne :

```cron
0 3 * * * /home/suivi/suivi-commandes/deploy/backup.sh >> /var/log/suivi-commandes-backup.log 2>&1
```

Vérifier l'enregistrement :

```bash
sudo crontab -l | grep backup.sh
```

Le lendemain matin, contrôler :

```bash
sudo tail -n 5 /var/log/suivi-commandes-backup.log
sudo ls -lh /var/backups/suivi-commandes/
```

## 3. Vérifier qu'un dump est exploitable

Un dump jamais relu n'est pas une sauvegarde. Une fois par trimestre :

```bash
# Lister le contenu du dump sans rien restaurer
sudo pg_restore --list /var/backups/suivi-commandes/2026-08-11.dump | head -n 30
```

Attendu : la liste des tables `User`, `Column`, `Choice`, `Row`, `RowEvent`.

Restauration à blanc dans une base jetable :

```bash
sudo -u postgres createdb suivi_commandes_test
sudo -u postgres pg_restore --no-owner --dbname=suivi_commandes_test \
  /var/backups/suivi-commandes/2026-08-11.dump
sudo -u postgres psql -d suivi_commandes_test -c 'SELECT count(*) FROM "Row";'
sudo -u postgres dropdb suivi_commandes_test
```

Attendu : `pg_restore` sans erreur, et un compte de lignes cohérent avec
l'application.

## 4. Restauration réelle (perte de données)

⚠️ Cette procédure **écrase** les données actuelles. À ne lancer qu'en
connaissance de cause.

```bash
# 1. Arrêter l'application pour qu'aucune écriture ne parte en base
pm2 stop suivi-api suivi-web

# 2. Restaurer par-dessus la base existante
sudo -u postgres pg_restore \
  --clean --if-exists --no-owner --no-privileges \
  --dbname=suivi_commandes \
  /var/backups/suivi-commandes/AAAA-MM-JJ.dump

# 3. Redémarrer
pm2 start suivi-api suivi-web
pm2 status
```

Puis vérifier dans le navigateur qu'un mois connu affiche bien ses lignes,
et côté serveur :

```bash
curl -s https://suivi.exemple.fr/api/health
```

Attendu : `{"status":"ok"}`.

## 5. Copie hors du serveur (recommandé)

Les dumps vivent sur le même disque que la base : une panne de disque les
emporte tous les deux. Depuis un poste de travail allumé quotidiennement :

```bash
rsync -avz --delete \
  suivi@suivi.exemple.fr:/var/backups/suivi-commandes/ \
  ~/sauvegardes/suivi-commandes/
```

(L'utilisateur `suivi` doit pouvoir lire `/var/backups/suivi-commandes` :
`sudo chown -R suivi:suivi /var/backups/suivi-commandes`.)
