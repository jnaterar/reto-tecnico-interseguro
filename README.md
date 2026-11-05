# Reto Técnico — Interseguro (Technical Lead / Software Architect)

Monorepo con los cuatro entregables: **traductor de endosos data-driven** (Node + Hapi + Postgres), **ruta óptima de grúa** (Go + Dijkstra), **frontend unificado** en dos pestañas y el **análisis de arquitectura** del flujo de préstamos.
Los tres artefactos ejecutables levantan con `docker compose up --build`; el cuarto es un documento técnico con diagramas editables.
Todas las cifras de verificación de este README provienen de comandos ejecutados sobre este repositorio, no de estimaciones.

| Reto | Entregable | Código | Verificación real |
|---|---|---|---|
| 1 | Traductor de endosos `POST /v1/endorse/translate` con plantillas **en BD** | [`backend-endorsements-hapi/`](backend-endorsements-hapi) | `npm run typecheck` + **20/20 tests** verdes |
| 2 | Rutas óptimas de grúa (Dijkstra, grafo **no dirigido**) | [`backend-routes-golang/`](backend-routes-golang) | `go build ./...`, `go vet ./...`, `go test ./...` verdes |
| 3 | Arquitectura de préstamos: idempotencia, saga, reconciliación | [`architecture-drawio/architecture.md`](architecture-drawio/architecture.md) | Documento + diagramas `.drawio` + Mermaid |
| 4 | Frontend unificado (dos pestañas, TS estricto) | [`frontend-monolith/`](frontend-monolith) | `tsc --noEmit && vite build` verde |

---

## 0. PRIORIZACIÓN DECLARADA

El orden no fue casual: primero lo que **se puede romper en silencio**, después lo que se ve.

| Orden | Qué prioricé | Por qué | Estado |
|---|---|---|---|
| 1 | **Correctitud del Reto 1** (plantillas en BD, orden, `'Default'` vs `''`, errores tipados) | Es donde un atajo se ve bien en la demo y falla en producción: un `if (producto === 'Rumbo')` habría pasado la demo, no la revisión | Completo + 20 tests |
| 2 | **Correctitud del Reto 2** (grafo no dirigido, empates, bases aisladas, nodo inexistente, pesos negativos) | Cinco de las seis trampas producen **resultados incorrectos sin error**: el peor tipo de bug | Completo + tabla de tests |
| 3 | **Frontend que demuestra los dos backends** (textarea → traducir; selector + checklist → calcular) | Sin esto los retos no son verificables por un tercero en 60 segundos | Completo + `build` verde |
| 4 | **Profundidad del Reto 3** (contrato de idempotencia, saga, máquina de estados, costo) | Es un problema de arquitectura, no de código: la decisión se defiende con el documento | Completo |
| 5 | **Infra y narrativa** (`docker compose`, healthchecks, este README, despliegue) | Reduce el costo de evaluar y de operar; lo dejé al final a propósito | Completo (despliegue documentado, no ejecutado) |

**Recortes conscientes** (declarados, no olvidados):

- Sin tests automatizados de frontend: el presupuesto de pruebas se gastó donde hay lógica de negocio (mapper puro + algoritmo + contratos HTTP).
- Sin despliegue cloud ejecutado: no hay cuenta/proyecto disponible. La guía es reproducible paso a paso y cada comando está explicado.

Los diagramas del Reto 3 no son un recorte: se entregan `.drawio` (fuente editable) **y** `.png`
ya generados a 2× con fondo blanco desde el propio XML vía
[`render_drawio.py`](architecture-drawio/render_drawio.py), porque el entorno no tiene *drawio CLI*.

---

## 1. Arranque en un comando

```bash
docker compose up --build
```

| Servicio | URL | Notas |
|---|---|---|
| `frontend` | http://localhost:8080 | nginx sirve la SPA y proxya `/endorse-api` y `/routes-api` |
| `endorsements` | http://localhost:8082/health | Reto 1 · Hapi + TypeORM |
| `routes` | http://localhost:8081/health | Reto 2 · Go puro (sin dependencias externas) |
| `db` | localhost:**5433** | PostgreSQL 16 (5433 para no chocar con un Postgres local) |
| `seed` | — | Contenedor **one-shot**: siembra las plantillas y termina |

```
navegador ──▶ frontend (nginx :8080)
                 ├── /endorse-api/* ──▶ endorsements:8082 ──▶ db:5432
                 └── /routes-api/*  ──▶ routes:8081
                        seed (efímero) ──▶ db:5432
```

El frontend usa **rutas relativas**: nginx (Docker) y el proxy de Vite (desarrollo) resuelven el backend.
No hay URLs absolutas ni CORS en el navegador en local.

El orden de arranque lo garantizan healthchecks reales, no `sleep`:
`db` → `endorsements` (TypeORM crea las tablas) → `seed` (inserta plantillas) y `frontend`.

> Estado de esta verificación: `docker compose config -q` se ejecutó y validó la sintaxis del compose.
> `docker compose up --build` **no** se ejecutó en este entorno; no se afirma lo contrario.

## 2. Ejecución local (sin Docker)

