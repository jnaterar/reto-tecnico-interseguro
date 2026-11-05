#!/usr/bin/env bash
# =============================================================================
# deploy-gcp.sh — BORRADOR VALIDADO (Fase 3). NO cierra el despliegue final.
#
# Qué hace: preflight de GCP, Artifact Registry, secretos, bootstrap de Neon,
# build de imágenes y despliegue de los 3 servicios en Cloud Run.
#
# Estado: parametrizado y verificado solo con dry checks locales (`bash -n`,
# `shellcheck`, fallo limpio). NO se ha ejecutado contra GCP.
#
# Uso:
#   ./deploy-gcp.sh preflight       # billing + 5 APIs
#   ./deploy-gcp.sh ensure-ar       # repositorio Artifact Registry
#   ./deploy-gcp.sh ensure-secrets  # jwt-secret / db-password
#   ./deploy-gcp.sh bootstrap-db    # esquema + seed contra Neon (endpoint directo)
#   ./deploy-gcp.sh build           # build+push endorsements y routes
#   ./deploy-gcp.sh deploy          # Cloud Run: backends + frontend
#   ./deploy-gcp.sh urls            # imprime URLs públicas
#   ./deploy-gcp.sh logs [servicio] # logs recientes (por defecto endorsements)
#   ./deploy-gcp.sh all             # secuencia completa
#
# Variables obligatorias (sin valores por defecto):
#   DB_HOST_POOLED, DB_HOST_DIRECT, DB_NAME, DB_USER, DB_PASSWORD, JWT_SECRET
# Variables opcionales: PROJECT_ID, REGION, AR_REPO, TAG, SERVICE_*, IMAGE_*,
#   PORT_*, MAX_INSTANCES, SECRET_JWT, SECRET_DB_PASSWORD, CORS_ORIGINS,
#   CORS_ORIGIN, ENABLE_DEMO_TOKEN, STATE_FILE.
#
# PLACEHOLDERS (se cierran en fases posteriores):
#   - FASE 4: CORS_ORIGINS/CORS_ORIGIN y ENABLE_DEMO_TOKEN. Hoy '*' y 'true'.
#   - FASE 5: textos/URLs definitivas en README y docs/entrega-talsory.md.
#   - `sqladmin.googleapis.com` se habilita por la consigna; Neon NO usa Cloud
#     SQL, así que puede retirarse cuando se cierre el script.
#
# Secretos: NUNCA se escriben en el repo. DB_PASSWORD y JWT_SECRET se leen del
# entorno y se publican como versiones de Secret Manager; Cloud Run los monta
# con --set-secrets. Si Cloud Run usa un service account propio, concédele
# roles/secretmanager.secretAccessor sobre ambos secretos.
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$SCRIPT_DIR"

# --- Parametrización (todo sobreescribible por entorno) ----------------------
PROJECT_ID="${PROJECT_ID:-reto-tecnico-interseguro}"
REGION="${REGION:-us-central1}"
AR_REPO="${AR_REPO:-interseguro-reto}"
AR_HOST="${REGION}-docker.pkg.dev/${PROJECT_ID}/${AR_REPO}"

SERVICE_ENDORSEMENTS="${SERVICE_ENDORSEMENTS:-endorsements}"
SERVICE_ROUTES="${SERVICE_ROUTES:-routes}"
SERVICE_FRONTEND="${SERVICE_FRONTEND:-frontend}"

IMAGE_ENDORSEMENTS="${IMAGE_ENDORSEMENTS:-endorsements}"
IMAGE_ROUTES="${IMAGE_ROUTES:-routes}"
IMAGE_FRONTEND="${IMAGE_FRONTEND:-frontend}"

TAG="${TAG:-$(git -C "$REPO_ROOT" rev-parse --short HEAD 2>/dev/null || echo draft)}"

PORT_ENDORSEMENTS="${PORT_ENDORSEMENTS:-8082}"
PORT_ROUTES="${PORT_ROUTES:-8081}"
PORT_FRONTEND="${PORT_FRONTEND:-8080}"
MAX_INSTANCES="${MAX_INSTANCES:-3}"

