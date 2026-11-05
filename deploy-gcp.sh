#!/usr/bin/env bash
# =============================================================================
# deploy-gcp.sh — versión definitiva (Cloud Run ×3 + Neon Postgres externo)
#
# Qué hace: preflight de GCP, Artifact Registry, bootstrap de Neon, build de
# imágenes y despliegue de los 3 servicios en Cloud Run, más `update-cors`.
#
# Verificación local (sin tocar GCP): `bash -n`, `shellcheck` y
# `docker compose config -q`. La ejecución real necesita proyecto con billing y
# una base Neon con sus dos endpoints.
#
# Uso:
#   ./deploy-gcp.sh preflight       # billing + 4 APIs
#   ./deploy-gcp.sh ensure-ar       # repositorio Artifact Registry
#   ./deploy-gcp.sh bootstrap-db    # esquema + seed contra Neon (endpoint directo)
#   ./deploy-gcp.sh build           # build+push endorsements y routes
#   ./deploy-gcp.sh deploy          # Cloud Run: backends + frontend
#   ./deploy-gcp.sh urls            # imprime URLs públicas
#   ./deploy-gcp.sh update-cors     # fija el origen exacto del frontend
#   ./deploy-gcp.sh logs [servicio] # logs recientes (por defecto endorsements)
#   ./deploy-gcp.sh all             # secuencia completa, en ese orden
#
# Variables obligatorias (sin valores por defecto):
#   DB_HOST_POOLED, DB_HOST_DIRECT, DB_NAME, DB_USER, DB_PASSWORD, JWT_SECRET
# Variables opcionales: PROJECT_ID, REGION, AR_REPO, TAG, SERVICE_*, IMAGE_*,
#   PORT_*, MAX_INSTANCES, CORS_ORIGINS, ENABLE_DEMO_TOKEN,
#   DEMO_TOKEN_TTL_SECONDS, DEMO_TOKEN_TTL_MINUTES, STATE_FILE.
#
# CORS: los backends reciben `CORS_ORIGINS` como lista separada por comas. La URL
# del frontend solo existe DESPUÉS de desplegarlo, así que el primer deploy de los
# backends va sin CORS y `update-cors` fija después el origen exacto. En Cloud Run
# nunca se usa `*`: el backend Hapi aborta el arranque con comodín en producción.
#
# Token demo: ENABLE_DEMO_TOKEN=true para que el evaluador pueda autenticarse, con
# scope acotado a los endpoints del reto y vida de 3600 s (1 hora). El alcance se
# limita por scope, no por tiempo. Ver docs/entrega-talsory.md.
#
# `--allow-unauthenticated` es deliberado: la seguridad real vive en el JWT de la
# aplicación (y en el CORS), no en IAM. Es una demo pública evaluable; IAM
# impediría que el jurado abriera la URL.
#
# Secretos: NUNCA se escriben en el repo. `JWT_SECRET` y `DB_PASSWORD` se leen del
# entorno del operador y se inyectan en Cloud Run como variables de entorno
# (`--set-env-vars`), no como secretos de Secret Manager. Es una decisión
# consciente para esta demo: elimina dos recursos y el `secretAccessor` por
# servicio. Trade-off explícito: quien pueda leer la configuración del servicio
# (`run.services.get`) verá ambos valores; se aceptan porque la demo es pública y
# evaluable, se rotan al terminar y no dan acceso a nada más que a esta base y a
# estos tokens. Migrar a Secret Manager es cambiar `--set-env-vars` por
# `--set-secrets` y publicar las versiones; el resto del script no cambia.
# `secretmanager.googleapis.com` se habilita para dejar preparada esa migración.
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

TAG="${TAG:-$(git -C "$REPO_ROOT" rev-parse --short HEAD 2>/dev/null || echo unknown)}"

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

