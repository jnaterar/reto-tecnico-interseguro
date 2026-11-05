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
#   ./deploy-gcp.sh deploy          # Cloud Run: backends + frontend + smoke
#   ./deploy-gcp.sh redeploy        # build + deploy de los 3 conservando config + smoke
#   ./deploy-gcp.sh smoke           # EXIGE /v1/templates -> 200 con 2 plantillas
#   ./deploy-gcp.sh urls            # imprime URLs públicas
#   ./deploy-gcp.sh update-cors     # fija el origen exacto del frontend
#   ./deploy-gcp.sh logs [servicio] # logs recientes (por defecto endorsements)
#   ./deploy-gcp.sh all             # secuencia completa, en ese orden
#
# Smoke estricto (lección aprendida): un 404 de /v1/templates en producción no
# era un bug de código, era un contenedor stale. `smoke` exige que la revisión
# que sirve el 100% del tráfico sea la ÚLTIMA creada, que /health responda 200,
# que /v1/templates devuelva 200 con EXACTAMENTE 2 plantillas (AUTO y RUMBO) y
# que POST /v1/endorse/translate TRADUZCA de verdad (200, x-api-version v1,
# `eventEntity.dynamicData` y `eventAppliedEntities` no vacíos y bien formados).
# El catálogo por sí solo no prueba la traducción: el guard de `source_key` vive
# en el POST, así que sin ese check un 500 de configuración pasaba desapercibido.
# Si algo falla, termina con exit 1.
#
# `redeploy` reutiliza la configuración ya existente de Cloud Run (env vars,
# CORS y límites) y solo cambia las imágenes: no necesita DB_*/JWT_SECRET en el
# entorno. Es la vía segura para actualizar código sin volver a manejar secretos.
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
# URL canónica: `gcloud run services describe` devuelve en `status.url` la URL
# CORTA (https://<svc>-<hash>-<region>.a.run.app), pero el navegador abre y envía
# como Origin la LARGA (https://<svc>-<PROJECT_NUMBER>.<REGION>.run.app). Todo el
# script (estado, update-cors, urls y mensajes) usa la larga; si no coincide, el
# preflight CORS no devuelve Access-Control-Allow-Origin y el frontend rompe.
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
# Número de proyecto para construir la URL larga canónica de Cloud Run. Se
# resuelve una sola vez y se cachea (ver `resolve_project_number`).
PROJECT_NUMBER="${PROJECT_NUMBER:-}"
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
ok()   { printf 'OK: %s\n' "$*"; }
warn() { printf 'AVISO: %s\n' "$*" >&2; }
die()  { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

require_gcloud() {
  command -v gcloud >/dev/null 2>&1 || die "gcloud no está instalado o no está en PATH"
}

# Blindaje no-interactivo. Dentro de un script stdin no es un TTY: si gcloud se
# quedara pidiendo confirmación, el proceso se colgaría esperando input que
# nunca llega (es exactamente el cuelgue observado en `preflight`). Se desactivan
# los prompts de forma global y además cada invocación lleva `--quiet`.
disable_prompts() {
  command -v gcloud >/dev/null 2>&1 || return 0
  gcloud config set core/disable_prompts true --quiet 2>/dev/null || true
}

require_common() {
  : "${PROJECT_ID:?Define PROJECT_ID (por defecto reto-tecnico-interseguro)}"
  : "${REGION:?Define REGION (por defecto us-central1)}"
  : "${AR_REPO:?Define AR_REPO (por defecto interseguro-reto)}"
}

# Construye la URL LARGA canónica de un servicio Cloud Run:
#   https://<servicio>-<PROJECT_NUMBER>.<REGION>.run.app
# `status.url` devuelve la corta (…-<hash>-<región>.a.run.app), que NO es el
# Origin que envía el navegador. Usar siempre esta forma es lo que hace que
# CORS_ORIGINS coincida con el navegador.
canonical_url() {
  local service="$1"
  resolve_project_number "$service"
  printf 'https://%s-%s.%s.run.app' "$service" "$PROJECT_NUMBER" "$REGION"
}

# Resuelve PROJECT_NUMBER una sola vez. Fuente oficial: Cloud Resource Manager
# (`gcloud projects describe`). Respaldo: la anotación run.googleapis.com/urls
# del servicio ya desplegado incluye la URL larga; así funciona aunque la API de
# Resource Manager esté deshabilitada.
resolve_project_number() {
  local service="${1:-$SERVICE_FRONTEND}" annotation
  if [ -z "$PROJECT_NUMBER" ]; then
    PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" \
      --format='value(projectNumber)' --quiet 2>/dev/null || true)"
  fi
  if [ -z "$PROJECT_NUMBER" ]; then
    annotation="$(gcloud run services describe "$service" \
      --project "$PROJECT_ID" --region "$REGION" \
      --format='value(metadata.annotations."run.googleapis.com/urls")' \
      --quiet 2>/dev/null || true)"
    PROJECT_NUMBER="$(printf '%s' "$annotation" \
      | grep -oE 'https://[a-z0-9-]+-[0-9]+\.[a-z0-9-]+\.run\.app' \
      | head -n1 | sed -E 's#.*-([0-9]+)\.[a-z0-9-]+\.run\.app#\1#' || true)"
  fi
  [ -n "$PROJECT_NUMBER" ] \
    || die "no se pudo resolver PROJECT_NUMBER; define PROJECT_NUMBER o habilita cloudresourcemanager.googleapis.com"
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

# ¿Existe ya el servicio? Permite redesplegar código sin reinyectar secretos:
# Cloud Run conserva env vars, CORS y límites si no se pasan flags de config.
service_exists() {
  local service="$1"
  gcloud run services describe "$service" \
    --project "$PROJECT_ID" --region "$REGION" >/dev/null 2>&1
}

# Variables mínimas para (re)configurar el backend. Si faltan pero el servicio
# ya existe, se despliega solo la imagen y se conserva la configuración actual.
deploy_env_available() {
  [ -n "$DB_HOST_POOLED" ] && [ -n "$DB_NAME" ] && [ -n "$DB_USER" ] &&
    [ -n "$DB_PASSWORD" ] && [ -n "$JWT_SECRET" ]
}

# Despliega una imagen conservando la configuración del servicio salvo que se
# pida reemplazar el env completo (env_spec) o solo fijar CORS. Evita repetir
# tres ramas casi idénticas de `gcloud run deploy`.
deploy_image() {
  local service="$1" image="$2" port="$3" env_spec="$4" delim="$5" cors="$6"
  if [ -n "$env_spec" ]; then
    gcloud run deploy "$service" \
      --project "$PROJECT_ID" --region "$REGION" \
      --image "$image" --port "$port" --allow-unauthenticated \
      --max-instances "$MAX_INSTANCES" \
      --set-env-vars "^${delim}^${env_spec}" --quiet
  elif [ -n "$cors" ]; then
    gcloud run deploy "$service" \
      --project "$PROJECT_ID" --region "$REGION" \
      --image "$image" --port "$port" --allow-unauthenticated \
      --max-instances "$MAX_INSTANCES" \
      --update-env-vars "CORS_ORIGINS=${cors}" --quiet
  else
    gcloud run deploy "$service" \
      --project "$PROJECT_ID" --region "$REGION" \
      --image "$image" --port "$port" --allow-unauthenticated \
      --max-instances "$MAX_INSTANCES" --quiet
  fi
}

# --- Subcomandos -------------------------------------------------------------
cmd_preflight() {
  require_gcloud
  require_common
  log "preflight: proyecto $PROJECT_ID, región $REGION"

  # Comando estable (sin `beta`) + `--quiet` + timeout portable: nunca debe poder
  # colgarse ni bloquear el script. Si la consulta falla o expira se reporta como
  # aviso, no como error: el operador ya confirmó billingEnabled=True a mano y un
  # permiso o red ausente no debe abortar el resto del preflight.
  local billing
  if command -v timeout >/dev/null 2>&1; then
    billing="$(timeout 20 gcloud billing projects describe "$PROJECT_ID" --format='value(billingEnabled)' --quiet 2>/dev/null || echo 'UNKNOWN')"
  else
    billing="$(perl -e 'alarm 20; exec @ARGV' -- gcloud billing projects describe "$PROJECT_ID" --format='value(billingEnabled)' --quiet 2>/dev/null || echo 'UNKNOWN')"
  fi
  [[ "$billing" == "True" ]] && ok "billingEnabled=True" \
    || warn "billingEnabled=$billing (no verificable por script; confírmalo a mano)"

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
    if ! gcloud services list --enabled --project "$PROJECT_ID" --quiet \
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
  log "deploy backends: $SERVICE_ENDORSEMENTS y $SERVICE_ROUTES"

  # Cloud Run inyecta PORT en runtime; `--port` solo declara cuál escuchar.
  # `--allow-unauthenticated` es intencional (ver cabecera): IAM bloquearía al
  # evaluador; la autorización real está en el JWT y el CORS de la app.
  #
  # Dos modos:
  #   a) Hay DB_*/JWT_SECRET en el entorno -> se reemplaza el env completo
  #      (primer deploy, rotación de secretos).
  #   b) Faltan -> los servicios YA deben existir y solo se actualiza la
  #      imagen: Cloud Run conserva env vars, CORS y límites. Así `redeploy`
  #      actualiza código sin volver a manejar secretos.
  local d="" endorsements_env="" routes_env=""
  if deploy_env_available; then
    # Runtime con el endpoint POOLED y DB_SYNCHRONIZE=false: el esquema ya lo
    # creó `bootstrap-db` contra el endpoint DIRECTO. Los secretos viajan en la
    # misma lista (ver trade-off en la cabecera); el delimitador evita
    # colisiones con el contenido de la contraseña o del JWT.
    d="$(pick_env_delimiter)" || die "no hay delimitador seguro para --set-env-vars; revisa que ningún valor contenga @ # | ; : %"
    endorsements_env="DB_HOST=${DB_HOST_POOLED}${d}DB_PORT=${DB_PORT}${d}DB_USER=${DB_USER}${d}DB_NAME=${DB_NAME}${d}DB_SSL=true${d}DB_SYNCHRONIZE=false${d}DB_LOGGING=false${d}JWT_TTL_SECONDS=${DEMO_TOKEN_TTL_SECONDS}${d}ENABLE_DEMO_TOKEN=${ENABLE_DEMO_TOKEN}${d}JWT_SECRET=${JWT_SECRET}${d}DB_PASSWORD=${DB_PASSWORD}"
    routes_env="JWT_TTL_MINUTES=${DEMO_TOKEN_TTL_MINUTES}${d}ENABLE_DEMO_TOKEN=${ENABLE_DEMO_TOKEN}${d}JWT_SECRET=${JWT_SECRET}"
    if [ -n "$CORS_ORIGINS" ]; then
      endorsements_env="${endorsements_env}${d}CORS_ORIGINS=${CORS_ORIGINS}"
      routes_env="${routes_env}${d}CORS_ORIGINS=${CORS_ORIGINS}"
    else
      warn "CORS_ORIGINS vacío: los backends arrancarán sin CORS hasta ./deploy-gcp.sh update-cors"
    fi
  else
    if ! service_exists "$SERVICE_ENDORSEMENTS" || ! service_exists "$SERVICE_ROUTES"; then
      die "faltan DB_HOST_POOLED/DB_NAME/DB_USER/DB_PASSWORD/JWT_SECRET y algún backend no existe; define esas variables para el primer deploy"
    fi
    warn "sin variables DB_*/JWT_SECRET en el entorno: se conserva la configuración actual de Cloud Run y solo se actualiza la imagen"
    if [ -n "$CORS_ORIGINS" ]; then
      warn "CORS_ORIGINS se aplicará con --update-env-vars; el resto de variables no se toca"
    fi
  fi

  deploy_image "$SERVICE_ENDORSEMENTS" "$AR_HOST/$IMAGE_ENDORSEMENTS:$TAG" \
    "$PORT_ENDORSEMENTS" "$endorsements_env" "$d" "$CORS_ORIGINS"
  deploy_image "$SERVICE_ROUTES" "$AR_HOST/$IMAGE_ROUTES:$TAG" \
    "$PORT_ROUTES" "$routes_env" "$d" "$CORS_ORIGINS"

  # URL larga canónica, no la corta de status.url: es la que el navegador enviará
  # como Origin y la que debe coincidir con CORS_ORIGINS.
  URL_ENDORSEMENTS="$(canonical_url "$SERVICE_ENDORSEMENTS")"
  URL_ROUTES="$(canonical_url "$SERVICE_ROUTES")"
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
  # Normaliza a las URLs largas canónicas aunque el estado guarde las cortas de
  # una ejecución anterior: las VITE_* se hornean en el build.
  URL_ENDORSEMENTS="$(canonical_url "$SERVICE_ENDORSEMENTS")"
  URL_ROUTES="$(canonical_url "$SERVICE_ROUTES")"

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

  URL_FRONTEND="$(canonical_url "$SERVICE_FRONTEND")"
  write_state
  echo "URL frontend: $URL_FRONTEND (larga canónica)"
  echo "siguiente paso: ./deploy-gcp.sh update-cors (fija CORS_ORIGINS a esta URL larga)"
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

  # Recalcula SIEMPRE la URL larga canónica: el estado pudo guardarse con la
  # corta de status.url (bug de alineación CORS). No se confía en el valor viejo.
  URL_FRONTEND="$(canonical_url "$SERVICE_FRONTEND")"
  URL_ENDORSEMENTS="$(canonical_url "$SERVICE_ENDORSEMENTS")"
  URL_ROUTES="$(canonical_url "$SERVICE_ROUTES")"

  log "update-cors: fijando $URL_FRONTEND (larga canónica) en los backends"
  gcloud run services update "$SERVICE_ENDORSEMENTS" \
    --project "$PROJECT_ID" --region "$REGION" \
    --update-env-vars "CORS_ORIGINS=${URL_FRONTEND}" \
    --quiet
  gcloud run services update "$SERVICE_ROUTES" \
    --project "$PROJECT_ID" --region "$REGION" \
    --update-env-vars "CORS_ORIGINS=${URL_FRONTEND}" \
    --quiet

  write_state
  echo "CORS restringido a $URL_FRONTEND (larga canónica) en $SERVICE_ENDORSEMENTS y $SERVICE_ROUTES"
  echo "esta URL es la que el navegador envía como Origin; la corta de status.url no sirve"
  echo "verifica:"
  echo "  curl -i -X OPTIONS ${URL_ENDORSEMENTS}/v1/endorse/translate \\"
  echo "    -H 'Origin: ${URL_FRONTEND}' -H 'Access-Control-Request-Method: POST'"
  echo "  curl -i -X OPTIONS ${URL_ENDORSEMENTS}/v1/endorse/translate \\"
  echo "    -H 'Origin: https://evil.example.com' -H 'Access-Control-Request-Method: POST'"
}

# --- Smoke de producción ------------------------------------------------------
# Aborta con exit 1 ante CUALQUIER desviación: un rojo aquí significa que la UI
# se vería rota en vivo. No hay "avisos" para el endpoint del reto.
smoke_fail() {
  printf 'SMOKE FAIL: %s\n' "$*" >&2
  exit 1
}

# Payload canónico del enunciado: espejo EXACTO de `exampleRequest` en
# backend-endorsements-hapi/tests/fixtures.ts. Se escribe literal para que el
# smoke no dependa de Node ni de importar TypeScript en el operador, y para que
# una rotura de contrato se vea como un fallo del smoke y no como un error de
# importación. Los 11 campos son `.required()` en el esquema Joi de la ruta.
SMOKE_TRANSLATE_PAYLOAD='{
  "policyNumber": "08200000049",
  "idEnvio": 5984,
  "frecuencia": "Semestral",
  "tipoEndoso": "CambioFrecuencia",
  "producto": "Rumbo",
  "plan": "PlanRumbo",
  "moneda": "Nuevo Sol",
  "usuario": "interface.servicios",
  "fechaSolicitud": "2025-08-27",
  "fechaCliente": "2025-08-27",
  "fechaEfectiva": "2025-09-01"
}'

# Verifica que el contenedor desplegado TRADUCE de verdad, no solo que lista.
# Los asserts son sobre el contrato REAL (CoreEndorsePayload), no sobre nombres
# inventados: `eventEntity.dynamicData` (array de {etiqueta, value}) y
# `eventAppliedEntities` (array de {description, orderEvent}). Además exige la
# cabecera de versionado `x-api-version: v1` que fija el controller.
#
# Se extrajo a función a propósito: la prueba de dientes ejecuta ESTE MISMO
# código contra un servidor local, de modo que lo probado es lo que corre en
# producción, sin copias que puedan divergir.
smoke_translate() {
  local base="$1" token="$2"
  local tmp hdr status body api_version dyn dyn_invalid events events_invalid
  tmp="$(mktemp "${TMPDIR:-/tmp}/smoke-translate.XXXXXX")"
  hdr="$(mktemp "${TMPDIR:-/tmp}/smoke-translate-headers.XXXXXX")"

  status="$(curl -sS --max-time 20 -D "$hdr" -o "$tmp" -w '%{http_code}' \
    -X POST "$base/v1/endorse/translate" \
    -H "authorization: Bearer ${token}" \
    -H 'content-type: application/json' \
    --data "$SMOKE_TRANSLATE_PAYLOAD" 2>/dev/null || true)"
  body="$(cat "$tmp")"
  api_version="$(tr -d '\r' < "$hdr" | awk 'tolower($1) == "x-api-version:" {print $2}' | head -n1)"
  rm -f "$tmp" "$hdr"

  [ "$status" = "200" ] \
    || smoke_fail "POST /v1/endorse/translate devolvió HTTP $status (se EXIGE 200). Body: $body"
  printf '%s' "$body" | jq -e 'type == "object"' >/dev/null 2>&1 \
    || smoke_fail "POST /v1/endorse/translate no devolvió un objeto JSON. Body: $body"
  [ "$api_version" = "v1" ] \
    || smoke_fail "POST /v1/endorse/translate devolvió x-api-version '${api_version:-<vacío>}' (se EXIGE v1). Body: $body"

  # `eventEntity.dynamicData`: array con >= 1 entrada, cada una {etiqueta, value}
  # de tipo string y etiqueta no vacía. NO se compara el conteo con fieldCount:
  # eso duplicaría la cobertura de los unit tests y acoplaría el smoke a los
  # datos sembrados (un drift de seed daría un rojo permanente).
  dyn="$(printf '%s' "$body" | jq -r '
    if (.eventEntity.dynamicData | type) == "array" then (.eventEntity.dynamicData | length) else -1 end
  ' 2>/dev/null || echo -1)"
  [ "$dyn" -ge 1 ] 2>/dev/null \
    || smoke_fail "eventEntity.dynamicData no es un array con >= 1 elemento (length: ${dyn:-<ilegible>}). Body: $body"
  dyn_invalid="$(printf '%s' "$body" | jq -r '
    [ .eventEntity.dynamicData[] | select(
      (.etiqueta | type) != "string" or
      (.etiqueta | length) == 0 or
      (.value | type) != "string"
    )] | length' 2>/dev/null || echo 'ERROR')"
  [ "$dyn_invalid" = "0" ] \
    || smoke_fail "hay $dyn_invalid entrada(s) de eventEntity.dynamicData sin {etiqueta, value} string válidos. Body: $body"

  # `eventAppliedEntities`: array con >= 1 entrada {description, orderEvent}.
  events="$(printf '%s' "$body" | jq -r '
    if (.eventAppliedEntities | type) == "array" then (.eventAppliedEntities | length) else -1 end
  ' 2>/dev/null || echo -1)"
  [ "$events" -ge 1 ] 2>/dev/null \
    || smoke_fail "eventAppliedEntities no es un array con >= 1 elemento (length: ${events:-<ilegible>}). Body: $body"
  events_invalid="$(printf '%s' "$body" | jq -r '
    [ .eventAppliedEntities[] | select(
      (.description | type) != "string" or
      (.description | length) == 0 or
      (.orderEvent | type) != "number"
    )] | length' 2>/dev/null || echo 'ERROR')"
  [ "$events_invalid" = "0" ] \
    || smoke_fail "hay $events_invalid entrada(s) de eventAppliedEntities sin {description, orderEvent} válidos. Body: $body"

  # Evidencia para el log del deploy: status, versionado y tamaños.
  ok "POST /v1/endorse/translate -> 200 (x-api-version $api_version, dynamicData $dyn, eventAppliedEntities $events)"
}

# Exige:
#   1. La revisión que sirve el 100% del tráfico == última revisión creada y
#      lista (si no, es un contenedor stale: exactamente el 404 anterior).
#   2. GET /health -> 200 (con reintentos durante el rollout).
#   3. Token (SMOKE_TOKEN si está definido; si no, token demo) -> Bearer.
#   4. GET /v1/templates -> 200, array JSON con EXACTAMENTE 2 plantillas
#      (AUTO y RUMBO), todas con fieldCount > 0.
#   5. POST /v1/endorse/translate -> 200 con `x-api-version: v1`,
#      `eventEntity.dynamicData` y `eventAppliedEntities` no vacíos y bien
#      formados. Sin este paso el fix de `source_key` no se ejercita en runtime.
#   6. Si el backend tiene CORS_ORIGINS configurado, el preflight del navegador
#      para el frontend canónico devuelve ese mismo Access-Control-Allow-Origin.
cmd_smoke() {
  require_gcloud
  require_common
  command -v curl >/dev/null 2>&1 || die "curl es necesario para el smoke"
  command -v jq >/dev/null 2>&1 || die "jq es necesario para validar el JSON del smoke"
  command -v awk >/dev/null 2>&1 || die "awk es necesario para el smoke"

  local base
  base="$(canonical_url "$SERVICE_ENDORSEMENTS")"
  base="${base%/}"
  log "smoke: $base"

  # 1) Contenedor stale: la revisión servida debe ser la última creada/lista.
  local desc latest ready serving image cors_env
  desc="$(gcloud run services describe "$SERVICE_ENDORSEMENTS" \
    --project "$PROJECT_ID" --region "$REGION" --format=json --quiet 2>/dev/null || true)"
  [ -n "$desc" ] || smoke_fail "no se pudo describir el servicio $SERVICE_ENDORSEMENTS"
  latest="$(printf '%s' "$desc" | jq -r '.status.latestCreatedRevisionName // empty')"
  ready="$(printf '%s' "$desc" | jq -r '.status.latestReadyRevisionName // empty')"
  serving="$(printf '%s' "$desc" | jq -r '[.status.traffic[] | select((.percent // 0) == 100) | .revisionName][0] // empty')"
  image="$(printf '%s' "$desc" | jq -r '.spec.template.spec.containers[0].image // empty')"
  cors_env="$(printf '%s' "$desc" | jq -r '[.spec.template.spec.containers[0].env[]? | select(.name == "CORS_ORIGINS") | .value][0] // empty')"

  [ -n "$latest" ] || smoke_fail "no se pudo leer la última revisión creada"
  [ "$ready" = "$latest" ] || smoke_fail "la última revisión $latest no está lista (ready: ${ready:-<ninguna>})"
  [ -n "$serving" ] || smoke_fail "ninguna revisión recibe el 100% del tráfico"
  [ "$serving" = "$latest" ] \
    || smoke_fail "contenedor stale: el tráfico va a $serving pero la última revisión creada es $latest. Redespliega antes de dar el entorno por bueno."
  if [ -n "${SMOKE_EXPECT_IMAGE:-}" ]; then
    [ "$image" = "$SMOKE_EXPECT_IMAGE" ] \
      || smoke_fail "la imagen servida no es la recién construida: '$image' != '$SMOKE_EXPECT_IMAGE'. El deploy no reemplazó el contenedor."
  fi
  ok "revisión $serving sirve el 100% del tráfico (imagen $image)"

  # 2) /health con reintentos: Cloud Run puede tardar unos segundos tras el rollout.
  local attempt code
  attempt=1
  code="000"
  while [ "$attempt" -le 30 ]; do
    code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 10 "$base/health" 2>/dev/null || true)"
    [ "$code" = "200" ] && break
    sleep 2
    attempt=$((attempt + 1))
  done
  [ "$code" = "200" ] || smoke_fail "GET /health devolvió HTTP $code (se exige 200)"
  ok "GET /health -> 200"

  # 3) Token: se acepta uno inyectado; si no, se pide el demo (scope del reto).
  local token token_body
  token="${SMOKE_TOKEN:-}"
  if [ -z "$token" ]; then
    token_body="$(curl -sS --max-time 15 -X POST "$base/v1/auth/token" \
      -H 'content-type: application/json' \
      -d '{"scope":"endorse:translate"}' 2>/dev/null || true)"
    token="$(printf '%s' "$token_body" | jq -r '.token // empty' 2>/dev/null || true)"
    [ -n "$token" ] \
      || smoke_fail "POST /v1/auth/token no emitió token (¿ENABLE_DEMO_TOKEN=false? define SMOKE_TOKEN). Body: $token_body"
  fi
  ok "token de smoke disponible"

  # 4) /v1/templates: ESTE es el contrato que debe romper el smoke.
  local tmp status body count codes invalid
  tmp="$(mktemp "${TMPDIR:-/tmp}/smoke-templates.XXXXXX")"
  status="$(curl -sS --max-time 20 -o "$tmp" -w '%{http_code}' \
    "$base/v1/templates" -H "authorization: Bearer ${token}" 2>/dev/null || true)"
  body="$(cat "$tmp")"
  rm -f "$tmp"

  [ "$status" = "200" ] \
    || smoke_fail "GET /v1/templates devolvió HTTP $status (se EXIGE 200). Body: $body"
  printf '%s' "$body" | jq -e 'type == "array"' >/dev/null 2>&1 \
    || smoke_fail "GET /v1/templates no devolvió un array JSON. Body: $body"
  count="$(printf '%s' "$body" | jq -r 'length')"
  [ "$count" = "2" ] \
    || smoke_fail "GET /v1/templates devolvió $count plantilla(s); se EXIGEN 2. Body: $body"
  codes="$(printf '%s' "$body" | jq -r '[.[].productCode] | sort | join(",")')"
  [ "$codes" = "AUTO,RUMBO" ] \
    || smoke_fail "catálogo inesperado: [$codes]; se esperan [AUTO,RUMBO]. Body: $body"
  invalid="$(printf '%s' "$body" | jq -r '
    [.[] | select(
      (.productCode | type) != "string" or
      (.productName | type) != "string" or
      (.endorsementTypeCode | type) != "string" or
      (.endorsementTypeName | type) != "string" or
      (.fieldCount | type) != "number" or
      .fieldCount <= 0
    )] | length' 2>/dev/null || echo 'ERROR')"
  [ "$invalid" = "0" ] \
    || smoke_fail "hay $invalid plantilla(s) con forma inválida o fieldCount <= 0. Body: $body"
  ok "GET /v1/templates -> 200 con 2 plantillas ($codes) y fieldCount > 0"

  # 5) /v1/endorse/translate: el catálogo prueba que la plantilla EXISTE; este
  #    POST prueba que el contenedor la TRADUCE. Es donde vive el guard de
  #    `source_key`, así que es el único check que detecta ese 500 en vivo.
  smoke_translate "$base" "$token"

  # 6) CORS del navegador (solo si el backend ya tiene CORS configurado).
  if service_exists "$SERVICE_FRONTEND"; then
    local frontend allow_origin
    frontend="$(canonical_url "$SERVICE_FRONTEND")"
    if [ -n "$cors_env" ]; then
      allow_origin="$(curl -sS -o /dev/null -D - --max-time 15 -X OPTIONS \
        "$base/v1/templates" \
        -H "Origin: ${frontend}" \
        -H 'Access-Control-Request-Method: GET' \
        -H 'Access-Control-Request-Headers: authorization' 2>/dev/null \
        | tr -d '\r' \
        | awk 'tolower($1) == "access-control-allow-origin:" {print $2}' \
        | head -n1)"
      [ "$allow_origin" = "$frontend" ] \
        || smoke_fail "CORS roto: OPTIONS /v1/templates con Origin $frontend devolvió Access-Control-Allow-Origin '${allow_origin:-<vacío>}'. Ejecuta ./deploy-gcp.sh update-cors."
      ok "CORS: preflight /v1/templates permite $frontend"
    else
      warn "CORS_ORIGINS vacío en $SERVICE_ENDORSEMENTS: la UI fallará en el navegador hasta ./deploy-gcp.sh update-cors"
    fi
  fi

  ok "SMOKE OK: /v1/templates 200 con 2 plantillas y /v1/endorse/translate traduce"
}

