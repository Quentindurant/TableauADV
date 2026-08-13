#!/usr/bin/env bash
# Vérification statique des livrables de déploiement (dossier deploy/).
# Usage : ./deploy/check-deploy.sh [ecosystem|vhost|backup|install|all]
# Sans argument : équivalent à "all".
# Aucun accès réseau, aucun service démarré : uniquement de la lecture de fichiers.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ALL_CHECKS=(ecosystem vhost backup install)
failures=0

ok() {
  printf 'OK   : %s\n' "$1"
}

fail() {
  printf 'ECHEC: %s\n' "$1" >&2
  failures=$((failures + 1))
}

# Le fichier existe.
expect_file() {
  if [ -f "$ROOT/$1" ]; then
    ok "fichier présent : $1"
  else
    fail "fichier manquant : $1"
  fi
}

# Le fichier existe et porte le bit exécutable.
expect_exec() {
  if [ -x "$ROOT/$1" ]; then
    ok "fichier exécutable : $1"
  else
    fail "fichier non exécutable (chmod +x manquant ?) : $1"
  fi
}

# Le fichier contient un motif ERE.
expect_grep() {
  local file="$1"
  local pattern="$2"
  local label="$3"
  if [ -f "$ROOT/$file" ] && grep -Eq -- "$pattern" "$ROOT/$file"; then
    ok "$label"
  else
    fail "$label — motif « $pattern » absent de $file"
  fi
}

check_ecosystem() {
  expect_file "deploy/ecosystem.config.js"
  if node -e '
    const assert = require("assert");
    const cfg = require(process.argv[1] + "/deploy/ecosystem.config.js");
    assert.ok(Array.isArray(cfg.apps), "cfg.apps doit être un tableau");
    assert.strictEqual(cfg.apps.length, 2, "il faut exactement 2 process PM2");
    const api = cfg.apps.find((a) => a.name === "suivi-api");
    const web = cfg.apps.find((a) => a.name === "suivi-web");
    assert.ok(api, "process suivi-api manquant");
    assert.ok(web, "process suivi-web manquant");
    assert.strictEqual(api.cwd, "./apps/api", "suivi-api doit tourner dans apps/api (dotenv y lit .env)");
    assert.strictEqual(api.script, "dist/main.js");
    assert.strictEqual(api.env.NODE_ENV, "production");
    assert.strictEqual(String(api.env.PORT), "3001");
    assert.strictEqual(web.cwd, "./apps/web");
    assert.strictEqual(web.script, "pnpm");
    assert.strictEqual(web.args, "start");
    assert.strictEqual(web.interpreter, "none", "pnpm est un exécutable, pas un script node");
    assert.strictEqual(web.env.NODE_ENV, "production");
    assert.strictEqual(String(web.env.PORT), "3000");
    assert.ok(web.env.API_INTERNAL_URL, "suivi-web doit exposer API_INTERNAL_URL (appels serveur -> API)");
  ' "$ROOT"; then
    ok "ecosystem.config.js : suivi-api (:3001) et suivi-web (:3000) conformes"
  else
    fail "ecosystem.config.js : configuration PM2 non conforme (voir l'erreur node ci-dessus)"
  fi
}

check_vhost() {
  local f="deploy/apache-vhost.conf"
  expect_file "$f"
  expect_grep "$f" '<VirtualHost \*:80>' "vhost : bloc HTTP *:80 présent"
  expect_grep "$f" '<VirtualHost \*:443>' "vhost : bloc HTTPS *:443 présent"
  expect_grep "$f" 'RewriteRule .*https://%\{SERVER_NAME\}.*\[R=301' \
    "vhost : redirection 301 du port 80 vers HTTPS"
  expect_grep "$f" 'acme-challenge' \
    "vhost : le challenge certbot HTTP-01 échappe à la redirection"
  expect_grep "$f" '^[[:space:]]*SSLEngine on' "vhost : SSLEngine activé"
  expect_grep "$f" 'SSLCertificateFile[[:space:]]+/etc/letsencrypt/live/' \
    "vhost : chemin certbot du certificat documenté"
  expect_grep "$f" 'SSLCertificateKeyFile[[:space:]]+/etc/letsencrypt/live/' \
    "vhost : chemin certbot de la clé documenté"
  expect_grep "$f" '^[[:space:]]*ProxyPreserveHost On' "vhost : ProxyPreserveHost On"
  expect_grep "$f" 'RequestHeader set X-Forwarded-Proto "https"' \
    "vhost : en-tête X-Forwarded-Proto transmis à l'API"
  expect_grep "$f" 'RewriteCond %\{HTTP:Upgrade\} =websocket' \
    "vhost : condition de bascule WebSocket"
  expect_grep "$f" 'RewriteRule .*ws://127\.0\.0\.1:3001/socket\.io/.*\[P' \
    "vhost : tunnel WebSocket vers ws://127.0.0.1:3001/socket.io/ (mod_proxy_wstunnel)"
  expect_grep "$f" 'ProxyPass[[:space:]]+/socket\.io/[[:space:]]+http://127\.0\.0\.1:3001/socket\.io/' \
    "vhost : polling HTTP Socket.IO vers :3001"
  expect_grep "$f" 'ProxyPass[[:space:]]+/api[[:space:]]+http://127\.0\.0\.1:3001/api' \
    "vhost : /api vers :3001"
  expect_grep "$f" 'ProxyPass[[:space:]]+/[[:space:]]+http://127\.0\.0\.1:3000/' \
    "vhost : / vers Next.js :3000"
  expect_grep "$f" 'ProxyPassReverse[[:space:]]+/[[:space:]]+http://127\.0\.0\.1:3000/' \
    "vhost : ProxyPassReverse sur la racine"
  expect_grep "$f" 'a2enmod .*proxy_wstunnel' \
    "vhost : commande a2enmod rappelée en commentaire"
}

