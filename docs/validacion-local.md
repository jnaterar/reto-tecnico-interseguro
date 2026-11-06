# Guía de validación local (pre-merge y pre-despliegue)

Procedimiento reproducible para comprobar que el repositorio está sano **antes** de fusionar a `main` o de redesplegar a Cloud Run. Está pensado para los casos en que se cambian dependencias, runtimes o imágenes base: si los tres bloques pasan en verde, el artefacto que se construye desde el árbol de trabajo es el mismo que se validó.

- Pre-requisitos: Docker Desktop en ejecución, Node 22.23.4 (ver [`.nvmrc`](../.nvmrc)), Go 1.26+, `curl`, `jq` y `git`.
- Tiempo estimado: 6–10 min (el primer `docker compose up --build` tarda más porque reinstala capas).
- Relacionado: [auditoría de seguridad](./auditoria-seguridad.md) · [pipeline de despliegue](../deploy-gcp.sh).

---

## 0. Preflight (30 s)

```bash
# Rama y árbol de trabajo
git status --short && git branch --show-current

# Runtime de Node alineado con engines (backend ^22.13.0 || >=24.11.0, frontend ^22.12.0 || >=24.0.0)
nvm use 2>/dev/null || true
node -v

# Go disponible y con la versión del módulo (go 1.26.0)
go version

# Docker arriba
docker info >/dev/null 2>&1 && echo "docker OK" || echo "docker DOWN"

# Puertos que deben estar LIBRES antes de levantar el stack
for p in 5433 8080 8081 8082 5173; do
  printf "%-5s -> %s\n" "$p" "$(lsof -ti:$p | tr '\n' ' ' || true)"
done
```

Si algún puerto aparece ocupado, libéralo antes de continuar:

```bash
lsof -ti:5173 | xargs kill 2>/dev/null || true
```

> `localhost:5173` es el dev-server de Vite y **no** forma parte del stack de Docker. Si quedó un `vite` huérfano, `docker compose down` no lo mata.

---

## 1. Bloque 1 — Dependencias y gates de calidad

Instala exactamente lo que dicen los lockfiles (`npm ci`, no `npm install`) y ejecuta los mismos gates que el build de producción.

```bash
set -euo pipefail

# --- Backend Hapi (TypeScript) ---
cd backend-endorsements-hapi
npm ci
npm run typecheck
npm test
npm run build

# --- Frontend (Vite + React) ---
# Nota: el frontend no tiene suite de pruebas; su gate es typecheck + build.
cd ../frontend-monolith
npm ci
npm run typecheck
npm run build

# --- Backend Go ---
cd ../backend-routes-golang
go vet ./...
go test -cover ./...

# --- Gates SCA locales (no bloqueantes) ---
cd ..
bash scripts/sca.sh
```

Criterio de aceptación del bloque:

| Gate | Resultado esperado |
| --- | --- |
| `backend-endorsements-hapi` · `typecheck` + `build` | 0 errores de TypeScript, `dist/` generado |
| `backend-endorsements-hapi` · `test` | 38 tests en verde |
| `frontend-monolith` · `typecheck` + `build` | 0 errores, `dist/` generado (no hay suite de tests en este paquete) |
| `backend-routes-golang` · `vet` + `test` | sin hallazgos, pruebas en verde |
| [`scripts/sca.sh`](../scripts/sca.sh:1) | 0 advisories en dependencias de producción |

> `scripts/sca.sh` no recibe argumentos: recorre por sí solo ambos servicios Node y ejecuta `govulncheck` si está instalado. Es un gate informativo, por eso se ejecuta **al final** para no abortar el bloque.

**Trampa frecuente:** tras cambiar de rama con lockfiles distintos (por ejemplo `main` con Vite 6 y `develop` con Vite 8) hay que volver a ejecutar `npm ci` en ambos servicios. Un `node_modules` heredado produce errores que parecen de código y son de árbol de dependencias.

---

## 2. Bloque 2 — Stack completo con Docker Compose

Reconstruye desde cero (`down -v` elimina también el volumen de PostgreSQL) y comprueba salud de los cuatro servicios.

```bash
docker compose down -v --remove-orphans
docker compose up -d --build
sleep 10
docker compose ps --format '{{.Name}}\t{{.State}}\t{{.Status}}'
```

