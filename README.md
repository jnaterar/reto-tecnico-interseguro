# Reto Técnico — Interseguro (Technical Lead / Software Architect)

Monorepo con los cuatro entregables: **traductor de endosos data-driven** (Node + Hapi + Postgres), **ruta óptima de grúa** (Go + Dijkstra), **análisis de arquitectura** del flujo de préstamos y **frontend unificado** en dos pestañas.
Los tres artefactos ejecutables levantan con `docker compose up --build`; el cuarto es un documento técnico con diagramas editables.
Todas las cifras de verificación de este README provienen de comandos ejecutados sobre este repositorio y del smoke
ejecutado contra el despliegue activo ([§0.1](#01-estado-del-despliegue-activo)), no de estimaciones.

## Contenido

- [Resumen ejecutivo](#resumen-ejecutivo)
- [0. Panorama de la entrega](#0-panorama-de-la-entrega)
  - [0.1 Estado del despliegue](#01-estado-del-despliegue-activo)
  - [0.2 Priorización declarada](#02-priorización-declarada)
- [1. Arranque en un comando](#1-arranque-en-un-comando)
- [2. Ejecución local (sin Docker)](#2-ejecución-local-sin-docker)
- [3. Reto 1 — Traductor de endosos](#3-reto-1--traductor-de-endosos)
- [4. Reto 2 — Ruta óptima de grúa](#4-reto-2--ruta-óptima-de-grúa)
- [5. Reto 3 — Préstamos](#5-reto-3--préstamos-el-dinero-se-duplica-al-hacer-clic-dos-veces)
- [6. Frontend unificado](#6-frontend-unificado)
- [7. Decisiones y trade-offs](#7-decisiones-y-trade-offs)
- [8. Despliegue en GCP](#8-despliegue-en-gcp-cloud-run--neon--script-definitivo)
- [9. Credenciales y ejemplos cURL](#9-credenciales-y-ejemplos-curl-demo)
- [10. Supuestos y pendientes](#10-supuestos-y-pendientes)
- [11. Estructura del repositorio](#11-estructura-del-repositorio)
- [12. Verificación ejecutada](#12-verificación-ejecutada)

## Resumen ejecutivo

**Qué pedía el reto.** Tres problemas de ingeniería y una decisión de arquitectura: (1) traducir un JSON plano
al contrato de un core, sin hardcodear el mapeo; (2) calcular la ruta óptima de una grúa sobre un grafo con
seis trampas que producen resultados **incorrectos sin lanzar error**; (3) analizar por qué un flujo de préstamos
duplica el dinero al reintentar; (4) todo ello con un frontend que permita verificarlo en un minuto.

**Qué se entrega.**

| Reto | Entregable | Código | Verificación real |
|---|---|---|---|
| 1 | Traductor de endosos `POST /v1/endorse/translate` con plantillas **en BD** | [`backend-endorsements-hapi/`](backend-endorsements-hapi) | `tsc --noEmit` limpio + **25/25 tests** verdes |
| 2 | Rutas óptimas de grúa (Dijkstra, grafo **no dirigido**) | [`backend-routes-golang/`](backend-routes-golang) | `go build`, `go vet`, `go test` verdes (20 tests, 40 casos) |
| 3 | Arquitectura de préstamos: idempotencia, saga, reconciliación | [`architecture-drawio/architecture.md`](architecture-drawio/architecture.md) | Documento + diagramas `.drawio` + Mermaid |
| 4 | Frontend unificado (dos pestañas, TS estricto) | [`frontend-monolith/`](frontend-monolith) | `tsc --noEmit && vite build` verde |
| — | Despliegue reproducible en Cloud Run + Neon (**ACTIVO**) | [`deploy-gcp.sh`](deploy-gcp.sh) | 3 servicios en `us-central1` + smoke E2E verificado (ver [§0.1](#01-estado-del-despliegue-activo)) |

**Probarlo en 5 minutos** (requiere Docker; no necesita cuenta de nube ni base de datos externa):

```bash
docker compose up --build      # 4 servicios en healthy; el contenedor `seed` termina solo
# luego abrir http://localhost:8080 — dos pestañas, el token demo se pide solo
```

Y sin navegador, el mismo flujo en tres comandos (salida real en [§12](#12-verificación-ejecutada)):

```bash
TOKEN=$(curl -s -X POST localhost:8082/v1/auth/token -H 'Content-Type: application/json' -d '{}' \
  | sed -E 's/.*"token":"([^"]+)".*/\1/')

curl -s -X POST localhost:8082/v1/endorse/translate \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"policyNumber":"08200000049","idEnvio":5984,"frecuencia":"Semestral",
       "tipoEndoso":"CambioFrecuencia","producto":"Rumbo","plan":"PlanRumbo",
       "moneda":"Nuevo Sol","usuario":"interface.servicios",
       "fechaSolicitud":"2025-08-27","fechaCliente":"2025-08-27","fechaEfectiva":"2025-09-01"}'

curl -s -X POST localhost:8081/v1/routes/optimal \
  -H "Authorization: Bearer $(curl -s -X POST localhost:8081/v1/auth/token \
       -H 'Content-Type: application/json' -d '{}' | sed -E 's/.*"token":"([^"]+)".*/\1/')" \
  -H 'Content-Type: application/json' \
  -d '{"accidentLocation":"San Isidro","depots":["Miraflores","Ate"],
       "graph":{"Miraflores":{"San Isidro":7,"Barranco":3},"San Isidro":{"Miraflores":7,"Lince":4},
                "Barranco":{"Miraflores":3,"Surco":5},"Lince":{"San Isidro":4,"Surco":6},
                "Surco":{"Barranco":5,"Lince":6,"Ate":10},"Ate":{"Surco":10}}}'
```

---

## 0. Panorama de la entrega

### 0.1 Estado del despliegue: ACTIVO

Los tres servicios están desplegados y verificados end-to-end en Cloud Run (`us-central1`):

| Servicio | URL larga canónica | Estado |
|---|---|---|
| `frontend` | https://frontend-919990628042.us-central1.run.app | ACTIVO |
| `endorsements` (Reto 1) | https://endorsements-919990628042.us-central1.run.app | ACTIVO |
| `routes` (Reto 2) | https://routes-919990628042.us-central1.run.app | ACTIVO |

> Son las URLs **largas canónicas** (`https://<servicio>-<PROJECT_NUMBER>.<REGION>.run.app`), que son las
> que el navegador abre y envía como `Origin`. No usar la variante corta que devuelve `status.url`
> (`…-<hash>-<region>.a.run.app`): fijarla deja el frontend con los indicadores en rojo porque el
> preflight CORS no coincide (detalle en [§6](#6-frontend-unificado) y [§8.6](#86-seguridad-cors-token-demo-y-alcance-de-iam)).

**Smoke verificado contra el despliegue activo:**

- **Reto 1 —** `POST /v1/endorse/translate` → `200`; `eventEntity.description = "SolicitarEndoso"` con
  **12** entradas en `dynamicData`, preservando `'Default'` y `''` como valores distintos.
- **Plantillas —** `GET /v1/templates` → `200` con **2** plantillas (`AUTO` y `RUMBO`) y
  `fieldCount > 0`. Lo exige `./deploy-gcp.sh smoke`, que además comprueba que la revisión que sirve
  el 100% del tráfico sea la **última creada** (guard explícito contra el contenedor stale que produjo
  el 404 anterior).
- **Reto 2 —** `POST /v1/routes/optimal` → `200`; respuesta `{fromDepot, to, path, distance: 7}`
  calculada sobre el grafo **no dirigido** (accidente `San Isidro`, base `Miraflores`).
- **CORS —** control positivo: el `Origin` del frontend recibe `Access-Control-Allow-Origin`;
  control negativo: un `Origin` hostil (`https://evil.example.com`) **no** recibe esa cabecera.
- **Frontend —** los indicadores de salud de ambos backends están operativos.

### 0.2 Priorización declarada

El orden no fue casual: primero lo que **se puede romper en silencio**, después lo que se ve.

| Orden | Qué prioricé | Por qué | Estado |
|---|---|---|---|
| 1 | **Correctitud del Reto 1** (plantillas en BD, orden, `'Default'` vs `''`, errores tipados) | Es donde un atajo se ve bien en la demo y falla en producción: un `if (producto === 'Rumbo')` habría pasado la demo, no la revisión | Completo + 25 tests |
| 2 | **Correctitud del Reto 2** (grafo no dirigido, empates, bases aisladas, nodo inexistente, pesos negativos) | Cinco de las seis trampas producen **resultados incorrectos sin error**: el peor tipo de bug | Completo + tabla de tests |
| 3 | **Frontend que demuestra los dos backends** (textarea → traducir; selector + checklist → calcular) | Sin esto los retos no son verificables por un tercero en 60 segundos | Completo + `build` verde |
| 4 | **Profundidad del Reto 3** (contrato de idempotencia, saga, máquina de estados, costo) | Es un problema de arquitectura, no de código: la decisión se defiende con el documento | Completo |
| 5 | **Infra y narrativa** (`docker compose`, healthchecks, este README, despliegue) | Reduce el costo de evaluar y de operar; lo dejé al final a propósito | Completo (ACTIVO en Cloud Run, ver [§0.1](#01-estado-del-despliegue-activo)) |

**Recortes conscientes** (declarados, no olvidados):

- Sin tests automatizados de frontend: el presupuesto de pruebas se gastó donde hay lógica de negocio (mapper puro + algoritmo + contratos HTTP).
- El despliegue cloud **sí está ejecutado**: tres servicios activos en Cloud Run (§0.1). Lo que queda fuera
  del repositorio son las credenciales de Neon y los datos personales; no hay URLs inventadas.

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

> Estado de esta verificación: `docker compose up -d --build` **sí** se ejecutó sobre este repositorio.
> Resultado: `db`, `endorsements`, `routes` y `frontend` en *healthy* y `seed` en `Exited (0)`; los curls
> de este README se lanzaron contra ese stack (ver [§12](#12-verificación-ejecutada)).

### Requisitos y compatibilidad (Windows, macOS y Linux)

- **Requisito único:** Docker Desktop. No hace falta instalar Node, Go ni PostgreSQL en el host: todo
  corre en contenedores.
- **Comando:** `docker compose up --build` — el mismo, carácter por carácter, en los tres sistemas.
- `deploy-gcp.sh` es la **herramienta de despliegue** a GCP; el evaluador **no la necesita** para probar
  el proyecto (la vía principal es la demo ya desplegada). Solo pide bash —Git Bash o WSL si alguien
  quiere desplegar desde Windows—, y el `.gitattributes` del repositorio fuerza LF en los `.sh` para que
  no lleguen con CRLF al clonar. `deploy.env.sh` es el archivo **local** del operador con las variables
  del entorno: no está versionado ni forma parte del repositorio.
- **cURL:** los ejemplos de este documento están en sintaxis bash/zsh; en PowerShell/CMD hay que
  adaptarlos (ver la nota en [§9](#9-credenciales-y-ejemplos-curl-demo)).

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

### Trampas del Reto 1 y su tratamiento

| Trampa | Qué pasaría con el atajo | Cómo se resolvió |
|---|---|---|
| **Mapeo hardcodeado por producto** | `if (producto === 'Rumbo')` pasa la demo y convierte cada producto nuevo en un deploy | Plantillas en BD (`templates` / `template_fields` / `template_events`); `AUTO`/`CambioFrecuencia` se añade con un `INSERT` |
| **Orden de propiedades del JSON** | El core compara por posición; reordenar el objeto rompe la integración sin error visible | El orden viene de `position` en `template_fields`; un test fija la secuencia exacta de `dynamicData` |
| **`'Default'` vs `''`** | Un `value || 'Default'` colapsa dos significados de negocio distintos | `DEFAULT` usa `default_value` y se emite tal cual; test dedicado a que la cadena vacía siga vacía |
| **Fechas imposibles (`2025-02-31`)** | `new Date()` "corrige" a marzo y envía basura al core | Joi valida el calendario real y el formato `YYYY-MM-DD` (`400 VALIDATION_ERROR`) |
| **Campo `INPUT` ausente** | El core recibe `undefined` y falla lejos del origen | `MISSING_FIELD_VALUE` (422) con `source_key`, antes de llamar a nadie |

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

### Errores del Reto 2

| Código | HTTP | Cuándo |
|---|---|---|
| `VALIDATION_ERROR` | 400 | Payload inválido o tipo incorrecto |
| `NEGATIVE_WEIGHT` | 400 | Arista con peso negativo |
| `UNAUTHORIZED` | 401 | JWT ausente, manipulado o expirado |
| `NODE_NOT_FOUND` | 422 | Accidente o base inexistente en el grafo |
| `UNREACHABLE` | 422 | **Ninguna** base alcanza el accidente |

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

> **URL canónica (larga).** En Cloud Run la URL que el navegador abre y envía como `Origin` es
> `https://<servicio>-<PROJECT_NUMBER>.<REGION>.run.app`. `gcloud run services describe` expone en
> `status.url` una variante **corta** (`https://<servicio>-<hash>-<region>.a.run.app`) que el navegador
> **no** usa como `Origin`. `deploy-gcp.sh` usa siempre la larga en el estado, en `update-cors`
> (`CORS_ORIGINS`), en `urls` y en sus mensajes; fijar la corta deja el frontend con los indicadores en
> rojo porque el preflight CORS no devuelve `Access-Control-Allow-Origin`.

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

**Criterios descartados (y por qué)**

- **Nx / Turborepo para el monorepo.** Con dos backends en runtimes distintos y un frontend, `npm`, `go` y
  `docker compose` ya dan build y caché suficiente. Nx habría añadido configuración, plugins y una curva
  que el evaluador tendría que aprender antes de leer el código: coste alto, beneficio cero a esta escala.
- **Cloud SQL en lugar de Neon.** Cloud SQL exige instancia encendida (facturación por tiempo), VPC
  connector o proxy, y no resuelve nada que Neon no dé: *pooled* para Cloud Run, *directo* para el
  bootstrap y base fuera del ciclo de vida del deploy. Si el requisito fuera latencia mínima dentro de
  GCP, la decisión se invertiría; está anotado como trade-off (misma región en Neon lo mitiga).
- **Token de demo estático o compartido.** Un `API_KEY` fijo embebido en el frontend es un secreto público
  que no caduca ni se acota. Se prefirió un JWT HS256 firmado por el backend, con `scope` limitado
  (`endorse:translate` / `routes:optimal`) y una hora de vida. Apagar el emisor
  (`ENABLE_DEMO_TOKEN=false`) habría dejado al jurado sin forma de probar el flujo.
- **Kafka + Kubernetes para el Reto 3.** ≈600 préstamos/día no justifican un clúster: Pub/Sub + outbox
  cubren entrega al menos una vez y orden, con una fracción del costo operativo.
- **Mocks de base de datos en los tests de contrato.** Se prefirió un repositorio en memoria (Hapi) y
  funciones puras (Go): mismo aislamiento, sin el acoplamiento a SQL que los mocks introducen.

---

## 8. Despliegue en GCP (Cloud Run + Neon) — script definitivo

> **Estado:** **ACTIVO en Cloud Run (`us-central1`) y verificado end-to-end** — ver
> [§0.1](#01-estado-del-despliegue-activo) para las tres URLs largas canónicas y el smoke ejecutado.
> `deploy-gcp.sh` y `cloudbuild-frontend.yaml` están cerrados y, además de los dry checks locales
> (`bash -n`, `shellcheck`, `docker compose config -q`, parseo del YAML), se ejecutaron contra GCP.
> El repositorio no contiene credenciales ni datos personales; valores como `ep-xxx…` o `<usuario>`
> se exportan en la terminal del operador, nunca en ficheros versionados.

> **Requisito para desplegar:** bash. En Windows se ejecuta desde **Git Bash** o **WSL**; el
> `.gitattributes` del repositorio fuerza LF en los `.sh`, así que el clon no llega con CRLF.

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
- **La URL canónica es la larga:** `https://<servicio>-<PROJECT_NUMBER>.<REGION>.run.app` (en esta
  entrega, `https://frontend-919990628042.us-central1.run.app`). La que devuelve `status.url`
  (`…-<hash>-<region>.a.run.app`) es una variante corta que el navegador no envía como `Origin`; el
  script calcula y propaga siempre la larga (con respaldo en la anotación `run.googleapis.com/urls`
  del servicio si Cloud Resource Manager no está disponible).

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
| `DB_PASSWORD` | sí | Contraseña de Neon | **Nunca en el repo**; se lee del entorno del operador y se inyecta al servicio como variable de entorno |
| `JWT_SECRET` | sí | Firma HS256 (≥16) | **Nunca en el repo**; se lee del entorno del operador y se inyecta al servicio como variable de entorno |
| `ENABLE_DEMO_TOKEN` | no | Emisor de token demo | `true`: el jurado necesita autenticarse |
| `DEMO_TOKEN_TTL_SECONDS` / `_MINUTES` | no | Vida del token demo | `3600` s (1 hora) por defecto |
| `CORS_ORIGINS` | no | Lista de orígenes separada por comas | Vacía hasta `update-cors`; en el despliegue activo vale la URL **larga canónica** del frontend (`https://frontend-919990628042.us-central1.run.app`); **nunca `*`** en Cloud Run |
| `MAX_INSTANCES` | no | Tope de réplicas | `3`, para no agotar conexiones de Neon |

`PORT`, `NODE_ENV`, `DB_SSL` y `DB_SYNCHRONIZE` no se pasan a mano: Cloud Run inyecta `PORT`; la
imagen fija `NODE_ENV=production`; el script envía `DB_SSL=true` y `DB_SYNCHRONIZE=false` al servicio.

`JWT_SECRET` y `DB_PASSWORD` viajan en `--set-env-vars`, no por Secret Manager. El script elige un
delimitador (`^X^`) que no aparezca en ningún valor, de modo que una contraseña con comas o puntos y
coma no rompa el despliegue; si no encuentra uno, aborta con un mensaje claro. El trade-off de esta
decisión está en §8.6.

### 8.3 Orden de ejecución

```bash
export PROJECT_ID="reto-tecnico-interseguro"
export REGION="us-central1"
export DB_HOST_POOLED="ep-xxx-pooler.us-east-1.aws.neon.tech"   # runtime
export DB_HOST_DIRECT="ep-xxx.us-east-1.aws.neon.tech"          # bootstrap
export DB_NAME="neondb"
export DB_USER="<usuario>"
export DB_PASSWORD="<password>"        # solo entorno, nunca commit
export JWT_SECRET="$(openssl rand -hex 32)"

./deploy-gcp.sh all
```

Paso a paso (equivalente y depurable):

```bash
./deploy-gcp.sh preflight       # billing + 4 APIs (run, artifactregistry, secretmanager, cloudbuild)
./deploy-gcp.sh ensure-ar       # Artifact Registry
./deploy-gcp.sh bootstrap-db    # esquema + seed contra Neon (directo, DB_SYNCHRONIZE=true)
./deploy-gcp.sh build           # imágenes de endorsements y routes
./deploy-gcp.sh deploy          # backends (pooled, DB_SYNCHRONIZE=false) + frontend + smoke
./deploy-gcp.sh urls            # imprime las URLs públicas (largas canónicas)
./deploy-gcp.sh update-cors     # fija CORS_ORIGINS a la URL larga del frontend (depende de `urls`)
./deploy-gcp.sh smoke           # EXIGE /v1/templates -> 200 con exactamente 2 plantillas
```

Para actualizar **solo código** después de un cambio (sin volver a manejar `DB_*`/`JWT_SECRET`):

```bash
./deploy-gcp.sh redeploy
# build de las 3 imágenes + deploy conservando env/CORS/límites + update-cors + smoke
```

`deploy`, `all` y `redeploy` terminan con el **smoke estricto**: si `/v1/templates` no devuelve
`200` con las 2 plantillas, el comando falla con exit 1. No se declara el entorno sano con la UI
rota en vivo.

`urls` y `update-cors` escriben y usan la URL **larga canónica**
(`https://<servicio>-<PROJECT_NUMBER>.<REGION>.run.app`), nunca la corta que devuelve `status.url`.

### 8.4 Qué hace cada subcomando

| Subcomando | Acción |
|---|---|
| `preflight` | Verifica billing y habilita `run`, `artifactregistry`, `secretmanager`, `cloudbuild` |
| `ensure-ar` | Crea `interseguro-reto` si no existe y configura `docker` |
| `bootstrap-db` | `npm ci` + `npm run seed` contra el endpoint **directo**, con `DB_SYNCHRONIZE=true`, **una sola vez** |
| `build` | `gcloud builds submit` de endorsements y routes (`.gcloudignore` evita subir `node_modules`/`dist`) |
| `deploy` | Cloud Run de backends (env vars, secretos incluidos, por `--set-env-vars`) y frontend (build-args Vite vía `cloudbuild-frontend.yaml`) + smoke |
| `redeploy` | Rebuild de las 3 imágenes y deploy **conservando** env/CORS/límites (no necesita `DB_*`/`JWT_SECRET`) + `update-cors` + smoke |
| `smoke` | Falla con exit 1 si la revisión servida no es la última creada (contenedor stale), `/health` != 200 o `/v1/templates` != 200 con **exactamente 2** plantillas; además valida el preflight CORS del frontend |
| `update-cors` | Fija `CORS_ORIGINS` de ambos backends a la URL **larga canónica** del frontend |
| `urls`, `logs [svc]` | Inspección de URLs largas canónicas y logs |
| `all` | Secuencia completa terminando en `update-cors` + smoke |

### 8.5 Verificación post-despliegue

```bash
# URLs reales del despliegue activo (largas canónicas, ver §0.1)
URL_FRONTEND="https://frontend-919990628042.us-central1.run.app"
URL_ENDORSEMENTS="https://endorsements-919990628042.us-central1.run.app"
URL_ROUTES="https://routes-919990628042.us-central1.run.app"

# Smoke estricto: debe imprimir "SMOKE OK". Sale con código 1 si
# /v1/templates no devuelve 200 con las 2 plantillas (AUTO y RUMBO).
./deploy-gcp.sh smoke

./deploy-gcp.sh urls
curl -s "$URL_ENDORSEMENTS/health"
curl -s "$URL_ROUTES/health"

TOKEN=$(curl -s -X POST "$URL_ENDORSEMENTS/v1/auth/token" -H 'Content-Type: application/json' -d '{}' \
  | sed -E 's/.*"token":"([^"]+)".*/\1/')

# Catálogo de plantillas: 2 entradas y fieldCount > 0
curl -s "$URL_ENDORSEMENTS/v1/templates" -H "Authorization: Bearer $TOKEN" | jq .

curl -s -X POST "$URL_ENDORSEMENTS/v1/endorse/translate" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"policyNumber":"08200000049","idEnvio":5984,"frecuencia":"Semestral",
       "tipoEndoso":"CambioFrecuencia","producto":"Rumbo","plan":"PlanRumbo",
       "moneda":"Nuevo Sol","usuario":"interface.servicios",
       "fechaSolicitud":"2025-08-27","fechaCliente":"2025-08-27","fechaEfectiva":"2025-09-01"}'
```

En el navegador: abrir la URL **larga canónica** del frontend
(`https://frontend-919990628042.us-central1.run.app`), pulsar *Traducir* y comprobar en *Network*
que la llamada sale hacia `https://endorsements-919990628042.us-central1.run.app`, no hacia
`/endorse-api`. Los indicadores de salud deben estar en verde: eso prueba que el `Origin` largo
coincide con `CORS_ORIGINS`.

Alineación de URL (control positivo y negativo, mismo comando que ejecuta `update-cors`):

```bash
# Positivo: Origin largo canónico -> debe incluir Access-Control-Allow-Origin
curl -i -X OPTIONS "$URL_ENDORSEMENTS/v1/endorse/translate" \
  -H "Origin: $URL_FRONTEND" -H 'Access-Control-Request-Method: POST'

# Negativo: Origin hostil -> NO debe incluir Access-Control-Allow-Origin
curl -i -X OPTIONS "$URL_ENDORSEMENTS/v1/endorse/translate" \
  -H 'Origin: https://evil.example.com' -H 'Access-Control-Request-Method: POST'
```

### 8.6 Seguridad: CORS, token demo y alcance de IAM

- **CORS restringido al frontend real (URL larga canónica).** Cada backend recibe `CORS_ORIGINS`
  como lista explícita (coma separada). La URL del frontend solo existe después de desplegarlo, así
  que el primer deploy de los backends va sin CORS y `update-cors` fija luego el origen exacto. El
  `Origin` que envía el navegador es la URL **larga**
  (`https://frontend-919990628042.us-central1.run.app`), **no** la corta
  (`https://frontend-<hash>-<region>.a.run.app`) que aparece en `status.url`. `update-cors` calcula
  siempre la larga; fijar la corta produce el bug de alineación: el preflight con el `Origin` real no
  devuelve `Access-Control-Allow-Origin` y el frontend queda en rojo. Un `Origin` ajeno **no** recibe
  la cabecera, por lo que el navegador bloquea la lectura. En local la lista es
  `http://localhost:8080,http://localhost:5173`; `*` nunca se usa en Cloud Run (y en el backend Hapi,
  `CORS_ORIGINS='*'` con `NODE_ENV=production` aborta el arranque).
- **Headers**: `Authorization`, `Content-Type` y `X-API-Version` permitidos; `X-API-Version` expuesto.
  Preflight `OPTIONS` responde `204` con las cabeceras solo si el origen está autorizado.
- **Token demo acotado.** `POST /v1/auth/token` sigue activo (`ENABLE_DEMO_TOKEN=true`) para que el
  evaluador pruebe el flujo, pero el `scope` está limitado a `endorse:translate` (Hapi) y
  `routes:optimal` (Go); pedir otro scope devuelve `400` y un token con scope ajeno recibe `403`.
  La vida es de 3600 s (1 hora) en todos los entornos: una sesión de evaluación completa sin re-emitir
  el token, y el riesgo lo acota el scope, no el reloj. No hay endpoints administrativos que el token
  demo pueda alcanzar.
- **`--allow-unauthenticated` es intencional.** IAM bloquearía al jurado; la seguridad real está en
  el JWT de la aplicación y en CORS, no en la autenticación de la plataforma. Para un entorno
  corporativo se añadiría IAP o un API Gateway delante.
- **Secretos como variables de entorno, no Secret Manager.** `JWT_SECRET` y `DB_PASSWORD` se inyectan
  con `--set-env-vars` desde el entorno del operador. Es una decisión consciente para esta demo:
  elimina dos recursos y el enlace `secretAccessor` por servicio. Trade-off explícito: quien pueda leer
  la configuración del servicio (`run.services.get`) verá ambos valores; se aceptan porque la demo es
  pública y evaluable, se rotan al terminar y no dan acceso a nada más que a esta base y a estos
  tokens. Migrar es cambiar `--set-env-vars` por `--set-secrets` y publicar las versiones; el resto del
  script no cambia (por eso `secretmanager.googleapis.com` sigue habilitada).
- **nginx** añade solo `X-Content-Type-Options`, `X-Frame-Options` y `Referrer-Policy`; no hay CSP,
  WAF ni rate limiting (fuera de alcance).

### 8.7 Notas honestas y límites conocidos

- **Latencia Neon ↔ Cloud Run**: con Neon en `us-east-1` y Cloud Run en `us-central1`, cada
  *round-trip* añade ~15–30 ms. Se mitiga usando el endpoint **pooled** en runtime y reservando el
  **directo** para el bootstrap.
- **Sin framework de migraciones**: el esquema se crea con `DB_SYNCHRONIZE=true` una sola vez y
  después el servicio corre con `DB_SYNCHRONIZE=false`. Versionar migraciones TypeORM queda fuera del
  alcance de esta entrega y es el primer trabajo a añadir si el proyecto sigue.
- **Despliegue ejecutado y verificado**: los tres servicios corren en Cloud Run (`us-central1`) y el
  smoke E2E está descrito en [§0.1](#01-estado-del-despliegue-activo). La evidencia local previa
  (`bash -n`, `shellcheck`, `docker compose config -q`, parseo del YAML) se mantiene como control de
  los artefactos, no como sustituto de la ejecución real. El orden reproducible está en §8.3.

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
   se pasan como *build args* (el [`Dockerfile`](frontend-monolith/Dockerfile) ya los declara
   como `ARG` + `ENV`) apuntando a las URLs públicas de los dos backends.
   > Si se cambia una URL hay que **reconstruir** la imagen; reiniciar el servicio no basta.
   >
   > **Trampa si se omiten**: en Docker Compose los valores por defecto (`/endorse-api`, `/routes-api`)
   > funcionan porque [`nginx.conf.template`](frontend-monolith/nginx.conf.template) hace proxy a los nombres de
   > servicio `endorsements:8082` y `routes:8081`. En Render esos DNS **no existen**, así que una
   > imagen construida sin las URLs absolutas sirve la SPA pero devuelve `502` en cada llamada.
   > Verificación rápida tras el primer deploy: pulsar *Traducir* y comprobar en la pestaña *Network*
   > que la petición sale hacia `https://<backend>.onrender.com`, no hacia `/endorse-api`.
6. Ajustar `CORS_ORIGINS` / `CORS_ORIGIN` al dominio del frontend y repetir la verificación de §8.5.

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
| Vigencia | 3600 s (1 hora) en todos los entornos | `JWT_TTL_SECONDS` / `JWT_TTL_MINUTES` |
| Usuario demo | `demo-client` | `subject` del claim |

El `scope` **sí se aplica**: cada ruta exige el suyo (`/v1/endorse/translate` → `endorse:translate`,
`/v1/routes/optimal` → `routes:optimal`) y un token bien firmado con otro scope responde `403 FORBIDDEN`.
El emisor de demo rechaza scopes ajenos con `400 VALIDATION_ERROR`, así que el token del jurado no escala
privilegios ni alcanza endpoints administrativos (no hay ninguno expuesto). `ENABLE_DEMO_TOKEN=false` apaga el emisor.

**Nota de portabilidad de los comandos.** Los ejemplos están escritos para **bash/zsh**: comillas simples
para el cuerpo JSON y `\` al final de línea para continuar. En **PowerShell** o **CMD** eso no funciona
(el `\` no continúa líneas y las comillas simples no protegen el JSON): usa comillas **dobles**, escapa
las internas y escribe el comando en **una sola línea**. Equivalente al ejemplo del Reto 1:

```powershell
# Obtener el token (una línea)
$TOKEN = (curl.exe -s -X POST "http://localhost:8082/v1/auth/token" -H "Content-Type: application/json" -d "{}" | ConvertFrom-Json).token

# Traducir (una línea, comillas dobles y comillas internas escapadas con \")
curl.exe -s -X POST "http://localhost:8082/v1/endorse/translate" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d "{\"policyNumber\":\"08200000049\",\"idEnvio\":5984,\"frecuencia\":\"Semestral\",\"tipoEndoso\":\"CambioFrecuencia\",\"producto\":\"Rumbo\",\"plan\":\"PlanRumbo\",\"moneda\":\"Nuevo Sol\",\"usuario\":\"interface.servicios\",\"fechaSolicitud\":\"2025-08-27\",\"fechaCliente\":\"2025-08-27\",\"fechaEfectiva\":\"2025-09-01\"}"
```

Si el escapado resulta incómodo, guarda el cuerpo en un fichero `payload.json` y usa `-d "@payload.json"`:
esa forma es idéntica en bash y en PowerShell. En la demo desplegada, además, no hace falta ningún
comando: basta con abrir la URL del frontend y pulsar *Traducir*.

Los ejemplos cURL completos están en [§3](#3-reto-1--traductor-de-endosos) y
[§4](#4-reto-2--ruta-óptima-de-grúa), y en los README de cada backend. La tabla de errores del Reto 2
está en [§4](#errores-del-reto-2).

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
- **Despliegue cloud**: **ACTIVO** en Cloud Run (`us-central1`); las URLs reales están en
  [§0.1](#01-estado-del-despliegue-activo) y no hay placeholders de URL de Cloud Run. Los únicos
  placeholders que quedan son los de la alternativa Render/Railway (§8.8), las credenciales/host de
  Neon (`ep-xxx…`) y los datos personales del correo de entrega: se declaran como tales y no se
  inventan.
- **Preflight de origen hostil en Hapi**: responde `200 {"message":"CORS error: Origin not allowed"}`
  en lugar de `204`, porque Hapi resuelve el CORS antes de llegar al `preflightStatusCode` de la ruta.
  Lo relevante es que **no** emite `Access-Control-Allow-Origin`, que es lo que prueba el control
  negativo; se documenta tal cual y no se fuerza.
- Pendiente para producción: OpenTelemetry, rate limiting, paginación de catálogos de plantillas,
  pruebas de carga del cálculo de rutas y auditoría de cambios de plantilla.
- Los pesos del grafo son números en la unidad que defina el consumidor (km/min); el servicio no impone semántica.

---

## 11. Estructura del repositorio

```
.
├── docker-compose.yml           # orquestación completa con healthchecks
├── deploy-gcp.sh                # Cloud Run ×3 + Neon: despliegue por subcomandos
├── cloudbuild-frontend.yaml     # build del frontend con URLs build-time
├── backend-endorsements-hapi/   # Reto 1: Hapi + TypeORM + plantillas data-driven
│   ├── src/{routes,controllers,services,repositories,mappers,models,entities}
│   ├── src/{config,security,plugins,errors}
│   ├── src/seed/                # plantillas RUMBO y AUTO (idempotente)
│   ├── tests/                   # 25 tests (mapper, service, HTTP, CORS, scope)
│   └── Dockerfile · .dockerignore · .gcloudignore · .env.example
├── backend-routes-golang/       # Reto 2: Dijkstra puro + HTTP + JWT
│   ├── internal/{domain,service,httpapi,auth}
│   ├── cmd/{server,healthcheck}
│   ├── internal/**/*_test.go    # 20 tests / 40 casos (dominio, servicio, HTTP, CORS, JWT)
│   └── Dockerfile · .dockerignore · .gcloudignore
├── frontend-monolith/           # Reto 4: React + Vite + nginx (dos pestañas)
│   ├── src/{components,api,config.ts,types.ts}
│   ├── nginx.conf.template      # proxy /api/* + headers de seguridad
│   └── Dockerfile · .dockerignore · .gcloudignore · .env.example
├── architecture-drawio/         # Reto 3
│   ├── architecture.md          # diagnóstico, TO-BE, decisiones, Mermaid
│   ├── as-is.drawio             # diagrama editable del flujo actual
│   ├── as-is.png                # export 2× con fondo blanco (2240×1760)
│   ├── to-be.drawio             # diagrama editable de la solución
│   ├── to-be.png                # export 2× con fondo blanco (3200×3200)
│   └── render_drawio.py         # .drawio → PNG con Pillow (sin drawio CLI)
└── docs/
    ├── entrega-talsory.md       # correo de entrega al reclutador
    ├── auditoria-seguridad.md   # auditoría DevSecOps: matriz de riesgos, plan de corrección y rollback
    └── validacion-local.md      # guía de validación local pre-merge y pre-despliegue
```

---

## 12. Verificación ejecutada

| Comando | Resultado |
|---|---|
| `cd backend-routes-golang && go build ./... && go vet ./... && go test ./...` | OK — 4 paquetes de test, 20 tests (40 casos con subtests) |
| `cd backend-endorsements-hapi && npm run typecheck && npm test` | OK — `tsc --noEmit` limpio, **25/25** tests |
| Preflight CORS real (`OPTIONS` con `Origin: http://localhost:8080`) | OK — `204`, `Access-Control-Allow-Origin: http://localhost:8080` (nunca `*`), `Allow-Headers` con `authorization,content-type,x-api-version`, `Max-Age: 600`, `Expose-Headers: x-api-version` |
| Control negativo CORS (`Origin: http://evil.example.com`) | OK — **sin** `Access-Control-Allow-Origin`; en Hapi `200 {"message":"CORS error: Origin not allowed"}`, en Go `204` sin headers CORS |
| Token de demo: claims reales decodificados | OK — `scope` acotado (`endorse:translate` / `routes:optimal`) y vida real de `3600` s en todos los entornos |
| Escalada de scope (`{"scope":"admin:all"}`) y token cruzado entre servicios | OK — `400 VALIDATION_ERROR` al emitir, `403 FORBIDDEN` al consumir en el servicio equivocado |
| Locale del `403` de scope en Hapi | OK — `403 FORBIDDEN` con mensaje en español (`El token no tiene un scope autorizado para este endpoint`), cubierto por test |
| `cd frontend-monolith && npm run build` | OK — `tsc --noEmit` + `vite build` (156 kB JS / 8 kB CSS) |
| `docker compose config -q` | OK — compose válido |
| `docker compose down -v && docker compose up -d --build` | OK — partiendo de volumen limpio: `db`, `endorsements`, `routes` y `frontend` en *healthy*; `seed` terminó `Exited (0)` |
| `curl :8080/healthz` · `/health` de ambos backends | OK — `200 ok` a través de nginx; JSON `{"status":"ok"}` en 8082 y 8081 |
| Traducción end-to-end vía nginx (token → `/v1/endorse/translate`) | OK — 12 etiquetas en el orden de la plantilla, `'Default'` vs `''` preservados |
| Rutas vía nginx: Miraflores→San Isidro = 7 · `NODE_NOT_FOUND` · `NEGATIVE_WEIGHT` · `UNREACHABLE` | OK — `200` / `422` / `400` / `422` |
| `curl .../endorse/translate` sin `Authorization` | OK — `401 UNAUTHORIZED` |
| Grep de hardcode (`ProductosVida\\|TES008\\|EndososSimplesSACRumbo` en `src/`, excluyendo `seed`) | OK — sin resultados: el negocio vive en la plantilla, no en el código |
| `python3 architecture-drawio/render_drawio.py` | OK — `as-is.png` (2240×1760) y `to-be.png` (3200×3200), fondo blanco opaco |
| Despliegue en la nube (§8) | **ACTIVO** — 3 servicios Cloud Run (`us-central1`); smoke E2E `200` en Reto 1 y Reto 2, CORS con control positivo y negativo, frontend con indicadores operativos (ver [§0.1](#01-estado-del-despliegue-activo)) |

El procedimiento reproducible para repetir toda esta verificación antes de fusionar o redesplegar está en [docs/validacion-local.md](docs/validacion-local.md): gates de dependencias, ciclo de Docker Compose, humo funcional end-to-end y criterios de aceptación.
