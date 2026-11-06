#!/usr/bin/env bash
#
# Gates SCA locales y NO bloqueantes.
#
# Objetivo: tener una foto repetible del estado de dependencias e imágenes sin
# tocar el pipeline de despliegue. `deploy-gcp.sh` y `cloudbuild-frontend.yaml`
# quedan intactos: este script se ejecuta a mano o desde un job futuro.
#
# Uso:
#   ./scripts/sca.sh              # informa, siempre sale con 0
#   ./scripts/sca.sh --strict     # sale con 1 si hay hallazgos en producción
#   ./scripts/sca.sh --images     # además escanea las imágenes construidas
#
# Salidas: .sca/*.txt (ignorado por git).
#
set -uo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="$ROOT_DIR/.sca"
STRICT=0
SCAN_IMAGES=0

for arg in "$@"; do
  case "$arg" in
    --strict) STRICT=1 ;;
    --images) SCAN_IMAGES=1 ;;
    -h|--help) sed -n '2,20p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) echo "Argumento desconocido: $arg" >&2; exit 2 ;;
  esac
done

mkdir -p "$OUT_DIR"

FAIL=0
note() { printf '\n\033[1m== %s ==\033[0m\n' "$*"; }
ok()   { printf '  OK    %s\n' "$*"; }
warn() { printf '  WARN  %s\n' "$*"; }
bad()  { printf '  FAIL  %s\n' "$*"; FAIL=1; }
have() { command -v "$1" >/dev/null 2>&1; }

# --- Node: dependencias que sí se despliegan ------------------------------
audit_npm() {
  local dir="$1" name code
  name="$(basename "$dir")"

  note "npm audit (producción) — $name"
  if [[ ! -f "$dir/package-lock.json" ]]; then
    warn "sin package-lock.json; se omite"
    return
  fi
  code=0
  ( cd "$dir" && npm audit --omit=dev --audit-level=moderate ) \
    >"$OUT_DIR/$name-prod.txt" 2>&1 || code=$?
  if [[ $code -eq 0 ]]; then
    ok "sin vulnerabilidades moderadas o superiores en dependencias de producción"
  else
    bad "hallazgos en dependencias de producción -> .sca/$name-prod.txt"
  fi

  note "npm audit (árbol completo, incluye dev/test) — $name"
  code=0
  ( cd "$dir" && npm audit --audit-level=moderate ) \
    >"$OUT_DIR/$name-full.txt" 2>&1 || code=$?
  if [[ $code -eq 0 ]]; then
    ok "sin vulnerabilidades moderadas o superiores"
  else
    warn "el árbol completo tiene hallazgos (normalmente dev/test) -> .sca/$name-full.txt"
  fi
}

audit_npm "$ROOT_DIR/backend-endorsements-hapi"
audit_npm "$ROOT_DIR/frontend-monolith"

# --- Go: vulnerabilidades alcanzables en la stdlib ------------------------
note "govulncheck — backend-routes-golang"
if have govulncheck; then
  code=0
  ( cd "$ROOT_DIR/backend-routes-golang" && govulncheck ./... ) \
    >"$OUT_DIR/govulncheck.txt" 2>&1 || code=$?
  if [[ $code -eq 0 ]]; then
    ok "sin vulnerabilidades alcanzables"
  else
    bad "hallazgos -> .sca/govulncheck.txt"
  fi
else
  warn "govulncheck no instalado: go install golang.org/x/vuln/cmd/govulncheck@latest"
fi

# --- Imágenes: paquetes del SO y libs del runtime -------------------------
scan_image() {
  local image="$1" safe code
  safe="$(printf '%s' "$image" | tr '/:' '__')"
  note "trivy image — $image"
  if ! have trivy; then
    warn "trivy no instalado: brew install trivy"
    return
  fi
  if ! docker image inspect "$image" >/dev/null 2>&1; then
    warn "la imagen no existe en local; construirla primero"
    return
  fi
  code=0
  trivy image --quiet --no-progress \
    --severity HIGH,CRITICAL --ignore-unfixed --exit-code 1 \
    "$image" >"$OUT_DIR/trivy-$safe.txt" 2>&1 || code=$?
  if [[ $code -eq 0 ]]; then
    ok "sin HIGH/CRITICAL corregibles"
  else
    bad "HIGH/CRITICAL corregibles -> .sca/trivy-$safe.txt"
  fi
}

if [[ $SCAN_IMAGES -eq 1 ]]; then
  scan_image "interseguro/backend-endorsements:sca"
  scan_image "interseguro/frontend-monolith:sca"
  scan_image "interseguro/routes-golang:sca"
fi

# --- Resumen --------------------------------------------------------------
printf '\n'
if [[ $FAIL -eq 0 ]]; then
  printf '\033[32mResultado: sin hallazgos que bloqueen en dependencias de producción.\033[0m\n'
  exit 0
fi

printf '\033[33mResultado: hay hallazgos. Este gate NO bloquea por defecto; revisa .sca/ y usa --strict en CI cuando el árbol esté limpio.\033[0m\n'
[[ $STRICT -eq 1 ]] && exit 1
exit 0