```bash
# 1) PostgreSQL
docker run --rm -p 5432:5432 -e POSTGRES_USER=interseguro \
  -e POSTGRES_PASSWORD=interseguro -e POSTGRES_DB=endorsements postgres:16-alpine

# 2) Reto 1 — API + seed
cd backend-endorsements-hapi
cp .env.example .env && npm install
npm run seed && npm run dev          # http://localhost:8082

# 3) Reto 2 — Go
cd backend-routes-golang && go run ./cmd/server   # http://localhost:8081

# 4) Frontend
cd frontend-monolith && npm install && npm run dev # http://localhost:5173
```

---

## 3. Reto 1 — Traductor de endosos

**Problema.** El core espera un JSON estructurado y ordenado; la interfaz envía un JSON plano.
El mapeo entre ambos **no vive en el código**: vive en la base de datos.

**Decisión clave.** `templates` + `template_fields` + `template_events` describen, por producto y
tipo de endoso, el orden y la etiqueta de cada campo de `dynamicData` y el orden de
`eventAppliedEntities`. Cada campo declara su origen:

| `source` | Significado |
|---|---|
| `INPUT` | Se toma de un campo del request (`source_key`) |
| `CONSTANT` | Valor fijo de negocio (`constant_value`) |
| `DEFAULT` | Valor por defecto (`default_value`) — `'Default'` y `''` son valores distintos |

Consecuencia: **agregar un producto o tipo de endoso no requiere tocar código ni desplegar**; es un `INSERT`
(la semilla ya incluye `AUTO`/`CambioFrecuencia` además de `Rumbo`, y hay un test que lo prueba sin tocar el mapper).

### Contrato

`POST /v1/endorse/translate` · `Authorization: Bearer <jwt>` · responde `x-api-version: v1`

```json
{
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
}
```

Respuesta real (el orden de propiedades es significativo para el core; hay test que lo fija):

```json
{
  "policyNumber": "08200000049",
  "idEnvio": 5984,
  "financialPlansEntity": { "description": "Semestral" },
  "currency": { "description": "Nuevo Sol" },
  "productEntity": { "description": "Rumbo" },
  "eventEntity": {
    "description": "SolicitarEndoso",
    "dynamicData": [
      { "etiqueta": "ProductosVida", "value": "Rumbo" },
      { "etiqueta": "NombreUsuario", "value": "interface.servicios" },
      { "etiqueta": "NumeroPolizaEndoso", "value": "08200000049" },
      { "etiqueta": "TipoEndosoPol", "value": "Endoso Simple" },
      { "etiqueta": "ResponsableAtencion", "value": "SAC" },
      { "etiqueta": "EndosoModifPrima", "value": "Si" },
      { "etiqueta": "InicioVigenciaEndoso", "value": "Default" },
      { "etiqueta": "TipoVigenciaEndoso", "value": "" },
      { "etiqueta": "EndososSimplesSACRumbo", "value": "TES008" },
      { "etiqueta": "FechaSolicitud", "value": "2025-08-27" },
      { "etiqueta": "FechaCliente", "value": "2025-08-27" },
      { "etiqueta": "FechaEfectiva", "value": "2025-09-01" }
    ]
  },
  "eventAppliedEntities": [
    { "description": "SolicitarEndoso", "orderEvent": 1 },
    { "description": "AprobarEndoso", "orderEvent": 2 }
  ],
  "riskUnitEntities": [
    {
      "insuranceObjectEntities": [
        { "insuranceObjectNumber": "1", "coverageEntities": [], "participationEntities": [] }
      ],
      "plansEntity": { "description": "PlanRumbo" },
      "riskUnitNumber": "1"
    }
  ],
  "participationEntities": []
}
```

```bash
TOKEN=$(curl -s -X POST localhost:8082/v1/auth/token \
  -H 'Content-Type: application/json' -d '{}' | sed -E 's/.*"token":"([^"]+)".*/\1/')

curl -s -X POST localhost:8082/v1/endorse/translate \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"policyNumber":"08200000049","idEnvio":5984,"frecuencia":"Semestral",
       "tipoEndoso":"CambioFrecuencia","producto":"Rumbo","plan":"PlanRumbo",
       "moneda":"Nuevo Sol","usuario":"interface.servicios",
       "fechaSolicitud":"2025-08-27","fechaCliente":"2025-08-27",
       "fechaEfectiva":"2025-09-01"}'
```

### Arquitectura por capas

```
Routes (Joi) → Controller (HTTP) → Service (orquesta) → Repository (puerto)
             → TypeORM Adapter → Model ⇄ BD
             → Mapper (función pura) → Entity/DTO del core
```

El mapper recibe request + plantilla y devuelve el payload del core: se testea **sin HTTP y sin base de datos**.

### Errores (envelope común `{"error": {...}}`)

| Código | HTTP | Cuándo |
|---|---|---|
| `VALIDATION_ERROR` | 400 | Contrato inválido (incluye fechas imposibles o formato ≠ `YYYY-MM-DD`) |
| `UNAUTHORIZED` | 401 | JWT ausente, manipulado o expirado |
| `TEMPLATE_NOT_FOUND` | 404 | No hay plantilla para ese producto + tipo de endoso |
| `MISSING_FIELD_VALUE` | 422 | Falta un campo `INPUT` sin `default_value` |
| `TEMPLATE_CONFIG_INVALID` | 500 | La plantilla en BD es inconsistente (órdenes duplicados, `CONSTANT` sin valor, sin campos) |