Los cuatro servicios deben reportar `running` con `(healthy)`:

```text
interseguro-db            running   Up ... (healthy)
interseguro-endorsements  running   Up ... (healthy)
interseguro-routes        running   Up ... (healthy)
interseguro-frontend      running   Up ... (healthy)
```

Verificación de endpoints de salud (cada servicio publica `/health`; solo nginx expone `/healthz`):

```bash
curl -s -o /dev/null -w '8080 /health  -> %{http_code}\n' http://localhost:8080/health
curl -s -o /dev/null -w '8081 /health  -> %{http_code}\n' http://localhost:8081/health
curl -s -o /dev/null -w '8082 /health  -> %{http_code}\n' http://localhost:8082/health
curl -s -o /dev/null -w '8080 /healthz -> %{http_code}\n' http://localhost:8080/healthz

# Cuerpos reales esperados
curl -s http://localhost:8080/healthz; echo   # ok
curl -s http://localhost:8081/health;  echo   # {"service":"routes-optimal","status":"ok","version":"v1"}
curl -s http://localhost:8082/health;  echo   # {"status":"ok","service":"endorsements-translator","version":"v1"}
```

> **`/healthz` funciona en local pero no en Cloud Run.** En local el tráfico va directo a nginx y `/healthz` responde `ok`. En Cloud Run esa ruta la intercepta Google Frontend antes de llegar al contenedor y devuelve un `404` HTML de Google (`Error 404 (Not Found)!!1`), mientras que cualquier ruta inexistente de la SPA responde `200` por el *fallback* de nginx. Para comprobar el frontend desplegado usa `/` (200) y para los backends su `/health` (200).

> El servicio `seed` es de un solo uso: aparece y termina con código 0 tras cargar las plantillas `RUMBO/CAMBIO_FRECUENCIA` (12 campos) y `AUTO/CAMBIO_FRECUENCIA` (7 campos). Compruébalo con `docker compose logs seed | tail -5`.

**`down` vs `down -v`:** `docker compose down` conserva el volumen `db_data` y es lo correcto para reinicios rápidos; `down -v` lo borra y obliga a re-sembrar. Usa `-v` solo cuando quieras un estado limpio de verdad.

---

## 3. Bloque 3 — Humo funcional end-to-end por nginx

Todo el tráfico pasa por `http://localhost:8080`, que enruta `/endorse-api/*` al servicio Hapi (8082) y `/routes-api/*` al servicio Go (8081). Esto reproduce lo que hace la SPA.

```bash
set -euo pipefail

# 1) Token de endorsements (ruta real: POST /v1/auth/token, body {} es válido)
TOKEN=$(curl -s -X POST http://localhost:8080/endorse-api/v1/auth/token \
  -H 'Content-Type: application/json' -d '{}' \
  | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')
echo "endorse token_len=${#TOKEN}"   # 192

# 2) Catálogo de plantillas
curl -s http://localhost:8080/endorse-api/v1/templates -H "Authorization: Bearer $TOKEN"; echo

# 3) Traducción de endoso RUMBO/CAMBIO_FRECUENCIA
curl -s -X POST http://localhost:8080/endorse-api/v1/endorse/translate \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"policyNumber":"08200000049","idEnvio":5984,"frecuencia":"Semestral",
       "tipoEndoso":"CAMBIO_FRECUENCIA","producto":"RUMBO","plan":"PlanRumbo",
       "moneda":"Nuevo Sol","usuario":"interface.servicios",
       "fechaSolicitud":"2025-08-27","fechaCliente":"2025-08-27","fechaEfectiva":"2025-09-01"}' \
  | jq '{campos: (.eventEntity.dynamicData | length), eventos: (.eventAppliedEntities | length)}'

# 4) Token de routes
RTOKEN=$(curl -s -X POST http://localhost:8080/routes-api/v1/auth/token \
  -H 'Content-Type: application/json' -d '{}' \
  | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')
echo "routes token_len=${#RTOKEN}"   # 188

# 5) Ruta óptima
curl -s -X POST http://localhost:8080/routes-api/v1/routes/optimal \
  -H "Authorization: Bearer $RTOKEN" -H 'Content-Type: application/json' \
  -d '{"accidentLocation":"A","depots":["D1","D2"],
       "graph":{"A":{"B":1},"B":{"D1":2},"D2":{"Z":50}}}'; echo

# 6) Control de acceso: sin token debe ser 401
curl -s -o /dev/null -w 'templates sin token -> %{http_code}\n' \
  http://localhost:8080/endorse-api/v1/templates

# 7) Cabeceras de seguridad del borde
curl -sI http://localhost:8080/ | grep -Ei 'content-security-policy|strict-transport-security|^server:'
```