# Redespliegue reproducible sin reinyectar secretos: reconstruye las imágenes
# con el TAG actual, actualiza los 3 servicios conservando env/CORS/límites y
# termina con el smoke estricto. Si /v1/templates no da 200 con 2 plantillas o
# si /v1/endorse/translate no traduce (200 + dynamicData + eventAppliedEntities),
# el comando falla (no se declara el entorno sano).
cmd_redeploy() {
  require_gcloud
  require_common
  cmd_build
  cmd_deploy_backends
  cmd_deploy_frontend
  cmd_update_cors
  SMOKE_EXPECT_IMAGE="$AR_HOST/$IMAGE_ENDORSEMENTS:$TAG" cmd_smoke
}

cmd_urls() {
  require_gcloud
  require_common
  local e="" r="" f=""
  # Se comprueba la existencia del servicio y luego se construye la URL larga
  # canónica: `status.url` devolvería la corta y desalinearía CORS.
  if gcloud run services describe "$SERVICE_ENDORSEMENTS" \
    --project "$PROJECT_ID" --region "$REGION" >/dev/null 2>&1; then
    e="$(canonical_url "$SERVICE_ENDORSEMENTS")"
  fi
  if gcloud run services describe "$SERVICE_ROUTES" \
    --project "$PROJECT_ID" --region "$REGION" >/dev/null 2>&1; then
    r="$(canonical_url "$SERVICE_ROUTES")"
  fi
  if gcloud run services describe "$SERVICE_FRONTEND" \
    --project "$PROJECT_ID" --region "$REGION" >/dev/null 2>&1; then
    f="$(canonical_url "$SERVICE_FRONTEND")"
  fi

  echo "endorsements: ${e:-<no desplegado>}"
  echo "routes:       ${r:-<no desplegado>}"
  echo "frontend:     ${f:-<no desplegado>}"

  if [ -n "$e" ] && [ -n "$r" ] && [ -n "$f" ]; then
    URL_ENDORSEMENTS="$e"
    URL_ROUTES="$r"
    URL_FRONTEND="$f"
    write_state
    echo "(URLs largas canónicas: coinciden con el Origin que envía el navegador)"
  fi
}

