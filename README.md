# Reto Técnico — Interseguro (Technical Lead / Software Architect)

Monorepo con los tres retos resueltos y ejecutables de punta a punta.

| Reto | Entregable | Código | Verificación |
|---|---|---|---|
| 1 | Traductor de endosos `POST /v1/endorse/translate` con plantillas **data-driven** en BD | [`backend-endorsements-hapi/`](backend-endorsements-hapi) | 20/20 tests, `typecheck` y `build` verdes |
| 1 | Frontend operativo (formulario + JSON del core + visor de rutas) | [`frontend-monolith/`](frontend-monolith) | `npm run build` verde |
| 2 | Rutas óptimas de grúa (Dijkstra, grafo **no dirigido**) | [`backend-routes-golang/`](backend-routes-golang) | `go build`, `go vet` y `go test ./...` verdes |
| 3 | Arquitectura de préstamos con idempotencia, saga y reconciliación | [`architecture-drawio/architecture.md`](architecture-drawio/architecture.md) | Documento + diagramas Mermaid |

---

## 1. Arranque en un comando

```bash
docker compose up --build
```

Servicios (ver [`docker-compose.yml`](docker-compose.yml)):

| Servicio | URL | Notas |
|---|---|---|
| `frontend` | http://localhost:8080 | nginx sirve la SPA y proxya `/endorse-api` y `/routes-api` |
| `endorsements` | http://localhost:8082/health | Reto 1 · Hapi + TypeORM |
| `routes` | http://localhost:8081/health | Reto 2 · Go puro (sin dependencias) |
| `db` | localhost:**5433** | PostgreSQL 16 (5433 para no chocar con un Postgres local) |
| `seed` | — | Contenedor **one-shot**: siembra las plantillas y termina |

Topología:

```
navegador ──▶ frontend (nginx :8080)
                 ├── /endorse-api/* ──▶ endorsements:8082 ──▶ db:5432
                 └── /routes-api/*  ──▶ routes:8081
                        seed (efímero) ──▶ db:5432
```

El frontend usa **rutas relativas**; nginx (Docker) y el proxy de Vite (desarrollo)
resuelven el backend. No hay URLs absolutas ni CORS en el navegador.

Orden de arranque garantizado por healthchecks reales, no por `sleep`:
`db` → `endorsements` (crea tablas con TypeORM) → `seed` (inserta plantillas) y `frontend`.

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

**Problema.** El core espera un JSON estructurado y ordenado; la interfaz envía un
JSON plano. El mapeo entre ambos **no vive en el código**: vive en la base de datos.

**Decisión clave.** `templates` + `template_fields` + `template_events` describen,
por producto y tipo de endoso, el orden y la etiqueta de cada campo de `dynamicData`
y el orden de `eventAppliedEntities`. Cada campo declara su origen:

| `source` | Significado |
|---|---|
| `INPUT` | Se toma de un campo del request (`source_key`) |
| `CONSTANT` | Valor fijo de negocio (`constant_value`) |
| `DEFAULT` | Valor por defecto (`default_value`) — `'Default'` y `''` son valores distintos |

Consecuencia: **agregar un producto o tipo de endoso no requiere tocar código ni
desplegar**; es un `INSERT`. El servicio solo conoce el puerto `TemplateRepository`.

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

Respuesta (orden de propiedades significativo para el core):

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

`Routes (Joi)` → `Controller (HTTP)` → `Service (orquesta)` → `Repository (puerto)`
→ `TypeORM Adapter` → `Model` y `Mapper (puro)` → `Entity/DTO`.

El mapper es una función pura: recibe request + plantilla y devuelve el payload del
core, con lo que se testea sin HTTP y sin base de datos.

### Errores (envelope común `{"error": {...}}`)

| Código | HTTP | Cuándo |
|---|---|---|
| `VALIDATION_ERROR` | 400 | Contrato inválido (incluye fechas imposibles o formato ≠ `YYYY-MM-DD`) |
| `UNAUTHORIZED` | 401 | JWT ausente, manipulado o expirado |
| `TEMPLATE_NOT_FOUND` | 404 | No hay plantilla para ese producto + tipo de endoso |
| `TEMPLATE_INVALID` | 500 | La plantilla en BD está inconsistente (falta un `source_key`) |

Detalle completo, modelo de datos y SQL de extensibilidad:
[`backend-endorsements-hapi/README.md`](backend-endorsements-hapi/README.md).

---

## 4. Reto 2 — Ruta óptima de grúa

`POST /v1/routes/optimal` (JWT) recibe el accidente, las bases y el grafo; devuelve
la base **más cercana alcanzable**, el camino y la distancia.

**La trampa: el grafo es no dirigido.** El payload declara aristas en un solo
sentido (`"E": {"D": 6}`), pero una vía se recorre en ambos. Si se usa el grafo tal
cual, bases perfectamente alcanzables se descartan y el resultado es incorrecto.
`domain.NewGraph` normaliza cada arista a doble sentido antes de calcular.

Ejemplo del frontend: bases `A` y `C`, accidente en `E`, y un grafo donde **ninguna
arista declara `E` como origen** (solo aparece como destino de `D`).

| Enfoque | Resultado |
|---|---|
| Grafo dirigido (como llega) | `E` sin salidas → todas las bases inalcanzables (`UNREACHABLE`, 422) |
| Grafo normalizado (implementado) | `C` gana con 10 (`C → D → E`) frente a `A` con 21 (`A → B → E`) |

