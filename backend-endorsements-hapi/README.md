# Reto 1 — Traductor de Endosos (Node + Hapi + TypeORM)

API que recibe un **JSON plano** del front y lo transforma en el **JSON estructurado**
que espera el core (Insurtech), resolviendo orden, etiquetas, valores constantes,
valores por defecto y eventos **desde una plantilla almacenada en base de datos**.

El objetivo de diseño es que **un producto o tipo de endoso nuevo se agregue con
`INSERT`s, sin recompilar ni desplegar código**.

---

## 1. Contrato

### Entrada (`POST /v1/endorse/translate`)

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

Las fechas se validan como **fechas reales en formato `YYYY-MM-DD`**. Se verifican
con *round-trip* (`2025-02-31` se rechaza) y **no se normalizan** a timestamp: el
core recibe el literal pactado.

### Salida (JSON del core)

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
        {
          "insuranceObjectNumber": "1",
          "coverageEntities": [],
          "participationEntities": []
        }
      ],
      "plansEntity": { "description": "PlanRumbo" },
      "riskUnitNumber": "1"
    }
  ],
  "participationEntities": []
}
```

> Nota de contrato: `InicioVigenciaEndoso` recibe el literal `"Default"` porque así
> lo define la plantilla en BD. `TipoVigenciaEndoso` es `DEFAULT` con `""` (vacío
> válido). La diferencia entre *"sin default"* (`null` → error 422) y *"default
> vacío"* (`""` → válido) es deliberada y está cubierta por tests.

---

## 2. Cómo correr

### Local

```bash
npm install
cp .env.example .env
# requiere un PostgreSQL en DB_HOST/DB_PORT
npm run seed      # inserta las plantillas (idempotente)
npm run dev       # http://localhost:8082
```

### Docker

```bash
docker build -t endorsements-translator .
docker run --rm -p 8082:8082 --env-file .env endorsements-translator
```

### Seed y esquema contra una base externa (Neon / Cloud SQL)

En docker-compose el servicio `seed` es un contenedor one-shot que crea el
esquema con TypeORM y luego inserta las plantillas. **En Cloud Run ese
contenedor no existe**: hay que ejecutar el seed una vez desde una máquina con
acceso a la BD, apuntando a Neon (Postgres serverless) con TLS.

```bash
cd backend-endorsements-hapi
npm ci

# Valores que entrega Neon. DB_SSL es obligatorio: Neon rechaza conexiones sin TLS.
export DB_HOST="<host-neon>"          # p. ej. ep-xxx.us-east-1.aws.neon.tech
export DB_PORT="5432"
export DB_USER="<usuario>"
export DB_PASSWORD="<password>"
export DB_NAME="<base>"
export DB_SSL="true"
# Solo para esta ejecución: crea las tablas si no existen.
export DB_SYNCHRONIZE="true"
export JWT_SECRET="<secreto-de-16-o-mas-caracteres>"

npm run seed
```

Qué hace exactamente:

1. `createDataSource()` inicializa TypeORM con `DB_SYNCHRONIZE=true`, por lo que
   crea `products`, `endorsement_types`, `templates`, `template_fields` y
   `template_events` si faltan.
2. El seed inserta `RUMBO/CAMBIO_FRECUENCIA` y `AUTO/CAMBIO_FRECUENCIA` de forma
   idempotente (se puede repetir sin duplicar).
3. El servicio desplegado en Cloud Run debe usar **`DB_SYNCHRONIZE=false`**:
   solo lee plantillas; no debe alterar el esquema en cada arranque.

> Honestidad sobre migraciones: el repo no incluye un framework de migraciones.
> El bootstrap de esquema se hace con `synchronize=true` una sola vez (arriba).
> Para evolución de esquema en producción se deberían versionar migraciones
> TypeORM y cambiar el comando de bootstrap; está declarado como pendiente.

### Scripts

| Script | Descripción |
|---|---|
| `npm run dev` | Servidor con recarga (`tsx watch`) |
| `npm run build` | Compila TypeScript a `dist/` |
| `npm start` | Ejecuta el build de producción |
| `npm run seed` | Carga las plantillas de ejemplo |
| `npm test` | Suite de tests (Vitest) |
| `npm run typecheck` | `tsc --noEmit` (strict) |

---

## 3. API

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| `GET` | `/health` | No | Healthcheck |
| `POST` | `/v1/auth/token` | No | Emite JWT de demo (`ENABLE_DEMO_TOKEN=true`) |
| `POST` | `/v1/endorse/translate` | **JWT** | Traduce el endoso |
| `GET` | `/v1/templates` | **JWT** | Catálogo de plantillas activas (alimenta el selector del frontend) |
| `GET` | `/v1/templates/{producto}/{tipoEndoso}` | **JWT** | Plantilla aplicada: campos, origen de cada valor y eventos |

```bash
TOKEN=$(curl -s -X POST http://localhost:8082/v1/auth/token \
  -H 'content-type: application/json' -d '{}' | jq -r .token)

