#!/usr/bin/env bash
# =====================================================================
# Sauvegarde quotidienne de la base « suivi_commandes ».
#
# Produit /var/backups/suivi-commandes/AAAA-MM-JJ.dump au format custom
# pg_dump (-Fc) : compressé, restaurable table par table avec pg_restore.
# Les dumps de plus de 30 jours sont supprimés.
#
# Installation et restauration : voir deploy/backup.md
# =====================================================================
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/var/backups/suivi-commandes}"
DB_NAME="${DB_NAME:-suivi_commandes}"
DB_USER="${DB_USER:-suivi}"
DB_HOST="${DB_HOST:-127.0.0.1}"
DB_PORT="${DB_PORT:-5432}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"

# Mot de passe lu dans un fichier .pgpass (jamais sur la ligne de commande,
# jamais dans ce fichier versionné). Format d'une ligne :
#   127.0.0.1:5432:suivi_commandes:suivi:<mot_de_passe>
export PGPASSFILE="${PGPASSFILE:-/etc/suivi-commandes/pgpass}"

if [ ! -r "$PGPASSFILE" ]; then
  printf 'Fichier de mot de passe illisible : %s\n' "$PGPASSFILE" >&2
  printf 'Créez-le (chmod 600) — voir deploy/backup.md.\n' >&2
  exit 1
fi

stamp="$(date +%F)"                 # AAAA-MM-JJ
target="$BACKUP_DIR/$stamp.dump"

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
umask 077

# Écriture dans un fichier temporaire puis renommage : un dump interrompu
# ne laisse jamais un « .dump » incomplet qui passerait pour valide.
pg_dump \
  --format=custom \
  --compress=9 \
  --no-owner \
  --no-privileges \
  --host="$DB_HOST" \
  --port="$DB_PORT" \
  --username="$DB_USER" \
  --dbname="$DB_NAME" \
  --file="$target.partiel"

mv -f "$target.partiel" "$target"

# Rotation : suppression des dumps de plus de RETENTION_DAYS jours.
find "$BACKUP_DIR" -maxdepth 1 -type f -name '*.dump' -mtime "+$RETENTION_DAYS" -delete

size="$(du -h "$target" | cut -f1)"
printf '%s — sauvegarde terminée : %s (%s)\n' "$(date '+%F %T')" "$target" "$size"