# Neon: el runtime usa el endpoint POOLED (contiene -pooler); el bootstrap/seed
# usa el endpoint DIRECTO (conexión larga, sin pgbouncer).
DB_HOST_POOLED="${DB_HOST_POOLED:-}"
DB_HOST_DIRECT="${DB_HOST_DIRECT:-}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-}"
DB_USER="${DB_USER:-}"
DB_PASSWORD="${DB_PASSWORD:-}"
JWT_SECRET="${JWT_SECRET:-}"
SECRET_JWT="${SECRET_JWT:-jwt-secret}"
SECRET_DB_PASSWORD="${SECRET_DB_PASSWORD:-db-password}"

# PLACEHOLDER FASE 4: hoy abierto para poder demostrar el flujo. La Fase 4
# restringe CORS al origen real del frontend y ajusta ENABLE_DEMO_TOKEN.
CORS_ORIGINS="${CORS_ORIGINS:-*}"
CORS_ORIGIN="${CORS_ORIGIN:-*}"
ENABLE_DEMO_TOKEN="${ENABLE_DEMO_TOKEN:-true}"

# Estado local (URLs públicas). No se versiona (ver .gitignore).
STATE_FILE="${STATE_FILE:-$REPO_ROOT/.deploy-state.env}"

# --- Utilidades --------------------------------------------------------------
log()  { printf '\n== %s ==\n' "$*"; }
warn() { printf 'AVISO: %s\n' "$*" >&2; }
die()  { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

require_gcloud() {
  command -v gcloud >/dev/null 2>&1 || die "gcloud no está instalado o no está en PATH"
}

require_common() {
  : "${PROJECT_ID:?Define PROJECT_ID (por defecto reto-tecnico-interseguro)}"
  : "${REGION:?Define REGION (por defecto us-central1)}"
  : "${AR_REPO:?Define AR_REPO (por defecto interseguro-reto)}"
}

require_db() {
  : "${DB_HOST_POOLED:?Define DB_HOST_POOLED con el host POOLED de Neon (contiene -pooler)}"
  : "${DB_HOST_DIRECT:?Define DB_HOST_DIRECT con el host DIRECTO de Neon (sin -pooler)}"
  : "${DB_NAME:?Define DB_NAME (por ejemplo endorsements)}"
  : "${DB_USER:?Define DB_USER de Neon}"
  : "${DB_PASSWORD:?Define DB_PASSWORD de Neon solo en el entorno; nunca en el repo}"
  : "${JWT_SECRET:?Define JWT_SECRET (mínimo 16 caracteres); nunca en el repo}"
  [ "${#JWT_SECRET}" -ge 16 ] || die "JWT_SECRET debe tener al menos 16 caracteres"
}

write_state() {
  umask 077
  {
    printf '# Generado por deploy-gcp.sh el %s (no versionar)\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    printf 'URL_ENDORSEMENTS=%q\n' "${URL_ENDORSEMENTS:-}"
    printf 'URL_ROUTES=%q\n' "${URL_ROUTES:-}"
    printf 'URL_FRONTEND=%q\n' "${URL_FRONTEND:-}"
  } > "$STATE_FILE"
  echo "estado guardado en $STATE_FILE"
}

load_state() {
  [ -f "$STATE_FILE" ] || return 1
  # shellcheck disable=SC1090
  . "$STATE_FILE"
  return 0
}

# --- Subcomandos -------------------------------------------------------------
cmd_preflight() {
  require_gcloud
  require_common
  log "preflight: proyecto $PROJECT_ID, región $REGION"

  local billing
  billing="$(gcloud beta billing projects describe "$PROJECT_ID" --format='value(billingEnabled)' 2>/dev/null || true)"
  if [ "$billing" != "True" ] && [ "$billing" != "true" ]; then
    die "el proyecto $PROJECT_ID no tiene billing habilitado (o no se pudo consultar). Habilítalo antes de continuar."
  fi
  echo "billing habilitado: $billing"

  local apis=(
    run.googleapis.com
    artifactregistry.googleapis.com
    secretmanager.googleapis.com
    sqladmin.googleapis.com
    cloudbuild.googleapis.com
  )
  echo "habilitando APIs (idempotente): ${apis[*]}"
  gcloud services enable "${apis[@]}" --project "$PROJECT_ID" --quiet
  local api
  for api in "${apis[@]}"; do
    if ! gcloud services list --enabled --project "$PROJECT_ID" \
      --filter="config.name=$api" --format='value(config.name)' | grep -q "$api"; then
      die "no se pudo confirmar que $api está habilitada"
    fi
  done
  echo "5 APIs habilitadas"
  warn "sqladmin.googleapis.com se exige por la consigna; Neon no usa Cloud SQL."
}

cmd_ensure_ar() {
  require_gcloud
  require_common
  log "ensure-ar: $AR_REPO en $REGION"
  if ! gcloud artifacts repositories describe "$AR_REPO" \
    --location="$REGION" --project="$PROJECT_ID" >/dev/null 2>&1; then
    gcloud artifacts repositories create "$AR_REPO" \
      --repository-format=docker \
      --location="$REGION" \
      --project="$PROJECT_ID" \
      --description="Imágenes del reto técnico Interseguro" \
      --quiet
  else
    echo "el repositorio ya existe"
  fi
  gcloud auth configure-docker "${REGION}-docker.pkg.dev" --quiet
}

ensure_secret() {
  local name="$1" value="$2"
  if ! gcloud secrets describe "$name" --project "$PROJECT_ID" >/dev/null 2>&1; then
    gcloud secrets create "$name" --project "$PROJECT_ID" \
      --replication-policy=automatic \
      --labels=managed-by=deploy-gcp-script --quiet
  fi
  printf '%s' "$value" | gcloud secrets versions add "$name" \
    --project "$PROJECT_ID" --data-file=- --quiet
  echo "secreto $name actualizado con una versión nueva"
}

cmd_ensure_secrets() {
  require_gcloud
  require_common
  : "${DB_PASSWORD:?Define DB_PASSWORD de Neon solo en el entorno; nunca en el repo}"
  : "${JWT_SECRET:?Define JWT_SECRET (mínimo 16 caracteres); nunca en el repo}"
  [ "${#JWT_SECRET}" -ge 16 ] || die "JWT_SECRET debe tener al menos 16 caracteres"
  log "ensure-secrets: $SECRET_JWT y $SECRET_DB_PASSWORD"
  ensure_secret "$SECRET_JWT" "$JWT_SECRET"
  ensure_secret "$SECRET_DB_PASSWORD" "$DB_PASSWORD"
  warn "si Cloud Run usa un service account propio, concédele roles/secretmanager.secretAccessor"
}

cmd_bootstrap_db() {
  require_db
  command -v npm >/dev/null 2>&1 || die "npm no está disponible; se requiere Node 22 para ejecutar el seed"
  log "bootstrap-db contra Neon (endpoint DIRECTO): $DB_HOST_DIRECT"
  warn "crea/actualiza el esquema (DB_SYNCHRONIZE=true) y ejecuta el seed UNA VEZ; no lo pongas en CI"
  (
    cd "$REPO_ROOT/backend-endorsements-hapi"
    npm ci --no-audit --no-fund
    # NODE_ENV=production evita que `loadConfig` lea un `.env` local y garantiza
    # que se usan exactamente las variables exportadas en este script.
    NODE_ENV=production \
    DB_HOST="$DB_HOST_DIRECT" \
    DB_PORT="$DB_PORT" \
    DB_USER="$DB_USER" \
    DB_PASSWORD="$DB_PASSWORD" \
    DB_NAME="$DB_NAME" \
    DB_SSL=true \
    DB_SYNCHRONIZE=true \
    JWT_SECRET="$JWT_SECRET" \
    npm run seed
  )
  echo "bootstrap completado; Cloud Run usará DB_SYNCHRONIZE=false"
}

cmd_build() {
  require_gcloud
  require_common
  log "build: $IMAGE_ENDORSEMENTS y $IMAGE_ROUTES ($TAG)"
  gcloud builds submit "$REPO_ROOT/backend-endorsements-hapi" \
    --project "$PROJECT_ID" \
    --tag "$AR_HOST/$IMAGE_ENDORSEMENTS:$TAG" \
    --quiet
  gcloud builds submit "$REPO_ROOT/backend-routes-golang" \
    --project "$PROJECT_ID" \
    --tag "$AR_HOST/$IMAGE_ROUTES:$TAG" \
    --quiet
  echo "imágenes publicadas en $AR_HOST"
}

cmd_deploy_backends() {
  require_gcloud
  require_common
  require_db
  log "deploy backends: $SERVICE_ENDORSEMENTS y $SERVICE_ROUTES"

  # Cloud Run inyecta PORT en runtime; `--port` solo declara cuál escuchar.
  # PLACEHOLDER FASE 4: CORS_ORIGINS/ENABLE_DEMO_TOKEN se restringen después.
  gcloud run deploy "$SERVICE_ENDORSEMENTS" \
    --project "$PROJECT_ID" \
    --region "$REGION" \
    --image "$AR_HOST/$IMAGE_ENDORSEMENTS:$TAG" \
    --port "$PORT_ENDORSEMENTS" \
    --allow-unauthenticated \
    --max-instances "$MAX_INSTANCES" \
    --set-env-vars "DB_HOST=${DB_HOST_POOLED},DB_PORT=${DB_PORT},DB_USER=${DB_USER},DB_NAME=${DB_NAME},DB_SSL=true,DB_SYNCHRONIZE=false,DB_LOGGING=false,JWT_TTL_SECONDS=3600,ENABLE_DEMO_TOKEN=${ENABLE_DEMO_TOKEN},CORS_ORIGINS=${CORS_ORIGINS}" \
    --set-secrets "JWT_SECRET=${SECRET_JWT}:latest,DB_PASSWORD=${SECRET_DB_PASSWORD}:latest" \
    --quiet

  gcloud run deploy "$SERVICE_ROUTES" \
    --project "$PROJECT_ID" \
    --region "$REGION" \
    --image "$AR_HOST/$IMAGE_ROUTES:$TAG" \
    --port "$PORT_ROUTES" \
    --allow-unauthenticated \
    --max-instances "$MAX_INSTANCES" \
    --set-env-vars "JWT_TTL_MINUTES=60,ENABLE_DEMO_TOKEN=${ENABLE_DEMO_TOKEN},CORS_ORIGIN=${CORS_ORIGIN}" \
    --set-secrets "JWT_SECRET=${SECRET_JWT}:latest" \
    --quiet

  URL_ENDORSEMENTS="$(gcloud run services describe "$SERVICE_ENDORSEMENTS" \
    --project "$PROJECT_ID" --region "$REGION" --format='value(status.url)')"
  URL_ROUTES="$(gcloud run services describe "$SERVICE_ROUTES" \
    --project "$PROJECT_ID" --region "$REGION" --format='value(status.url)')"
  [ -n "$URL_ENDORSEMENTS" ] || die "no se pudo obtener la URL de $SERVICE_ENDORSEMENTS"
  [ -n "$URL_ROUTES" ] || die "no se pudo obtener la URL de $SERVICE_ROUTES"
  write_state
  echo "URL endorsements: $URL_ENDORSEMENTS"
  echo "URL routes:       $URL_ROUTES"
}

cmd_deploy_frontend() {
  require_gcloud
  require_common
  if ! load_state; then
    die "no existe $STATE_FILE. Ejecuta antes ./deploy-gcp.sh deploy (backends)"
  fi
  : "${URL_ENDORSEMENTS:?no hay URL_ENDORSEMENTS; ejecuta ./deploy-gcp.sh deploy}"
  : "${URL_ROUTES:?no hay URL_ROUTES; ejecuta ./deploy-gcp.sh deploy}"

  log "deploy frontend: build con VITE_* (build-time) + Cloud Run"
  gcloud builds submit "$REPO_ROOT/frontend-monolith" \
    --project "$PROJECT_ID" \
    --config "$REPO_ROOT/cloudbuild-frontend.yaml" \
    --substitutions="_AR_HOST=${AR_HOST},_IMAGE_NAME=${IMAGE_FRONTEND},_TAG=${TAG},_VITE_API_ENDORSEMENTS_URL=${URL_ENDORSEMENTS},_VITE_API_ROUTES_URL=${URL_ROUTES}" \
    --quiet

  gcloud run deploy "$SERVICE_FRONTEND" \
    --project "$PROJECT_ID" \
    --region "$REGION" \
    --image "$AR_HOST/$IMAGE_FRONTEND:$TAG" \
    --port "$PORT_FRONTEND" \
    --allow-unauthenticated \
    --quiet

  URL_FRONTEND="$(gcloud run services describe "$SERVICE_FRONTEND" \
    --project "$PROJECT_ID" --region "$REGION" --format='value(status.url)')"
  [ -n "$URL_FRONTEND" ] || die "no se pudo obtener la URL de $SERVICE_FRONTEND"
  write_state
  echo "URL frontend: $URL_FRONTEND"
  warn "PLACEHOLDER FASE 4: CORS sigue en '*' en los backends; se restringirá a $URL_FRONTEND"
}

cmd_urls() {
  require_gcloud
  require_common
  local e r f
  e="$(gcloud run services describe "$SERVICE_ENDORSEMENTS" \
    --project "$PROJECT_ID" --region "$REGION" --format='value(status.url)' 2>/dev/null || true)"
  r="$(gcloud run services describe "$SERVICE_ROUTES" \
    --project "$PROJECT_ID" --region "$REGION" --format='value(status.url)' 2>/dev/null || true)"
  f="$(gcloud run services describe "$SERVICE_FRONTEND" \
    --project "$PROJECT_ID" --region "$REGION" --format='value(status.url)' 2>/dev/null || true)"

  echo "endorsements: ${e:-<no desplegado>}"
  echo "routes:       ${r:-<no desplegado>}"
  echo "frontend:     ${f:-<no desplegado>}"

  if [ -n "$e" ] && [ -n "$r" ] && [ -n "$f" ]; then
    URL_ENDORSEMENTS="$e"
    URL_ROUTES="$r"
    URL_FRONTEND="$f"
    write_state
  fi
}

cmd_logs() {
  require_gcloud
  require_common
  local service="${1:-$SERVICE_ENDORSEMENTS}"
  gcloud run services logs read "$service" \
    --project "$PROJECT_ID" --region "$REGION" --limit=50
}

cmd_all() {
  cmd_preflight
  cmd_ensure_ar
  cmd_ensure_secrets
  cmd_bootstrap_db
  cmd_build
  cmd_deploy_backends
  cmd_deploy_frontend
  cmd_urls
}

usage() {
  cat <<'USAGE'
Uso: ./deploy-gcp.sh <subcomando>

  preflight       Verifica billing y habilita las 5 APIs
  ensure-ar       Crea/valida el repositorio de Artifact Registry
  ensure-secrets  Publica jwt-secret y db-password en Secret Manager
  bootstrap-db    Crea esquema (synchronize) + seed contra Neon (endpoint directo)
  build           Build+push de endorsements y routes
  deploy          Despliega backends y frontend en Cloud Run
  urls            Imprime las URLs públicas
  logs [servicio] Logs recientes (por defecto endorsements)
  all             Ejecuta todo en el orden documentado
  help            Muestra esta ayuda

Variables obligatorias: DB_HOST_POOLED, DB_HOST_DIRECT, DB_NAME, DB_USER,
DB_PASSWORD, JWT_SECRET. Opcionales: PROJECT_ID, REGION, AR_REPO, TAG, etc.
Ver la cabecera del script para el detalle y los placeholders de Fase 4.
USAGE
}

main() {
  local command="${1:-}"
  case "$command" in
    preflight)      cmd_preflight ;;
    ensure-ar)      cmd_ensure_ar ;;
    ensure-secrets) cmd_ensure_secrets ;;
    bootstrap-db)   cmd_bootstrap_db ;;
    build)          cmd_build ;;
    deploy)         cmd_deploy_backends; cmd_deploy_frontend ;;
    urls)           cmd_urls ;;
    logs)
      shift
      cmd_logs "${1:-$SERVICE_ENDORSEMENTS}"
      ;;
    all)            cmd_all ;;
    ""|-h|--help|help)
      usage
      exit 0
      ;;
    *)
      usage >&2
      die "subcomando desconocido: $command"
      ;;
  esac
}

main "$@"