check_backup() {
  local s="deploy/backup.sh"
  local d="deploy/backup.md"
  expect_file "$s"
  expect_exec "$s"
  expect_grep "$s" '^#!/usr/bin/env bash' "backup.sh : shebang bash"
  expect_grep "$s" '^set -euo pipefail' "backup.sh : set -euo pipefail"
  expect_grep "$s" 'BACKUP_DIR:-/var/backups/suivi-commandes' \
    "backup.sh : dossier /var/backups/suivi-commandes par défaut"
  expect_grep "$s" 'date \+%F' "backup.sh : nom de fichier daté AAAA-MM-JJ"
  expect_grep "$s" 'pg_dump' "backup.sh : utilise pg_dump"
  expect_grep "$s" '\-\-format=custom' "backup.sh : format custom (-Fc) restaurable sélectivement"
  expect_grep "$s" 'find .*-mtime .*-delete' "backup.sh : rotation par find -mtime -delete"
  expect_grep "$s" 'RETENTION_DAYS:-30' "backup.sh : rétention 30 jours par défaut"

  if bash -n "$ROOT/$s" 2>/dev/null; then
    ok "backup.sh : syntaxe bash valide (bash -n)"
  else
    fail "backup.sh : erreur de syntaxe bash"
  fi

  if command -v shellcheck >/dev/null 2>&1; then
    if shellcheck "$ROOT/deploy/backup.sh" "$ROOT/deploy/check-deploy.sh"; then
      ok "shellcheck : aucun avertissement sur backup.sh et check-deploy.sh"
    else
      fail "shellcheck : avertissements à corriger (voir ci-dessus)"
    fi
  else
    ok "shellcheck absent de la machine — relecture manuelle requise (voir Étape 6)"
  fi

  expect_file "$d"
  expect_grep "$d" 'pg_restore' "backup.md : procédure de restauration documentée"
  expect_grep "$d" '0 3 \* \* \*' "backup.md : ligne crontab à 3 h 00"
  expect_grep "$d" '/var/backups/suivi-commandes' "backup.md : emplacement des sauvegardes"
}

check_install() {
  local f="deploy/install.md"
  expect_file "$f"
  expect_grep "$f" 'nodesource' "install : dépôt NodeSource pour Node 22"
  expect_grep "$f" 'setup_22\.x' "install : script d'installation Node 22"
  expect_grep "$f" 'corepack enable' "install : pnpm activé via corepack"
  expect_grep "$f" 'corepack prepare pnpm@' "install : version de pnpm épinglée"
  expect_grep "$f" 'postgresql-16' "install : PostgreSQL 16"
  expect_grep "$f" 'CREATE DATABASE suivi_commandes' "install : création de la base"
  expect_grep "$f" 'DATABASE_URL=postgresql://' "install : DATABASE_URL documentée"
  expect_grep "$f" 'openssl rand -base64 32' "install : JWT_SECRET généré aléatoirement"
  expect_grep "$f" 'git clone' "install : clonage du dépôt"
  expect_grep "$f" 'pnpm install --frozen-lockfile' "install : installation des dépendances"
  expect_grep "$f" 'prisma migrate deploy' "install : migrations Prisma en production"
  expect_grep "$f" 'prisma db seed' "install : seed initial"
  expect_grep "$f" 'import:xlsx' "install : import du classeur Excel"
  expect_grep "$f" 'filter @suivi/api build' "install : build de l'API"
  expect_grep "$f" 'filter @suivi/web build' "install : build du web"
  expect_grep "$f" 'pm2 start deploy/ecosystem.config.js' "install : démarrage PM2"
  expect_grep "$f" 'pm2 startup' "install : PM2 au démarrage du serveur"
  expect_grep "$f" 'pm2 save' "install : liste PM2 persistée"
  expect_grep "$f" 'a2enmod proxy proxy_http proxy_wstunnel rewrite ssl headers' \
    "install : activation des modules Apache"
  expect_grep "$f" 'a2ensite suivi-commandes' "install : activation du vhost"
  expect_grep "$f" 'apachectl configtest' "install : validation de la configuration Apache"
  expect_grep "$f" 'certbot --apache' "install : obtention du certificat TLS"
  expect_grep "$f" 'curl -s https://.*/api/health' "install : vérification finale HTTPS"
  expect_grep "$f" 'deploy/backup.md' "install : renvoi vers la procédure de sauvegarde"
}

run_check() {
  local name="$1"
  printf '\n--- %s ---\n' "$name"
  if declare -F "check_$name" >/dev/null; then
    "check_$name"
  else
    fail "vérification « $name » non implémentée (fonction check_$name absente)"
  fi
}

main() {
  local checks=("$@")
  if [ "${#checks[@]}" -eq 0 ] || [ "${checks[0]}" = "all" ]; then
    checks=("${ALL_CHECKS[@]}")
  fi

  local name
  for name in "${checks[@]}"; do
    run_check "$name"
  done

  printf '\n'
  if [ "$failures" -ne 0 ]; then
    printf '%d vérification(s) en échec.\n' "$failures" >&2
    exit 1
  fi
  printf 'Toutes les vérifications de déploiement passent.\n'
}

main "$@"