Detalle completo, modelo de datos y SQL de extensibilidad:
[`backend-endorsements-hapi/README.md`](backend-endorsements-hapi/README.md).

---

## 4. Reto 2 — Ruta óptima de grúa

`POST /v1/routes/optimal` (JWT) recibe el accidente, las bases y el grafo; devuelve la **base más cercana
alcanzable**, el camino y la distancia. Capas: `httpapi (handler)` → `service (reglas)` → `domain (Dijkstra puro)`.

**La trampa principal: el grafo es no dirigido.** El payload declara aristas en un solo sentido
(`"Ate": {"Surco": 10}`), pero una vía se recorre en ambos. Con el grafo tal cual, bases alcanzables
quedan descartadas y el resultado es incorrecto **sin lanzar error**.
`domain.NewGraph` normaliza cada arista a doble sentido antes de calcular.

Ejemplo del frontend (grafo de distritos de Lima): accidente en **San Isidro**, bases **Miraflores** y **Ate**.

| Enfoque | Resultado |
|---|---|
| Grafo dirigido (como llega) | `San Isidro` solo saldría hacia `Lince` → Miraflores inalcanzable |
| Grafo normalizado (implementado) | `Miraflores` gana con **7** directo, frente a `Ate` con **20** (`Ate → Surco → Lince → San Isidro`) |

```bash
TOKEN=$(curl -s -X POST localhost:8081/v1/auth/token \
  -H 'Content-Type: application/json' -d '{}' | sed -E 's/.*"token":"([^"]+)".*/\1/')

curl -s -X POST localhost:8081/v1/routes/optimal \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"accidentLocation":"San Isidro","depots":["Miraflores","Ate"],
       "graph":{"Miraflores":{"San Isidro":7,"Barranco":3},
                "San Isidro":{"Miraflores":7,"Lince":4},
                "Barranco":{"Miraflores":3,"Surco":5},
                "Lince":{"San Isidro":4,"Surco":6},
                "Surco":{"Barranco":5,"Lince":6,"Ate":10},
                "Ate":{"Surco":10}}}'
```

### Las seis trampas y su tratamiento

| Trampa | Comportamiento implementado | Test (nombre exacto) |
|---|---|---|
| Grafo no dirigido | `NewGraph` agrega la arista inversa (conserva el menor peso si viene duplicada) | `TestShortestPath` → «grafo no dirigido: arista inversa no declarada en el input» |
| Base == accidente | Distancia `0`, camino `["Surco"]` | `TestFindOptimalRoute` → «base en el mismo distrito del siniestro» |
| Empate entre bases | Gana la **primera del input** (comparación estricta `<`), determinista | `TestFindOptimalRouteTieIsDeterministic` |
| Base aislada vs. accidente inalcanzable | Se evalúan **todas** las bases; una aislada no bloquea a otra alcanzable; error solo si **ninguna** llega | `TestFindOptimalRouteSkipsUnreachableDepot` + caso «ninguna base alcanza» de `TestFindOptimalRouteErrors` |
| Nodo inexistente (accidente **o** base) | `NODE_NOT_FOUND` (422), **distinto** de `UNREACHABLE`; se valida antes de calcular | `TestFindOptimalRouteErrors` → «depot inexistente en el grafo» |
| Pesos negativos | `VALIDATION_ERROR` (400) al construir el grafo | `TestNewGraphRejectsNegativeWeights` |

Los 20 tests de Go (40 casos contando subtests) cubren dominio (`TestShortestPath`,
`TestShortestPathErrors`, `TestNewGraphRejectsNegativeWeights`), servicio (`TestFindOptimalRoute*`),
contrato HTTP (`TestOptimalRouteRequiresJWT`, `TestOptimalRouteUnreachable`) y seguridad
(`TestCORSPreflightAllowsConfiguredOrigin`, `TestCORSPreflightRejectsUnknownOrigin`,
`TestCORSDoesNotEchoUnknownOriginOnSimpleRequest`, `TestDemoTokenRejectsArbitraryScope`,
`TestDemoTokenDefaultsToLimitedScope`, `TestOptimalRouteRejectsTokenWithWrongScope`).
Detalle: [`backend-routes-golang/README.md`](backend-routes-golang/README.md).

---

## 5. Reto 3 — Préstamos: el dinero se duplica al hacer clic dos veces

Conclusión del análisis: **no es un problema de timeouts, es un fallo de contrato de idempotencia**.
Un reintento del cliente (racional ante un 502) vuelve a ejecutar la dispersión.

Solución proporcional: `Idempotency-Key` persistida con estado de la operación + `UNIQUE` como control de
concurrencia + outbox/evento para el efecto irreversible + saga con compensación + máquina de estados +
reconciliación. Se eligió **Cloud Run + Pub/Sub** frente a Kafka/Kubernetes por costo y carga real
(≈600 préstamos/día), con el trade-off documentado.

Documento completo (AS-IS, TO-BE, idempotencia, saga, costos, Mermaid):
[`architecture-drawio/architecture.md`](architecture-drawio/architecture.md).

---

## 6. Frontend unificado