curl -s -X POST http://localhost:8082/v1/endorse/translate \
  -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -d '{"policyNumber":"08200000049","idEnvio":5984,"frecuencia":"Semestral",
       "tipoEndoso":"CambioFrecuencia","producto":"Rumbo","plan":"PlanRumbo",
       "moneda":"Nuevo Sol","usuario":"interface.servicios",
       "fechaSolicitud":"2025-08-27","fechaCliente":"2025-08-27",
       "fechaEfectiva":"2025-09-01"}' | jq
```

La respuesta incluye la cabecera `x-api-version: v1`.

Los dos endpoints de plantillas son de **solo lectura** y reutilizan el scope
`endorse:translate` a propósito: el token de demo tiene alcance cerrado y no se
amplía la superficie de autenticación por una consulta de catálogo.

```bash
# Catálogo: la lista de productos del selector sale de la BD, no del frontend.
curl -s http://localhost:8082/v1/templates \
  -H "authorization: Bearer $TOKEN" | jq

# Plantilla concreta (acepta el nombre visible o el código).
curl -s http://localhost:8082/v1/templates/AUTO/CambioFrecuencia \
  -H "authorization: Bearer $TOKEN" | jq '.fields | length'   # 7
```

---

## 4. Modelo data-driven

```
products            (id, name, code)
endorsement_types   (id, name, code)
templates           (id, product_id, endorsement_type_id, version, is_active)
template_fields     (id, template_id, label, order_index, source,
                     source_key, constant_value, default_value)
template_events     (id, template_id, description, order_event)
```

`template_fields.source` admite tres valores:

| `source` | Significado | Campos usados |
|---|---|---|
| `INPUT` | Se toma del request | `source_key` (+ `default_value` opcional) |
| `CONSTANT` | Valor fijo de negocio | `constant_value` |
| `DEFAULT` | Valor literal por defecto | `default_value` |

El mapper **ordena por `order_index`** y construye `dynamicData` en ese orden.
`eventEntity.description` es el evento de menor `order_event`; `eventAppliedEntities`
respeta el orden configurado.

### Agregar un producto o endoso nuevo (sin tocar código)

```sql
INSERT INTO products (name, code) VALUES ('Auto', 'AUTO');
INSERT INTO endorsement_types (name, code) VALUES ('CambioFrecuencia', 'CAMBIO_FRECUENCIA');
INSERT INTO templates (product_id, endorsement_type_id, version, is_active)
  VALUES ((SELECT id FROM products WHERE code='AUTO'),
          (SELECT id FROM endorsement_types WHERE code='CAMBIO_FRECUENCIA'), 1, true);