Salidas esperadas (verificadas en este repositorio):

| Comprobación | Resultado esperado |
| --- | --- |
| `POST /endorse-api/v1/auth/token` | 200, JWT de 192 caracteres |
| `GET /endorse-api/v1/templates` | 200, `AUTO` (7 campos) y `RUMBO` (12 campos) |
| `POST /endorse-api/v1/endorse/translate` con `RUMBO` | 200, `campos = 12`, `eventos = 2`, primer evento `SolicitarEndoso` |
| `POST /endorse-api/v1/endorse/translate` con `AUTO` | 200, `campos = 7`, `eventos = 2` |
| `POST /routes-api/v1/auth/token` | 200, JWT de 188 caracteres |
| `POST /routes-api/v1/routes/optimal` | 200, `{"fromDepot":"D1","to":"A","path":["D1","B","A"],"distance":3}` |
| `GET /endorse-api/v1/templates` sin `Authorization` | **401** |
| Cabeceras de `GET /` | `Server: nginx`, `Content-Security-Policy` con `default-src 'self'`, `Strict-Transport-Security: max-age=31536000` |

> **Ojo con `dynamicData`:** en la respuesta de `translate` los campos no están en la raíz, sino anidados en `eventEntity.dynamicData`. Un `jq '.dynamicData | length'` devuelve `0` aunque la traducción sea correcta. Usa `.eventEntity.dynamicData`.

> **Ojo con los códigos:** el servicio resuelve la plantilla por los códigos sembrados (`RUMBO`, `AUTO`, `CAMBIO_FRECUENCIA`). Enviar `"producto":"Rumbo"` no rompe la petición, pero conviene usar los códigos para que el humo sea determinista.

---

## 4. Desarrollo con HMR sobre el stack

Si lo que necesitas es editar la SPA sin reconstruir el contenedor de nginx, levanta solo los backends y usa Vite en el host:

```bash
docker compose up -d db endorsements routes seed
cd frontend-monolith && npm run dev   # http://localhost:5173
```

El proxy de Vite reescribe `/endorse-api` → `http://localhost:8082` y `/routes-api` → `http://localhost:8081` (ver [`vite.config.ts`](../frontend-monolith/vite.config.ts:1)). Por eso, cuando un backend no está escuchando, Vite registra `http proxy error: /health` o `/v1/auth/token` **sin** el prefijo: es el `rewrite` actuando, no una ruta mal escrita.

---

## 5. Problemas conocidos y cómo salir de ellos

| Síntoma | Causa | Solución |
| --- | --- | --- |
| `AggregateError [ECONNREFUSED]` en `/health` y `/v1/auth/token` con `npm run dev` | Los backends no están escuchando en 8081/8082 (stack abajo) | `docker compose up -d db endorsements routes seed`, luego repetir |
| `EADDRINUSE` en 5173 | Vite huérfano de una sesión anterior | `lsof -ti:5173 \| xargs kill` |
| Errores de tipos/imports incomprensibles tras cambiar de rama | `node_modules` de otra rama | `npm ci` en `frontend-monolith` y `backend-endorsements-hapi` |
| `docker compose ps` muestra servicios `running` sin `(healthy)` | El `healthcheck` aún no ha alcanzado el periodo de gracia | Esperar 10–15 s y repetir; revisar `docker compose logs <servicio>` |
| Tras `down -v` no hay plantillas y `translate` devuelve 404 | El servicio `seed` no ha corrido | `docker compose up -d seed` y revisar `docker compose logs seed` |
| Arrancar el contenedor Hapi a mano falla por `JWT_SECRET` | Variable obligatoria fuera de Compose | Definir `JWT_SECRET` y `DATABASE_URL` en el entorno |

