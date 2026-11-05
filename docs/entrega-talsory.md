# Correo de entrega — Talsory

> Borrador listo para enviar. Los valores entre `<>` son los únicos que deben completarse
> (repositorio y URLs). No inventar URLs de despliegue: se dejan marcadas como pendientes.

---

**Para:** `<contacto@talsory>`
**CC:** `<equipo-interseguro>`
**Asunto:** Entrega del reto técnico — Traductor de endosos, rutas óptimas de grúa y arquitectura de préstamos

---

Hola `<nombre>`,

Adjunto la entrega del reto técnico solicitado por Interseguro. El trabajo está en un único
repositorio con los cuatro entregables ejecutables y verificados:

- **Repositorio:** `<URL_REPO>`
- **Demo (frontend unificado):** `<URL_DEMO_FRONTEND>` *(pendiente de despliegue; ver nota al final)*

## Qué incluye

1. **Traductor de endosos** (`Node + Hapi + TypeORM + PostgreSQL`): el mapeo entre el JSON plano
   de la interfaz y el JSON estructurado del core **vive en la base de datos**, no en el código.
   Plantillas, etiquetas y orden se resuelven desde tablas (`templates`, `template_fields`,
   `template_events`), por lo que **agregar un producto o tipo de endoso es un `INSERT`, no un deploy**.
2. **Ruta óptima de grúa** (`Go`, sólo librería estándar, sin dependencias): grafo **no dirigido**
   normalizado, Dijkstra con `container/heap`, bases evaluadas de forma independiente y errores
   tipados que distinguen *nodo inexistente* (`NODE_NOT_FOUND`) de *inalcanzable* (`UNREACHABLE`).
3. **Frontend unificado** (`React + TypeScript estricto + Vite`): pestaña «Traductor de endosos»
   con el JSON de ejemplo precargado y botón *Traducir*; pestaña «Ruta óptima de grúa» con selector
   de distrito y checklist de bases. Las dos consumen sus backends reales.
4. **Arquitectura del flujo de préstamos** (documento + diagramas editables): el dinero se duplica
   porque **falta idempotencia**, no porque falte timeout. Se propone `Idempotency-Key` persistida,
   `UNIQUE` como control de concurrencia, outbox/evento, saga con compensación, máquina de estados
   y reconciliación, sobre **Cloud Run + Pub/Sub** (≈600 préstamos/día no justifican Kafka/Kubernetes).

## Cómo levantarlo (un comando)

```bash
git clone <URL_REPO> && cd reto-tecnico-interseguro
docker compose up --build
```

- Frontend: http://localhost:8080
- Endosos (health): http://localhost:8082/health
- Rutas (health): http://localhost:8081/health
- PostgreSQL: `localhost:5433`

## Credenciales de prueba

No hay usuarios ni contraseñas reales. La autenticación es un **JWT HS256 de demo** que emite cada
backend; el frontend lo obtiene de forma transparente.

| Dato | Valor |
|---|---|
| Emisor Reto 1 | `POST http://localhost:8082/v1/auth/token` (cuerpo `{}`) |
| Emisor Reto 2 | `POST http://localhost:8081/v1/auth/token` (cuerpo `{}`) |
| Secreto local | `dev-secret-change-me-please` (`JWT_SECRET`, sólo local) |
| Vigencia | 3600 s en local; **900 s (15 min)** por default en producción |
| Scope | `endorse:translate` (endosos) y `routes:optimal` (rutas); cualquier otro se rechaza con `400`, y un token con scope ajeno recibe `403` |

El token de demo se mantiene encendido en el despliegue (`ENABLE_DEMO_TOKEN=true`) para que el jurado
pueda autenticarse, pero es de mínimos privilegios: no hay endpoints administrativos y la vida es corta.
En un escenario corporativo se apagaría con `ENABLE_DEMO_TOKEN=false` y los tokens los emitiría el IdP.

## Cómo está construido y cómo prioricé

**Arquitectura.** Ambos backends siguen el mismo corte por capas: `Routes → Controller → Service →
Repository (puerto) → Adaptador/Modelo`, con el mapeo y el algoritmo como **funciones puras** en el
dominio. Los errores son tipos con código y HTTP propio, no strings; el envelope es idéntico en los
dos servicios, lo que permite al frontend tener un único manejador de errores.

**Priorización declarada.** Primero la correctitud silenciosa (trampas que producen resultados
incorrectos sin lanzar error: grafo dirigido, orden de campos, `'Default'` vs `''`, bases aisladas),
después la experiencia que permite evaluar los retos en un minuto, y al final la narrativa de
infraestructura. Preferí terminar tres retos verificables antes que cuatro a medias.