React 18 + TypeScript `strict` + Vite, sin librerías de UI (control total del bundle).
Una sola app con dos pestañas y estados `idle → loading → success | error` explícitos.

- **Pestaña «Traductor de endosos»**: `textarea` precargado con el JSON plano del enunciado, botón
  **Traducir**, pretty-print del JSON del core listo para copiar, panel de error legible y duración de la llamada.
- **Pestaña «Ruta óptima de grúa»**: `select` de distrito del accidente, **checklist** de bases
  (por defecto Miraflores + Ate, accidente San Isidro), botón **Calcular Ruta Óptima**, y resultado con
  `fromDepot`, `path` y `distance`. El grafo de Lima va en el payload y es visible en un desplegable.
- Píldoras de salud que consultan `/health` de ambos backends cada 15 s.
- `ApiError` con `status`/`code`/`details`/`isNetworkError`; el token JWT se cachea **en memoria** (nunca
  en `localStorage`, cookies ni URL).
- Las bases se envían en orden canónico de distrito, no en orden de clic: el empate del backend es determinista.

### Configuración

| Variable (build-time) | Default | Uso |
|---|---|---|
| `VITE_API_ENDORSEMENTS_URL` | `/endorse-api` | Base del Reto 1 |
| `VITE_API_ROUTES_URL` | `/routes-api` | Base del Reto 2 |

En local se usan rutas relativas (proxy de Vite / nginx). **En cloud se pasan las URLs públicas absolutas
y el navegador hace CORS directo contra cada backend** — por eso ambos backends exponen `CORS_ORIGINS` /
`CORS_ORIGIN`.

### Cómo sirve el frontend

| Contexto | Mecanismo |
|---|---|
| `npm run dev` | Proxy de Vite `/endorse-api` → `:8082`, `/routes-api` → `:8081` |
| Docker local | nginx: `location /endorse-api/ → endorsements:8082`, `/routes-api/ → routes:8081`, SPA fallback |
| Cloud | Build con URLs absolutas + CORS configurado en cada backend |

---

## 7. Decisiones y trade-offs

| Decisión | Alternativa descartada | Por qué |
|---|---|---|
| **Plantillas en BD** (`TEMPLATE`/`FIELD`/`EVENT`) | `switch` por producto en el código | Un producto nuevo pasa de "deploy" a `INSERT`; el mapper queda puro y testeable |
| **Grafo no dirigido por defecto** | Confiar en que el payload venga completo | La entrada describe vías urbanas; asumir dirección produce resultados incorrectos silenciosos |
| **Dijkstra con `container/heap`** | BFS por número de saltos / Floyd-Warshall | Costo O((V+E) log V), pesos arbitrarios, sin dependencias externas |
| **Error `NODE_NOT_FOUND` separado de `UNREACHABLE`** | Un único "no se pudo calcular" | Diagnóstico distinto: dato mal enviado vs. red sin camino; cambia la acción del cliente |
| **JWT HS256 propio (Go) y con `crypto` (Node)** | Librerías JWT | Binario pequeño, auditable, sin superficie de dependencias; en producción firma/validación en el IdP o API Gateway |
| **Idempotencia en el Reto 3 vía clave persistida + `UNIQUE`** | "Subir el timeout" o reintentar más rápido | El timeout no evita la doble dispersión: el efecto irreversible necesita contrato |
| **Cloud Run + Pub/Sub** | Kafka + Kubernetes | ≈600 préstamos/día: Kafka sería infraestructura sin carga que la justifique; Pub/Sub da entrega al menos una vez y el outbox da el orden |
| **Sin librería de UI** | MUI/AntD | Bundle de 156 kB gzip total y control de accesibilidad/estados sin pelearse con el tema |
| **nginx + rutas relativas en local** | Proxy en el servidor de desarrollo para todo | Evita CORS frágil en local y mantiene el mismo contrato de rutas en Docker |

**Trade-offs asumidos explícitamente**

- Rutas relativas + nginx ⇒ en cloud hay que **reconstruir** el frontend con URLs absolutas (las `VITE_*`
  son build-time), o mantener un proxy inverso delante. Está documentado, no oculto.
- `DB_SYNCHRONIZE=true` en local ⇒ rápido de arrancar, inaceptable en producción (migraciones).
- Sin caché de tokens en disco ⇒ en cloud, cada recarga pide un token; es el precio de no persistir
  credenciales en el navegador.
- El checklist de bases del frontend usa el grafo fijo de Lima del enunciado; cambiarlo es un cambio de
  constante (el backend no conoce la red).

---

## 8. Despliegue en GCP (Cloud Run + Neon) — borrador validado en local

> **Estado:** artefactos creados y validados con dry checks locales; **no ejecutados contra GCP**.
> La Fase 4 (CORS/seguridad) y la Fase 5 (documentación) todavía pueden ajustar variables y
> orígenes, por eso el script está parametrizado y sin secretos hardcodeados.

### 8.1 Arquitectura

```
Navegador
   │  HTTPS
   ▼
Cloud Run: frontend (nginx + SPA React, puerto 8080)
   │  fetch a URLs absolutas (VITE_* horneadas en build)
   ├──► Cloud Run: endorsements (Node/Hapi, 8082) ──┐
   └──► Cloud Run: routes (Go distroless, 8081)     │ TLS (DB_SSL=true)
                                                    ▼
                                      Neon Postgres (externo a GCP)
                                      · endpoint pooled  → runtime Cloud Run
                                      · endpoint directo → bootstrap/seed
```