---

## 6. Orden recomendado antes de desplegar

1. `git switch main && git pull --ff-only` (o la rama que vayas a publicar) y confirmar `git status` limpio.
2. Bloque 1 → Bloque 2 → Bloque 3 de esta guía, sin omitir el `down -v` para no validar con datos viejos.
3. Capturar las revisiones que hoy atienden tráfico (rollback de un comando):

   ```bash
   gcloud run services describe endorsements --region us-central1 \
     --format='value(status.traffic[0].revisionName)'
   gcloud run services describe routes --region us-central1 \
     --format='value(status.traffic[0].revisionName)'
   gcloud run services describe frontend --region us-central1 \
     --format='value(status.traffic[0].revisionName)'
   ```

4. Desplegar con una etiqueta explícita y estable: `TAG=v1.0.0 ./deploy-gcp.sh redeploy`.

   > [`deploy-gcp.sh`](../deploy-gcp.sh:353) construye con `gcloud builds submit` **desde el árbol de trabajo local**, no desde git. Si hay cambios sin commitear o estás en la rama equivocada, se despliega eso. Valida siempre con el árbol limpio.

5. Si el smoke del despliegue falla, revertir tráfico a la revisión capturada en el paso 3:

   ```bash
   gcloud run services update-traffic <servicio> --region us-central1 --to-revisions <REVISION>=100
   ```

---

## 7. Bloque único de copiar y pegar

```bash
set -euo pipefail

# --- Bloque 1: dependencias y gates ---
(cd backend-endorsements-hapi && npm ci && npm run typecheck && npm test && npm run build)
(cd frontend-monolith && npm ci && npm run typecheck && npm run build)
(cd backend-routes-golang && go vet ./... && go test -cover ./...)
bash scripts/sca.sh

# --- Bloque 2: stack limpio + salud ---
docker compose down -v --remove-orphans
docker compose up -d --build
sleep 10
docker compose ps --format '{{.Name}}\t{{.State}}\t{{.Status}}'
for p in 8080 8081 8082; do printf "%s /health -> " "$p"; curl -s -o /dev/null -w '%{http_code}\n' "http://localhost:$p/health"; done

# --- Bloque 3: humo funcional ---
TOKEN=$(curl -s -X POST http://localhost:8080/endorse-api/v1/auth/token -H 'Content-Type: application/json' -d '{}' | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')
RTOKEN=$(curl -s -X POST http://localhost:8080/routes-api/v1/auth/token -H 'Content-Type: application/json' -d '{}' | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')
echo "tokens: endorse=${#TOKEN} routes=${#RTOKEN}"
curl -s -X POST http://localhost:8080/endorse-api/v1/endorse/translate -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"policyNumber":"08200000049","idEnvio":5984,"frecuencia":"Semestral","tipoEndoso":"CAMBIO_FRECUENCIA","producto":"RUMBO","plan":"PlanRumbo","moneda":"Nuevo Sol","usuario":"interface.servicios","fechaSolicitud":"2025-08-27","fechaCliente":"2025-08-27","fechaEfectiva":"2025-09-01"}' \
  | jq '{campos: (.eventEntity.dynamicData | length), eventos: (.eventAppliedEntities | length)}'
curl -s -X POST http://localhost:8080/routes-api/v1/routes/optimal -H "Authorization: Bearer $RTOKEN" -H 'Content-Type: application/json' \
  -d '{"accidentLocation":"A","depots":["D1","D2"],"graph":{"A":{"B":1},"B":{"D1":2},"D2":{"Z":50}}}'; echo
curl -s -o /dev/null -w 'templates sin token -> %{http_code}\n' http://localhost:8080/endorse-api/v1/templates
```

---

## 8. Evidencia de la ejecución de referencia

Salida real obtenida al ejecutar el bloque 7 completo sobre `main` en `v1.0.0` (2026-11-06, macOS, Node 22.23.4):