-- + filas en template_fields y template_events
```

El seed incluye un segundo producto (`AUTO`) precisamente para demostrar que la
extensibilidad es real; el test `service.test.ts` lo verifica con un repositorio
en memoria.

Como `GET /v1/templates` lee de `templates`, la plantilla nueva aparece sola en el
selector del frontend: la lista de productos **no** está escrita a mano en la
interfaz. El diagrama [`architecture-drawio/er-reto1.drawio`](../architecture-drawio/er-reto1.drawio)
modela estas cinco tablas con sus columnas reales.

---

## 5. Capas

| Capa | Archivo | Responsabilidad |
|---|---|---|
| Routes | [`src/routes/index.ts`](src/routes/index.ts) | Contrato HTTP + validación Joi |
| Controller | [`src/controllers/endorse.controller.ts`](src/controllers/endorse.controller.ts) | Adapta request/response |
| Controller (plantillas) | [`src/controllers/template.controller.ts`](src/controllers/template.controller.ts) | Catálogo y plantilla aplicada (solo lectura) |
| Service | [`src/services/endorse.service.ts`](src/services/endorse.service.ts) | Orquesta: busca plantilla y traduce |
| Service (plantillas) | [`src/services/template.service.ts`](src/services/template.service.ts) | Casos de uso de lectura sobre el mismo puerto |
| Repository (puerto) | [`src/repositories/template.repository.ts`](src/repositories/template.repository.ts) | Interfaz de acceso a plantillas |
| Repository (adaptador) | [`src/repositories/typeorm-template.repository.ts`](src/repositories/typeorm-template.repository.ts) | SQL/TypeORM |
| Entity (dominio/DTO) | [`src/entities/`](src/entities) | Tipos del contrato |
| Mapper | [`src/mappers/endorse.mapper.ts`](src/mappers/endorse.mapper.ts) | Transformación **pura**, sin I/O |
| Model | [`src/models/`](src/models) | Persistencia TypeORM |
| Composition root | [`src/app.ts`](src/app.ts) | Inyección de dependencias + envelope de errores |

El servicio depende del **puerto** `TemplateRepository` (Dependency Inversion), lo
que permite testear con `InMemoryTemplateRepository` sin PostgreSQL.

---

## 6. Errores tipados

Envelope estable: `{"error":{"code","message","details"}}`.

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "El payload no cumple el contrato",
    "details": [
      {
        "path": "fechaSolicitud",
        "type": "date.invalid",
        "message": "\"fechaSolicitud\" debe ser una fecha ISO válida con formato YYYY-MM-DD"
      }
    ]
  }
}
```

| Código | HTTP | Cuándo |
|---|---|---|
| `VALIDATION_ERROR` | 400 | Payload inválido (Joi), con el detalle por campo |
| `UNAUTHORIZED` | 401 | JWT ausente, inválido o expirado |
| `TEMPLATE_NOT_FOUND` | 404 | No hay plantilla para producto + tipo |
| `MISSING_FIELD_VALUE` | 422 | Campo `INPUT` sin valor y sin default |
| `TEMPLATE_CONFIG_INVALID` | 500 | Plantilla incoherente (orden duplicado, `CONSTANT` nulo, etc.) |

Hapi convierte el error de Joi en un Boom genérico antes de invocar al
`failAction`; por eso el handler revalida el payload contra el mismo esquema y no
pierde el detalle. En errores 5xx el mensaje se sustituye por uno genérico: ni
stack ni SQL llegan al cliente.

---

## 7. Tests

```text
tests/mapper.test.ts   9 tests  traducción exacta, orden, "Default" vs "",
                                 fallback de INPUT, errores de configuración
tests/service.test.ts  3 tests  orquestación, 404, extensibilidad sin código
tests/routes.test.ts   8 tests  health, 401 sin/com JWT, JWT manipulado,
                                 payload inválido, fechas imposibles, 404
```

```bash
npm test        # 20/20 en verde
npm run typecheck
npm run build
```

---

## 8. Decisiones y trade-offs

- **Plantillas en BD, no en código**: el orden de `dynamicData`, etiquetas y
  constantes son datos. Costo: más tablas y un seed. Beneficio: cero despliegues
  para nuevos productos.
- **Mapper puro**: sin dependencias de Hapi/TypeORM; es la pieza más testeada y
  la que concentra las reglas del core.
- **JWT propio (HS256 con `node:crypto`)**: sin dependencia externa, auditable y
  suficiente para el reto. En producción se integraría con el IdP corporativo
  (validación de `iss`/`aud`, rotación de claves, JWKS).
- **`DB_SYNCHRONIZE=true` en local**: pragmático para el reto. En producción se
  usarían migraciones versionadas.
- **Fechas verbatim**: se valida estrictamente pero no se mutan; el contrato del
  core queda determinista.
- **Envelope de error común**: evita que el front tenga que distinguir entre
  Boom y errores de dominio.

## 9. Supuestos y pendientes

- El `idEnvio` lo genera el sistema de origen; aquí se valida que sea entero > 0.
- `riskUnitEntities` tiene un único riesgo con `insuranceObjectNumber: "1"`,
  tal como muestra el ejemplo del enunciado; si el negocio requiere N riesgos,
  se extiende la plantilla (p. ej. una tabla `template_risk_units`).
- Persistencia de la traducción: fuera de alcance; el endpoint es idempotente
  por naturaleza (misma entrada → misma salida).
- Rate limiting y observabilidad (métricas/trazas) se delegan al API gateway.