```bash
TOKEN=$(curl -s -X POST localhost:8081/v1/auth/token \
  -H 'Content-Type: application/json' -d '{}' | sed -E 's/.*"token":"([^"]+)".*/\1/')

curl -s -X POST localhost:8081/v1/routes/optimal \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"accidentLocation":"E","depots":["A","C"],
       "graph":{"A":{"B":12},"B":{"C":5,"E":9},"C":{"D":7},"D":{"E":3}}}'
```

Detalles, errores tipados (`VALIDATION_ERROR` 400, `NODE_NOT_FOUND`/`UNREACHABLE` 422,
`UNAUTHORIZED` 401), empates deterministas y tests:
[`backend-routes-golang/README.md`](backend-routes-golang/README.md).

---

## 5. Reto 3 — Préstamos: el dinero se duplica al hacer clic dos veces

Conclusión del análisis: **no es un problema de timeouts, es un fallo de contrato
de idempotencia**. Un reintento del cliente (racional ante un 502) vuelve a ejecutar
la dispersión.

Solución propuesta y proporcional: `Idempotency-Key` persistida con estado de la
operación + `UNIQUE` como control de concurrencia + outbox/evento para el efecto
irreversible + saga con compensación + máquina de estados + reconciliación. Se
eligió **Cloud Run + Pub/Sub** frente a Kafka/Kubernetes por costo y carga real
(≈600 préstamos/día), documentando el trade-off.

Documento completo, AS-IS/TO-BE, diagramas Mermaid y plan de migración:
[`architecture-drawio/architecture.md`](architecture-drawio/architecture.md).

---

## 6. Frontend

React 18 + TypeScript + Vite, sin librerías de UI (control total del bundle).

- **Pestaña Endosos**: formulario con el payload de ejemplo, JWT transparente,
  duración de la llamada, errores tipados y el JSON del core listo para copiar.
- **Pestaña Rutas**: grafo editable (con el caso que demuestra la normalización no
  dirigida), bases y resultado con el camino resaltado.
- Píldoras de salud que consultan `/health` de ambos backends cada 15 s.
- Tipado estricto, `ApiError` con `status`/`code`/`details`/`isNetworkError`.

---

## 7. Trampas identificadas y cómo se resolvieron

| Trampa | Resolución |
|---|---|
| Grafo dirigido vs. no dirigido | Normalización a doble sentido en `domain.NewGraph` + test del caso |
| Joi `isoDate()` **normaliza** `'2025-08-27'` a `'...T00:00:00.000Z'` | Validador `custom` con regex + round-trip `toISOString().slice(0,10)` |
| Joi acepta fechas imposibles (`2025-02-31`) | El mismo round-trip las rechaza (400) + test de regresión |
| `'Default'` vs `''` en valores por defecto | Se distinguen `default_value` nulo de cadena vacía; se preserva literal |
| Orden de `dynamicData` y de `eventAppliedEntities` | Orden definido en BD (`order_index`, `order_event`), no en el código |
| Plantillas hardcodeadas | Seed idempotente en BD + puerto de repositorio |
| Base aislada que rompe el cálculo | Se evalúan todas las bases y se ignoran las inalcanzables |
| Idempotencia como “subir el timeout” | Documento del Reto 3: contrato + clave de idempotencia |
| Distroless sin shell para healthcheck | Binario `cmd/healthcheck` compilado aparte |

---

## 8. Decisiones transversales

- **Sin `any`**, TypeScript `strict`, tipos de dominio en lugar de mapas sueltos.
- **Errores tipados** con un envelope único en ambos backends.
- **JWT HS256** sin dependencias en Go; en Node con `crypto`. `ENABLE_DEMO_TOKEN`
  existe solo para la demo: en producción se apaga y el IdP emite los tokens.
- **Healthchecks reales** (`/health`) y `depends_on: service_healthy` en lugar de esperas ciegas.
- **Dockerfiles multi-stage**: `npm ci` reproducible, runtime mínimo, usuario no root.
- **Arquitectura proporcional**: lo que el problema pide, no lo que el CV pide.

## 9. Supuestos y pendientes

- `DB_SYNCHRONIZE=true` solo para el entorno local; producción usa migraciones.
- El token de demo sirve para validar el flujo completo; falta integración con el IdP real.
- El frontend no tiene tests automatizados (el foco estaba en los backends).
- Pendiente para producción: métricas/trazas (OpenTelemetry), rate limiting,
  paginación en catálogos de plantillas y pruebas de carga del cálculo de rutas.
- Los pesos del grafo son números en la unidad que defina el consumidor (km/min);
  el servicio no impone semántica.

## 10. Estructura del repositorio

```
.
├── docker-compose.yml          # orquestación completa con healthchecks
├── backend-endorsements-hapi/  # Reto 1: Hapi + TypeORM + template data-driven
│   ├── src/{routes,controllers,services,repositories,mappers,models,entities}
│   ├── src/seed/               # plantillas RUMBO y AUTO (idempotente)
│   └── tests/                  # 20 tests (mapper, service, HTTP)
├── backend-routes-golang/      # Reto 2: Dijkstra puro + HTTP + JWT
│   ├── internal/{domain,service,httpapi,auth}
│   └── cmd/{server,healthcheck}
├── frontend-monolith/          # React + Vite + nginx
└── architecture-drawio/        # Reto 3: arquitectura y diagramas
    ├── architecture.md         # diagnóstico, TO-BE, decisiones, Mermaid
    ├── as-is.drawio            # diagrama editable del flujo actual
    └── to-be.drawio            # diagrama editable de la solución
```