- **Tres servicios de Cloud Run** y **Neon** como Postgres administrado. En producción **no existe**
  el contenedor `seed` del compose: el bootstrap se ejecuta una vez contra el endpoint **directo**.
- **No se usa Cloud SQL**: nada de `--add-cloudsql-instances` ni `/cloudsql/...`; la conexión es por
  host público con `DB_SSL=true` (Neon rechaza conexiones sin TLS).
- El frontend **no** usa el proxy interno de nginx en la nube: se compila con las URLs absolutas de
  cada backend y CORS se configura en ellos. El proxy se conserva solo para `docker compose`.

### 8.2 Variables de entorno requeridas

| Variable | Obligatoria | Uso | Nota |
|---|---|---|---|
| `PROJECT_ID` | sí | Proyecto GCP | Por defecto `reto-tecnico-interseguro` |
| `REGION` | sí | Región Cloud Run / Artifact Registry | Por defecto `us-central1` |
| `AR_REPO` | sí | Repositorio Artifact Registry | Por defecto `interseguro-reto` |
| `TAG` | no | Tag de imágenes | Por defecto `git rev-parse --short HEAD` |
| `DB_HOST_POOLED` | sí | Host Neon con `-pooler` | Runtime: muchas conexiones cortas |
| `DB_HOST_DIRECT` | sí | Host Neon sin `-pooler` | Solo `bootstrap-db`: una conexión larga |
| `DB_PORT` | no | Puerto Postgres | `5432` |
| `DB_NAME` | sí | Base de datos | — |
| `DB_USER` | sí | Usuario de Neon | — |
| `DB_PASSWORD` | sí | Contraseña | **Nunca en el repo**; va a Secret Manager (`db-password`) |
| `JWT_SECRET` | sí | Firma HS256 (≥16) | **Nunca en el repo**; Secret Manager (`jwt-secret`) |
| `SECRET_JWT`, `SECRET_DB_PASSWORD` | no | Nombres de secretos | `jwt-secret`, `db-password` |
| `ENABLE_DEMO_TOKEN` | no | Emisor de token demo | `true`: el jurado necesita autenticarse |
| `DEMO_TOKEN_TTL_SECONDS` / `_MINUTES` | no | Vida del token demo | `900` s (~15 min) por defecto |
| `CORS_ORIGINS` | no | Lista de orígenes separada por comas | Vacía hasta `update-cors`; **nunca `*`** en Cloud Run |
| `MAX_INSTANCES` | no | Tope de réplicas | `3`, para no agotar conexiones de Neon |

`PORT`, `NODE_ENV`, `DB_SSL` y `DB_SYNCHRONIZE` no se pasan a mano: Cloud Run inyecta `PORT`; la
imagen fija `NODE_ENV=production`; el script envía `DB_SSL=true` y `DB_SYNCHRONIZE=false` al servicio.

### 8.3 Orden de ejecución

```bash
export PROJECT_ID="reto-tecnico-interseguro"
export REGION="us-central1"
export DB_HOST_POOLED="ep-xxx-pooler.us-east-1.aws.neon.tech"   # runtime
export DB_HOST_DIRECT="ep-xxx.us-east-1.aws.neon.tech"          # bootstrap
export DB_NAME="endorsements"
export DB_USER="<usuario>"
export DB_PASSWORD="<password>"        # solo entorno, nunca commit
export JWT_SECRET="$(openssl rand -hex 32)"

./deploy-gcp.sh all
```

Paso a paso (equivalente y depurable):

```bash
./deploy-gcp.sh preflight       # billing + 5 APIs
./deploy-gcp.sh ensure-ar       # Artifact Registry
./deploy-gcp.sh ensure-secrets  # jwt-secret / db-password en Secret Manager
./deploy-gcp.sh bootstrap-db    # esquema + seed contra Neon (endpoint directo)
./deploy-gcp.sh build           # imágenes de endorsements y routes
./deploy-gcp.sh deploy          # backends + frontend (captura URLs)
./deploy-gcp.sh update-cors     # fija CORS_ORIGINS a la URL del frontend
./deploy-gcp.sh urls            # imprime las URLs públicas
```

### 8.4 Qué hace cada subcomando

| Subcomando | Acción |
|---|---|
| `preflight` | Verifica billing y habilita `run`, `artifactregistry`, `secretmanager`, `sqladmin`, `cloudbuild` |
| `ensure-ar` | Crea `interseguro-reto` si no existe y configura `docker` |
| `ensure-secrets` | Crea/actualiza `jwt-secret` y `db-password` desde el entorno |
| `bootstrap-db` | `npm ci` + `npm run seed` con `DB_SYNCHRONIZE=true`, **una sola vez** |
| `build` | `gcloud builds submit` de endorsements y routes (`.gcloudignore` evita subir `node_modules`/`dist`) |
| `deploy` | Cloud Run de backends (secretos) y frontend (build-args Vite vía `cloudbuild-frontend.yaml`) |
| `update-cors` | Fija `CORS_ORIGINS` de ambos backends a la URL exacta del frontend |
| `urls`, `logs [svc]` | Inspección de URLs y logs |