cmd_logs() {
  require_gcloud
  require_common
  local service="${1:-$SERVICE_ENDORSEMENTS}"
  gcloud run services logs read "$service" \
    --project "$PROJECT_ID" --region "$REGION" --limit=50 --quiet
}

# Orden definitivo: preflight → ensure-ar → bootstrap-db → build → deploy →
# urls → update-cors → smoke. `update-cors` va antes del smoke porque necesita
# la URL del frontend, que solo existe después de `deploy`; el smoke verifica
# además que esa CORS quedó alineada con el Origin real del navegador.
cmd_all() {
  cmd_preflight
  cmd_ensure_ar
  cmd_bootstrap_db
  cmd_build
  cmd_deploy_backends
  cmd_deploy_frontend
  cmd_urls
  cmd_update_cors
  SMOKE_EXPECT_IMAGE="$AR_HOST/$IMAGE_ENDORSEMENTS:$TAG" cmd_smoke
}

usage() {
  cat <<'USAGE'
Uso: ./deploy-gcp.sh <subcomando>

  preflight       Verifica billing y habilita las 4 APIs
  ensure-ar       Crea/valida el repositorio de Artifact Registry
  bootstrap-db    Crea esquema (synchronize) + seed contra Neon (endpoint directo)
  build           Build+push de endorsements y routes
  deploy          Despliega backends y frontend en Cloud Run + smoke estricto
  redeploy        Build+deploy de los 3 conservando env/CORS + smoke estricto
  smoke           Exige /v1/templates → 200 con 2 plantillas y
                  POST /v1/endorse/translate → 200 (traducción real)
  urls            Imprime las URLs públicas
  update-cors     Fija CORS_ORIGINS de los backends a la URL larga canónica del frontend
  logs [servicio] Logs recientes (por defecto endorsements)
  all             Ejecuta preflight → ensure-ar → bootstrap-db → build → deploy
                  → urls → update-cors → smoke
  help            Muestra esta ayuda

Variables obligatorias para el primer deploy / bootstrap-db: DB_HOST_POOLED,
DB_HOST_DIRECT, DB_NAME, DB_USER, DB_PASSWORD, JWT_SECRET. Opcionales:
PROJECT_ID, REGION, AR_REPO, TAG, CORS_ORIGINS, ENABLE_DEMO_TOKEN,
DEMO_TOKEN_TTL_*, SMOKE_TOKEN, etc.
`redeploy` y `smoke` no necesitan DB_*/JWT_SECRET si los servicios ya existen:
reutilizan la configuración de Cloud Run. El smoke pide un token demo salvo que
definas SMOKE_TOKEN. Requiere curl, jq y awk.
DB_PASSWORD y JWT_SECRET se leen del entorno y se envían a Cloud Run con
--set-env-vars (ver la cabecera del script para el trade-off).
USAGE
}

main() {
  local command="${1:-}"
  # Primero de todo: gcloud nunca debe esperar input interactivo.
  disable_prompts
  case "$command" in
    preflight)      cmd_preflight ;;
    ensure-ar)      cmd_ensure_ar ;;
    bootstrap-db)   cmd_bootstrap_db ;;
    build)          cmd_build ;;
    deploy)
      cmd_deploy_backends
      cmd_deploy_frontend
      SMOKE_EXPECT_IMAGE="$AR_HOST/$IMAGE_ENDORSEMENTS:$TAG" cmd_smoke
      ;;
    redeploy)       cmd_redeploy ;;
    smoke)          cmd_smoke ;;
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

# Se ejecuta como script, pero admite `source` sin disparar `main`: así la prueba
# de dientes de `smoke_translate` ejercita EXACTAMENTE el mismo código que corre
# en producción, en lugar de una copia que podría divergir.
if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  main "$@"
fi