# Lista explícita de orígenes. Vacía = sin CORS hasta que `update-cors` fije la
# URL real del frontend (nunca `*` en Cloud Run).
CORS_ORIGINS="${CORS_ORIGINS:-}"
# Demo pública evaluable: el jurado necesita emitir token. El scope está
# acotado en cada backend a los endpoints del reto.
ENABLE_DEMO_TOKEN="${ENABLE_DEMO_TOKEN:-true}"
# Vida del token demo: una hora, de sobra para una sesión de evaluación.
# El alcance se limita por scope, no por tiempo.
DEMO_TOKEN_TTL_SECONDS="${DEMO_TOKEN_TTL_SECONDS:-3600}"
DEMO_TOKEN_TTL_MINUTES="${DEMO_TOKEN_TTL_MINUTES:-60}"

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
  echo "4 APIs habilitadas"
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

# `gcloud run deploy --set-env-vars` separa pares con comas por defecto; con
# `^X^` acepta cualquier otro carácter. Se elige un delimitador que no aparezca
# en ningún valor para que una contraseña con comas o puntos y coma no rompa el
# despliegue.
pick_env_delimiter() {
  local candidate
  for candidate in '@' '#' '|' ';' ':' '%'; do
    case "${DB_HOST_POOLED}${DB_USER}${DB_NAME}${DB_PASSWORD}${JWT_SECRET}" in
      *"$candidate"*) continue ;;
    esac
    printf '%s' "$candidate"
    return 0
  done
  return 1
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
  # `--allow-unauthenticated` es intencional (ver cabecera): IAM bloquearía al
  # evaluador; la autorización real está en el JWT y el CORS de la app.
  # Runtime con el endpoint POOLED y DB_SYNCHRONIZE=false: el esquema ya lo creó
  # `bootstrap-db` contra el endpoint DIRECTO. Los secretos viajan en la misma
  # lista (ver trade-off en la cabecera); el delimitador evita colisiones con el
  # contenido de la contraseña o del JWT.
  local d
  d="$(pick_env_delimiter)" || die "no hay delimitador seguro para --set-env-vars; revisa que ningún valor contenga @ # | ; : %"
  local endorsements_env="DB_HOST=${DB_HOST_POOLED}${d}DB_PORT=${DB_PORT}${d}DB_USER=${DB_USER}${d}DB_NAME=${DB_NAME}${d}DB_SSL=true${d}DB_SYNCHRONIZE=false${d}DB_LOGGING=false${d}JWT_TTL_SECONDS=${DEMO_TOKEN_TTL_SECONDS}${d}ENABLE_DEMO_TOKEN=${ENABLE_DEMO_TOKEN}${d}JWT_SECRET=${JWT_SECRET}${d}DB_PASSWORD=${DB_PASSWORD}"
  local routes_env="JWT_TTL_MINUTES=${DEMO_TOKEN_TTL_MINUTES}${d}ENABLE_DEMO_TOKEN=${ENABLE_DEMO_TOKEN}${d}JWT_SECRET=${JWT_SECRET}"
  if [ -n "$CORS_ORIGINS" ]; then
    endorsements_env="${endorsements_env}${d}CORS_ORIGINS=${CORS_ORIGINS}"
    routes_env="${routes_env}${d}CORS_ORIGINS=${CORS_ORIGINS}"
  else
    warn "CORS_ORIGINS vacío: los backends arrancarán sin CORS hasta ./deploy-gcp.sh update-cors"
  fi

  gcloud run deploy "$SERVICE_ENDORSEMENTS" \
    --project "$PROJECT_ID" \
    --region "$REGION" \
    --image "$AR_HOST/$IMAGE_ENDORSEMENTS:$TAG" \
    --port "$PORT_ENDORSEMENTS" \
    --allow-unauthenticated \
    --max-instances "$MAX_INSTANCES" \
    --set-env-vars "^${d}^${endorsements_env}" \
    --quiet

  gcloud run deploy "$SERVICE_ROUTES" \
    --project "$PROJECT_ID" \
    --region "$REGION" \
    --image "$AR_HOST/$IMAGE_ROUTES:$TAG" \
    --port "$PORT_ROUTES" \
    --allow-unauthenticated \
    --max-instances "$MAX_INSTANCES" \
    --set-env-vars "^${d}^${routes_env}" \
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
  echo "siguiente paso: ./deploy-gcp.sh update-cors (fija CORS_ORIGINS a esta URL)"
}