## Despliegue en GCP

El despliegue está **preparado y validado en local, no ejecutado** contra GCP. La arquitectura es
**Cloud Run × 3** (frontend nginx, endorsements Node/Hapi, routes Go distroless) + **Neon Postgres**
externo, con dos endpoints: *pooled* para Cloud Run y *directo* para el bootstrap del esquema.

| Variable | Para qué |
|---|---|
| `DB_HOST_POOLED` / `DB_HOST_DIRECT` | Conexión Neon (runtime / bootstrap) |
| `DB_NAME`, `DB_USER`, `DB_PASSWORD` | Credenciales (la contraseña solo por entorno) |
| `JWT_SECRET` | Firma HS256 (≥16), vía Secret Manager |
| `ENABLE_DEMO_TOKEN` + `DEMO_TOKEN_TTL_*` | Token de demo para el jurado (`true`, TTL 900 s) |
| `CORS_ORIGINS` | Lista blanca de orígenes (la fija `update-cors`; nunca `*`) |
| `PROJECT_ID`, `REGION`, `AR_REPO` | Proyecto, región y Artifact Registry |

Orden: `./deploy-gcp.sh preflight && ./deploy-gcp.sh ensure-ar && ./deploy-gcp.sh ensure-secrets`;
luego `bootstrap-db` (una sola vez, con `DB_SYNCHRONIZE=true`); después `build`, `deploy` y `urls`;
y al final `update-cors`, que inyecta en ambos backends la URL real del frontend (antes de existir esa
URL los servicios corren con lista vacía, que es el estado seguro). El build del frontend pasa las
URLs absolutas como `--build-arg` (son build-time) mediante `cloudbuild-frontend.yaml`.

**Seguridad del despliegue público.** CORS por lista blanca con reflexión del origen exacto y
`Vary: Origin` (nunca `*`; `buildServer` falla si en producción se intenta), preflight `OPTIONS` 204
solo para orígenes permitidos y headers `authorization`, `content-type`, `x-api-version`. El token de
demo queda acotado: el emisor rechaza cualquier scope distinto de `endorse:translate` / `routes:optimal`
(400) y cada ruta exige el suyo (403), con vida de 15 minutos. En nginx solo se añadieron tres headers
(`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`): no hay WAF ni rate limiting porque el
alcance del reto no lo pide. `--allow-unauthenticated` es deliberado: es una demo pública evaluable, la
autorización real vive en el JWT de la aplicación y CORS no es un control de acceso, solo una regla de
navegador.

Tres notas honestas: (1) con Neon en `us-east-1` y Cloud Run en `us-central1`, cada ida y vuelta
añade ~15–30 ms, mitigado con el endpoint *pooled*; (2) no hay framework de migraciones: el esquema
se crea con `synchronize=true` una vez y luego el servicio corre con `false`; (3) Cloud Run escala a
cero, así que la primera petición tras un periodo de inactividad tarda unos segundos (cold start).

## Transparencia sobre el estado

- Verificado ejecutando comandos: **24/24 tests** de endosos, `typecheck` y `build` limpios;
  `go build`, `go vet` y `go test ./...` verdes; build del frontend verde; `docker compose config`
  válido y `docker compose up --build` con 4 servicios healthy + seed + smoke end-to-end por nginx.
- **CORS verificado con control negativo**: preflight desde el origen permitido devuelve 204 con el
  origen exacto en `Access-Control-Allow-Origin`; desde `http://evil.example.com` no se emite ese
  header. Cubierto también por tests unitarios en ambos backends.
- **Despliegue GCP**: `deploy-gcp.sh` y `cloudbuild-frontend.yaml` están creados y validados con
  dry checks locales (`bash -n`, `shellcheck`, fallo limpio, parseo YAML); **no se han ejecutado**
  contra GCP. La guía y el orden de comandos están en el README (sección 8).
- Los diagramas del Reto 3 se entregan en tres formatos: `.drawio` editable, `.png` ya exportado
  (2× y fondo blanco) y Mermaid legible en GitHub. Están redactados en español, conservando en
  inglés solo los términos reservados (`Idempotency-Key`, `202 Accepted`, `PENDING`, `Pub/Sub`, etc.).
- Pendientes declarados: tests de frontend y migraciones formales en lugar de `DB_SYNCHRONIZE`.

El README del repositorio incluye la **priorización declarada**, las **decisiones y trade-offs**
por reto, la tabla de trampas con su test asociado, los ejemplos `cURL` y la estructura del repo.

Quedo atento a cualquier aclaración o a una demo guiada.

Saludos cordiales,

**`<Tu nombre>`**
`<Cargo>` · `<teléfono>` · `<tu correo>`