### 8.5 Verificación post-despliegue

```bash
./deploy-gcp.sh urls
curl -s "$URL_ENDORSEMENTS/health"
curl -s "$URL_ROUTES/health"

TOKEN=$(curl -s -X POST "$URL_ENDORSEMENTS/v1/auth/token" -H 'Content-Type: application/json' -d '{}' \
  | sed -E 's/.*"token":"([^"]+)".*/\1/')
curl -s -X POST "$URL_ENDORSEMENTS/v1/endorse/translate" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"policyNumber":"08200000049","idEnvio":5984,"frecuencia":"Semestral",
       "tipoEndoso":"CambioFrecuencia","producto":"Rumbo","plan":"PlanRumbo",
       "moneda":"Nuevo Sol","usuario":"interface.servicios",
       "fechaSolicitud":"2025-08-27","fechaCliente":"2025-08-27","fechaEfectiva":"2025-09-01"}'
```

En el navegador: abrir la URL del frontend, pulsar *Traducir* y comprobar en *Network* que la
llamada sale hacia `https://endorsements-...run.app`, no hacia `/endorse-api`.

### 8.6 Seguridad: CORS, token demo y alcance de IAM

- **CORS restringido al frontend real.** Cada backend recibe `CORS_ORIGINS` como lista explícita
  (coma separada). La URL del frontend solo existe después de desplegarlo, así que el primer deploy
  de los backends va sin CORS y `update-cors` fija luego el origen exacto. Un `Origin` ajeno **no**
  recibe `Access-Control-Allow-Origin`, por lo que el navegador bloquea la lectura. En local la lista
  es `http://localhost:8080,http://localhost:5173`; `*` nunca se usa en Cloud Run (y en el backend
  Hapi, `CORS_ORIGINS='*'` con `NODE_ENV=production` aborta el arranque).
- **Headers**: `Authorization`, `Content-Type` y `X-API-Version` permitidos; `X-API-Version` expuesto.
  Preflight `OPTIONS` responde `204` con las cabeceras solo si el origen está autorizado.
- **Token demo acotado.** `POST /v1/auth/token` sigue activo (`ENABLE_DEMO_TOKEN=true`) para que el
  evaluador pruebe el flujo, pero el `scope` está limitado a `endorse:translate` (Hapi) y
  `routes:optimal` (Go); pedir otro scope devuelve `400` y un token con scope ajeno recibe `403`.
  La vida es corta: 900 s / 15 min en el despliegue. No hay endpoints administrativos que el token
  demo pueda alcanzar.
- **`--allow-unauthenticated` es intencional.** IAM bloquearía al jurado; la seguridad real está en
  el JWT de la aplicación y en CORS, no en la autenticación de la plataforma. Para un entorno
  corporativo se añadiría IAP o un API Gateway delante.
- **nginx** añade solo `X-Content-Type-Options`, `X-Frame-Options` y `Referrer-Policy`; no hay CSP,
  WAF ni rate limiting (fuera de alcance).

### 8.7 Notas honestas y pendientes

- **Latencia Neon ↔ Cloud Run**: con Neon en `us-east-1` y Cloud Run en `us-central1`, cada
  *round-trip* añade ~15–30 ms. Se mitiga usando el endpoint **pooled** en runtime y reservando el
  **directo** para el bootstrap.
- **Sin framework de migraciones**: el esquema se crea con `DB_SYNCHRONIZE=true` una sola vez y
  después el servicio corre con `DB_SYNCHRONIZE=false`. Versionar migraciones TypeORM sigue pendiente.
- **`sqladmin.googleapis.com`** se habilita por requisito de la consigna, pero Neon **no** usa Cloud
  SQL; puede retirarse al cerrar el script.
- **No ejecutado**: ningún comando de este script se ha lanzado contra GCP en este entorno. La
  evidencia local es `bash -n`, `shellcheck`, fallo limpio, parseo del YAML y `docker compose`.

### 8.8 Alternativa sin GCP (Render / Railway)

1. **Postgres**: *New + → PostgreSQL*. Copiar **host, puerto, usuario, contraseña y base**
   (no la URL completa: TypeORM se configura por campos).
2. **endorsements**: *Web Service* → Docker, root `backend-endorsements-hapi`, puerto **3000**
   (Render inyecta `PORT`, el servicio lo respeta). Variables:
   ```
   DB_HOST=<host interno>
   DB_PORT=5432
   DB_USER=<usuario>
   DB_PASSWORD=<password>
   DB_NAME=<base>
   DB_SSL=true
   DB_SYNCHRONIZE=true
   JWT_SECRET=<secreto largo>
   ENABLE_DEMO_TOKEN=true
   CORS_ORIGINS=https://<tu-frontend>.onrender.com
   ```
   > `DB_SSL=true` es obligatorio en Neon y en cualquier Postgres gestionado: sin TLS la conexión se rechaza.
   > `NODE_ENV=production` ya viene en la imagen, así que `CORS_ORIGINS=*` **aborta el arranque**: hay que
   > poner la URL real del frontend (y en el servicio de rutas la misma lista en `CORS_ORIGINS`).