```text
1/3 gates backend OK
1/3 gates frontend OK
1/3 gates go OK
sca exit=0 (no bloqueante)
  OK    sin vulnerabilidades moderadas o superiores
  WARN  govulncheck no instalado: go install golang.org/x/vuln/cmd/govulncheck@latest
Resultado: sin hallazgos que bloqueen en dependencias de producción.
2/3 compose up OK
interseguro-db            running   Up 21 seconds (healthy)
interseguro-endorsements  running   Up 15 seconds (healthy)
interseguro-frontend      running   Up 10 seconds (healthy)
interseguro-routes        running   Up 21 seconds (healthy)
8080 /health -> 200
8081 /health -> 200
8082 /health -> 200
3/3 tokens: endorse=192 routes=188
{"campos":12,"eventos":2}
{"fromDepot":"D1","to":"A","path":["D1","B","A"],"distance":3}
templates sin token -> 401
```

Si tu salida difiere en los conteos (`campos`, `eventos`), revisa el orden de los pasos: el `down -v` es lo que garantiza que las plantillas vienen del `seed` de esta ejecución y no de un volumen anterior.

---

## 9. Redespliegue y verificación en producción

Flujo ejecutado el 2026-11-06 sobre `main` con la etiqueta `v1.0.0`. El orden importa: primero se capturan las revisiones que atienden tráfico, porque [`deploy-gcp.sh`](../deploy-gcp.sh:233) **no usa `--no-traffic`** — el tráfico cambia en cuanto la revisión nueva queda lista y el smoke valida después.

```bash
# 0) Capturar revisiones vivas ANTES de tocar nada (rollback de un comando)
for s in endorsements routes frontend; do
  gcloud run services describe "$s" --region us-central1 \
    --format="value(status.traffic[0].revisionName, spec.template.spec.containers[0].image)"
done

# 1) Secretos del operador (deploy.env.sh no se versiona) y despliegue con etiqueta estable
set -a; . ./deploy.env.sh; set +a
TAG=v1.0.0 ./deploy-gcp.sh redeploy

# 2) Verificar los TRES servicios (el smoke del script solo cubre endorsements)
E=https://endorsements-919990628042.us-central1.run.app
R=https://routes-919990628042.us-central1.run.app
F=https://frontend-919990628042.us-central1.run.app
curl -s -o /dev/null -w 'frontend   /       -> %{http_code}\n' "$F/"
curl -s -o /dev/null -w 'endorse    /health -> %{http_code}\n' "$E/health"
curl -s -o /dev/null -w 'routes     /health -> %{http_code}\n' "$R/health"

# 3) Rollback si el smoke falla
gcloud run services update-traffic <servicio> --region us-central1 --to-revisions <REVISION>=100
```

`redeploy` encadena: build de los dos backends (`gcloud builds submit` **desde el árbol de trabajo**, no desde git) → deploy de backends → build y deploy del frontend con las `VITE_*` → `update-cors` con la URL larga canónica → smoke estricto con `SMOKE_EXPECT_IMAGE`.

Evidencia de la ejecución:

| Servicio | Revisión sirviendo 100% | Imagen |
| --- | --- | --- |
| `endorsements` | `endorsements-00009-jsb` | `.../interseguro-reto/endorsements:v1.0.0` |
| `routes` | `routes-00009-8k5` | `.../interseguro-reto/routes:v1.0.0` |
| `frontend` | `frontend-00004-f8m` | `.../interseguro-reto/frontend:v1.0.0` |

| Comprobación en producción | Resultado |
| --- | --- |
| `GET /` del frontend | 200 con `Content-Security-Policy` y `Strict-Transport-Security: max-age=31536000` |
| `POST /v1/auth/token` (endorsements y routes) | 200, tokens de 192 y 188 caracteres |
| `POST /v1/endorse/translate` (`RUMBO`) | 200, `campos = 12`, `eventos = 2` |
| `POST /v1/routes/optimal` | 200, `distance = 3`, ruta `D1 → B → A` |
| `GET /v1/templates` sin token | 401 |
| CORS con `Origin` del frontend | `access-control-allow-origin` = URL larga canónica |
| CORS con `Origin: https://evil.example.com` | sin `access-control-allow-origin` |

Las revisiones anteriores (`endorsements-00007-28d`, `routes-00007-rgp`, `frontend-00003-tmq`, todas con imagen `:4660882`) siguen existiendo y son el destino del rollback si hiciera falta revertir.