# Fija en ambos backends el origen EXACTO del frontend ya desplegado. Se separa
# de `deploy` porque la URL del frontend no existe antes de crearlo.
cmd_update_cors() {
  require_gcloud
  require_common
  if ! load_state; then
    die "no existe $STATE_FILE. Ejecuta antes ./deploy-gcp.sh deploy"
  fi
  : "${URL_FRONTEND:?no hay URL_FRONTEND; ejecuta ./deploy-gcp.sh deploy}"

  log "update-cors: fijando $URL_FRONTEND en los backends"
  gcloud run services update "$SERVICE_ENDORSEMENTS" \
    --project "$PROJECT_ID" --region "$REGION" \
    --update-env-vars "CORS_ORIGINS=${URL_FRONTEND}" \
    --quiet
  gcloud run services update "$SERVICE_ROUTES" \
    --project "$PROJECT_ID" --region "$REGION" \
    --update-env-vars "CORS_ORIGINS=${URL_FRONTEND}" \
    --quiet

  echo "CORS restringido a $URL_FRONTEND en $SERVICE_ENDORSEMENTS y $SERVICE_ROUTES"
  echo "verifica:"
  echo "  curl -i -X OPTIONS ${URL_ENDORSEMENTS}/v1/endorse/translate \\"
  echo "    -H 'Origin: ${URL_FRONTEND}' -H 'Access-Control-Request-Method: POST'"
  echo "  curl -i -X OPTIONS ${URL_ENDORSEMENTS}/v1/endorse/translate \\"
  echo "    -H 'Origin: https://evil.example.com' -H 'Access-Control-Request-Method: POST'"
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

# Orden definitivo: preflight → ensure-ar → bootstrap-db → build → deploy →
# urls → update-cors. `update-cors` va al final porque necesita la URL del
# frontend, que solo existe después de `deploy`.
cmd_all() {
  cmd_preflight
  cmd_ensure_ar
  cmd_bootstrap_db
  cmd_build
  cmd_deploy_backends
  cmd_deploy_frontend
  cmd_urls
  cmd_update_cors
}

usage() {
  cat <<'USAGE'
Uso: ./deploy-gcp.sh <subcomando>

  preflight       Verifica billing y habilita las 4 APIs
  ensure-ar       Crea/valida el repositorio de Artifact Registry
  bootstrap-db    Crea esquema (synchronize) + seed contra Neon (endpoint directo)
  build           Build+push de endorsements y routes
  deploy          Despliega backends y frontend en Cloud Run
  urls            Imprime las URLs públicas
  update-cors     Fija CORS_ORIGINS de los backends a la URL del frontend
  logs [servicio] Logs recientes (por defecto endorsements)
  all             Ejecuta preflight → ensure-ar → bootstrap-db → build → deploy
                  → urls → update-cors
  help            Muestra esta ayuda

Variables obligatorias: DB_HOST_POOLED, DB_HOST_DIRECT, DB_NAME, DB_USER,
DB_PASSWORD, JWT_SECRET. Opcionales: PROJECT_ID, REGION, AR_REPO, TAG,
CORS_ORIGINS, ENABLE_DEMO_TOKEN, DEMO_TOKEN_TTL_*, etc.
DB_PASSWORD y JWT_SECRET se leen del entorno y se envían a Cloud Run con
--set-env-vars (ver la cabecera del script para el trade-off).
USAGE
}

main() {
  local command="${1:-}"
  case "$command" in
    preflight)      cmd_preflight ;;
    ensure-ar)      cmd_ensure_ar ;;
    bootstrap-db)   cmd_bootstrap_db ;;
    build)          cmd_build ;;
    deploy)         cmd_deploy_backends; cmd_deploy_frontend ;;
    update-cors)    cmd_update_cors ;;
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