3. **seed**: *Job* / *one-off command* con la misma imagen: `node dist/seed/seed.js`
   y las mismas variables `DB_*` (se ejecuta una vez).
4. **routes**: *Web Service* → Docker, root `backend-routes-golang`, puerto 8081,
   variables `JWT_SECRET` (el mismo) y `ENABLE_DEMO_TOKEN=true`.
5. **frontend**: *Web Service* → Docker, root `frontend-monolith`. Los `VITE_*` son **build-time**:
   se pasan como *build args* (el [`Dockerfile`](frontend-monolith/Dockerfile:13) ya los declara
   como `ARG` + `ENV`) apuntando a las URLs públicas de los dos backends.
   > Si se cambia una URL hay que **reconstruir** la imagen; reiniciar el servicio no basta.
   >
   > **Trampa si se omiten**: en Docker Compose los valores por defecto (`/endorse-api`, `/routes-api`)
   > funcionan porque [`nginx.conf.template`](frontend-monolith/nginx.conf.template:1) hace proxy a los nombres de
   > servicio `endorsements:8082` y `routes:8081`. En Render esos DNS **no existen**, así que una
   > imagen construida sin las URLs absolutas sirve la SPA pero devuelve `502` en cada llamada.
   > Verificación rápida tras el primer deploy: pulsar *Traducir* y comprobar en la pestaña *Network*
   > que la petición sale hacia `https://<backend>.onrender.com`, no hacia `/endorse-api`.
6. Ajustar `CORS_ORIGINS` / `CORS_ORIGIN` al dominio del frontend y repetir 8.8.

**Token en cloud**: el cuerpo correcto es `{}` o `{"subject":"demo-client","scope":"endorse:translate"}`
(no hay usuario/contraseña). Ejemplo:

```bash
FRONTEND_URL="https://<tu-frontend>.onrender.com"
TOKEN=$(curl -s -X POST "$FRONTEND_URL/endorse-api/v1/auth/token" \
  -H 'Content-Type: application/json' -d '{}' | sed -E 's/.*"token":"([^"]+)".*/\1/')

curl -s -X POST "$FRONTEND_URL/endorse-api/v1/endorse/translate" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d @payload.json
```

---

## 9. Credenciales y ejemplos cURL (demo)

No hay usuarios ni contraseñas reales: la autenticación es un **JWT HS256 de demo** emitido por cada backend.

| Dato | Valor | Nota |
|---|---|---|
| Emisor Reto 1 | `POST :8082/v1/auth/token` | `scope` admitido: `endorse:translate` (default). Cualquier otro → `400` |
| Emisor Reto 2 | `POST :8081/v1/auth/token` | `scope` admitido: `routes:optimal` (default; `routes:read` por compatibilidad). Cualquier otro → `400` |
| Secreto local | `dev-secret-change-me-please` | **Solo local**; ambos backends lo leen de `JWT_SECRET` (≥16 caracteres) |
| Vigencia | 3600 s en local; **900 s** por default en producción | `JWT_TTL_SECONDS` / `JWT_TTL_MINUTES` |
| Usuario demo | `demo-client` | `subject` del claim |

El `scope` **sí se aplica**: cada ruta exige el suyo (`/v1/endorse/translate` → `endorse:translate`,
`/v1/routes/optimal` → `routes:optimal`) y un token bien firmado con otro scope responde `403 FORBIDDEN`.
El emisor de demo rechaza scopes ajenos con `400 VALIDATION_ERROR`, así que el token del jurado no escala
privilegios ni alcanza endpoints administrativos (no hay ninguno expuesto). `ENABLE_DEMO_TOKEN=false` apaga el emisor.

