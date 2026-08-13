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