Los ejemplos cURL completos están en [§3](#3-reto-1--traductor-de-endosos) y
[§4](#4-reto-2--ruta-óptima-de-grúa), y en los README de cada backend.

### Tabla de errores del Reto 2

| Código | HTTP | Cuándo |
|---|---|---|
| `VALIDATION_ERROR` | 400 | Payload inválido o tipo incorrecto |
| `NEGATIVE_WEIGHT` | 400 | Arista con peso negativo |
| `UNAUTHORIZED` | 401 | JWT ausente, manipulado o expirado |
| `NODE_NOT_FOUND` | 422 | Accidente o base inexistente en el grafo |
| `UNREACHABLE` | 422 | **Ninguna** base alcanza el accidente |

---

## 10. Supuestos y pendientes

- `DB_SYNCHRONIZE=true` solo para local/demo; producción usa migraciones.
- El token de demo valida el flujo completo; falta integración con el IdP real (OIDC/JWKS).
- El frontend no tiene tests automatizados (decisión de priorización, no olvido).
- **Diagramas**: se entregan `.drawio` editables, los `.png` ya renderizados (`as-is.png`, `to-be.png`,
  escala 2×, fondo blanco, borde 20) y Mermaid como fallback legible en GitHub. El TO-BE agrupa los
  componentes en cinco contenedores etiquetados (`Borde / Entrada`, `Procesamiento asíncrono`,
  `Datos`, `Salida al core`, `Transversales`) para que se pueda seguir de un vistazo. El texto está en
  español y solo conservan inglés los términos reservados (`POST`, `202 Accepted`, `502`,
  `Idempotency-Key`, `PENDING`/`PROCESSING`/`COMPLETED`/`FAILED`/`COMPENSATED`, `Pub/Sub`,
  `Cloud Run`, `PostgreSQL`, etc.). Como el entorno no tiene *drawio CLI*, el PNG se genera con
  `python3 architecture-drawio/render_drawio.py`; si se edita el `.drawio` y se prefiere la
  herramienta oficial, `File → Export as → PNG` (escala 200%, borde 10, sin transparencia) da un
  resultado equivalente.
- **Despliegue cloud**: guía completa, sin ejecutar (sin cuenta/proyecto disponible).
- Pendiente para producción: OpenTelemetry, rate limiting, paginación de catálogos de plantillas,
  pruebas de carga del cálculo de rutas y auditoría de cambios de plantilla.
- Los pesos del grafo son números en la unidad que defina el consumidor (km/min); el servicio no impone semántica.

---

## 11. Estructura del repositorio

```
.
├── docker-compose.yml           # orquestación completa con healthchecks
├── backend-endorsements-hapi/   # Reto 1: Hapi + TypeORM + plantillas data-driven
│   ├── src/{routes,controllers,services,repositories,mappers,models,entities}
│   ├── src/seed/                # plantillas RUMBO y AUTO (idempotente)
│   └── tests/                   # 20 tests (mapper, service, HTTP)
├── backend-routes-golang/       # Reto 2: Dijkstra puro + HTTP + JWT
│   ├── internal/{domain,service,httpapi,auth}
│   ├── cmd/{server,healthcheck}
│   └── internal/**/*_test.go    # dominio, servicio y contrato HTTP
├── frontend-monolith/           # Reto 4: React + Vite + nginx (dos pestañas)
│   └── src/{components,api,config.ts,types.ts}
├── architecture-drawio/         # Reto 3
│   ├── architecture.md          # diagnóstico, TO-BE, decisiones, Mermaid
│   ├── as-is.drawio             # diagrama editable del flujo actual
│   ├── as-is.png                # export 2× con fondo blanco (2240×1760)
│   ├── to-be.drawio             # diagrama editable de la solución
│   ├── to-be.png                # export 2× con fondo blanco (3200×3200)
│   └── render_drawio.py         # .drawio → PNG con Pillow (sin drawio CLI)
└── docs/
    └── entrega-talsory.md       # correo de entrega
```

---

## 12. Verificación ejecutada

| Comando | Resultado |
|---|---|
| `cd backend-routes-golang && go build ./... && go vet ./... && go test ./...` | OK — 4 paquetes de test, 20 tests (40 casos con subtests) |
| `cd backend-endorsements-hapi && npm run typecheck && npm test` | OK — `tsc --noEmit` limpio, **24/24** tests |
| Preflight CORS real (`OPTIONS` con `Origin: http://localhost:8080`) | OK — `204`, `Access-Control-Allow-Origin: http://localhost:8080` (nunca `*`), `Allow-Headers` con `authorization,content-type,x-api-version`, `Max-Age: 600`, `Expose-Headers: x-api-version` |
| Control negativo CORS (`Origin: http://evil.example.com`) | OK — **sin** `Access-Control-Allow-Origin`; en Hapi `200 {"message":"CORS error: Origin not allowed"}`, en Go `204` sin headers CORS |
| Token de demo: claims reales decodificados | OK — `scope` acotado (`endorse:translate` / `routes:optimal`) y `exp` a 3600 s en local (900 s en el despliegue) |
| Escalada de scope (`{"scope":"admin:all"}`) y token cruzado entre servicios | OK — `400 VALIDATION_ERROR` al emitir, `403 FORBIDDEN` al consumir en el servicio equivocado |
| `cd frontend-monolith && npm run build` | OK — `tsc --noEmit` + `vite build` (156 kB JS / 8 kB CSS) |
| `docker compose config -q` | OK — compose válido |
| `docker compose down -v && docker compose up -d --build` | OK — partiendo de volumen limpio: `db`, `endorsements`, `routes` y `frontend` en *healthy*; `seed` terminó `Exited (0)` |
| `curl :8080/healthz` · `/health` de ambos backends | OK — `200 ok` a través de nginx; JSON `{"status":"ok"}` en 8082 y 8081 |
| Traducción end-to-end vía nginx (token → `/v1/endorse/translate`) | OK — 12 etiquetas en el orden de la plantilla, `'Default'` vs `''` preservados |
| Rutas vía nginx: Miraflores→San Isidro = 7 · `NODE_NOT_FOUND` · `NEGATIVE_WEIGHT` · `UNREACHABLE` | OK — `200` / `422` / `400` / `422` |
| `curl .../endorse/translate` sin `Authorization` | OK — `401 UNAUTHORIZED` |
| Grep de hardcode (`ProductosVida\\|TES008\\|EndososSimplesSACRumbo` en `src/`, excluyendo `seed`) | OK — sin resultados: el negocio vive en la plantilla, no en el código |
| `python3 architecture-drawio/render_drawio.py` | OK — `as-is.png` (2240×1760) y `to-be.png` (3200×3200), fondo blanco opaco |
| Despliegue en la nube (§8) | **No ejecutado**: requiere cuenta/proyecto. La guía es reproducible, pero no está validada contra un entorno real |
