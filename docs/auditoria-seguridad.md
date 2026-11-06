# Auditoría de seguridad — dependencias, runtimes e imágenes

**Fecha de la auditoría:** 2026-11-06
**Alcance:** `backend-endorsements-hapi` (Node + Hapi + TypeORM), `frontend-monolith` (React/Vite + nginx), `backend-routes-golang` (Go stdlib), Dockerfiles, `docker-compose.yml` y `cloudbuild-frontend.yaml`.
**Estado de la entrega:** `main` congelado en el tag `entrega-v1` (`8c7cd72`). Este documento vive en `develop` y es **aditivo**: no modifica código, manifiestos ni imágenes.

> **PHP:** el brief de auditoría mencionaba `composer.json`/`composer.lock`. En este repositorio **no existe PHP**; ese punto del alcance no aplica.

---

## 1. Resumen ejecutivo

| Dimensión | Resultado |
|---|---|
| Node.js runtime | ✅ `node:22-slim` → 22.23.4 (Maintenance LTS, EOL 2027-04-30) |
| Go toolchain | ❌ **EOL** — `golang:1.22-alpine` congelada desde 2025-02-05 |
| nginx runtime | ❌ **EOL** — rama 1.27 cerrada; tag sin reconstruir desde 2025-04-16 |
| Dependencias de producción (backend) | ⚠️ 3 moderadas: `typeorm@0.3.31 → glob@10.5.0 → minimatch@9.0.9` |
| Dependencias de producción (frontend) | ✅ `npm audit`: 0 vulnerabilidades |
| Dependencias de desarrollo/CI | ❌ 2 críticas, 1 alta, 6 moderadas (`vitest`, `tinypool`, `vite`, `esbuild`, `@vitest/mocker`) — **no viajan en las imágenes** |
| Imagen de runtime Go | ✅ `distroless/static-debian12:nonroot` |
| SCA en CI | ❌ `npm ci --no-audit` y `gcloud builds submit --tag` sin escaneo |

**Diagnóstico:** EN RIESGO. No se identificó RCE ni bypass TLS explotable en dependencias de producción, pero el artefacto desplegado arrastra un toolchain Go EOL y una base nginx EOL.

**Decisión de gestión:** los cambios se ejecutan en `develop`, con un commit por cambio y validación local. `main` no se modifica ni se redespliega hasta que cierre la evaluación.

---

## 2. Runtimes y base images

| Componente | Declarado | Estado | Origen |
|---|---|---|---|
| Node.js backend | `node:22-slim` (22.23.4) | ✅ Maintenance LTS | [`../backend-endorsements-hapi/Dockerfile`](../backend-endorsements-hapi/Dockerfile) |
| Node.js frontend (build) | `node:22-alpine` | ✅ Maintenance LTS | [`../frontend-monolith/Dockerfile`](../frontend-monolith/Dockerfile) |
| Go builder | `golang:1.22-alpine` + `go 1.22` | ❌ EOL (soportados 1.26 y 1.27) | [`../backend-routes-golang/Dockerfile`](../backend-routes-golang/Dockerfile), [`../backend-routes-golang/go.mod`](../backend-routes-golang/go.mod) |
| nginx | `nginx:1.27-alpine` (1.27.5) | ❌ EOL (última mainline 1.29.8; estable 1.28.3) | [`../frontend-monolith/Dockerfile`](../frontend-monolith/Dockerfile) |
| Distroless | `static-debian12:nonroot` | ✅ Debian 12 soportado hasta 2028 | [`../backend-routes-golang/Dockerfile`](../backend-routes-golang/Dockerfile) |
| PostgreSQL (compose) | `postgres:16-alpine` | ✅ EOL 2028-11-09 | [`../docker-compose.yml`](../docker-compose.yml) |

Ningún `FROM` fija digest: el build no es reproducible y la deriva de parches depende de reconstruir.

---

## 3. Matriz de vulnerabilidades y advisories

| Componente | Detectada | Segura mínima | Origen | Advisory / vector |
|---|---|---|---|---|
| Toolchain Go | 1.22 | 1.27.3 / 1.26.10 | Dockerfile Go | EOL; `CVE-2025-22871` (`net/http` request smuggling por chunked encoding) y posteriores sin backport |
| nginx | 1.27.5 | 1.29.8 / 1.28.3 | Dockerfile frontend | Rama cerrada; `CVE-2025-23419` (TLS session reuse) ya corregido en 1.27.4, pero sin parches futuros. Alpine 3.20/3.21 EOL |
| typeorm | 0.3.31 | 1.1.2 | `package.json` backend | GHSA-3g3m-2fjr-6pw4, GHSA-g3hv-75wg-m249 vía `glob`/`minimatch` |
| glob | 10.5.0 | 14.0.3 | `package-lock.json` backend | GHSA-3g3m-2fjr-6pw4 (traversal tras timeout de `AbortSignal`) |
| minimatch | 9.0.9 | 11.0.5 | `package-lock.json` backend | GHSA-g3hv-75wg-m249 (DoS por amplificación de `globparts`) |
| vitest | 2.1.9 | 5.1.0 | `package.json` backend (dev) | GHSA-5xrq-8626-4rwp (CVSS 9.8), GHSA-82fw-gwwq-j7x9, GHSA-qxg6-89mg-rqv8 |
| tinypool | 1.1.1 | ≥2.1.2 vía vitest 5 | lock backend (dev) | GHSA-5gmw-xhrv-c9v3, GHSA-85c8-ppgw-ccpr (prototype pollution → RCE) |
| vite | 5.4.21 | 6.4.4+ (recomendado 8.3.6) | lock backend (dev) | GHSA-587h-7wmj-h5pm (alta), GHSA-4w7w-66w2-5vf9, GHSA-rq7h-c2jc-7f22, GHSA-fx2h-pf6j-xcff, GHSA-9jrq-w75r-8gcw |
| esbuild | 0.21.5 | 0.25.0+ (0.28.2) | lock backend (dev) | GHSA-67mh-4wv8-2f99 (5.3) |
| @vitest/mocker | 2.1.9 | ≥4.1.12 vía vitest 5 | lock backend (dev) | GHSA-82fw-gwwq-j7x9, GHSA-qxg6-89mg-rqv8 |

**Conteo `npm audit` backend:** `{ critical: 2, high: 1, moderate: 6, total: 9 }`.
**Conteo `npm audit` frontend:** `{ total: 0 }`.
**Conteo `npm audit --omit=dev` (lo que realmente se despliega):** backend `{ moderate: 3 }`, todas en la cadena `typeorm@0.3.31 → glob@10.5.0 → minimatch`; frontend `{ total: 0 }`. Conclusión: las 2 críticas y la alta del árbol completo **no viajan a la imagen** (`npm ci --omit=dev` las excluye); el único hallazgo de producción es la cadena de TypeORM, y `npm audit` solo la corrige con `typeorm@1.1.2` (major).

**Go:** sin `go.sum`; no hay módulos de terceros, por lo que la superficie se limita a stdlib + imagen base.

### 3.1 Análisis de alcanzabilidad

- `glob`/`minimatch` se usan en TypeORM para cargar entidades por patrón. Este proyecto pasa un **array explícito de clases** en [`../backend-endorsements-hapi/src/config/data-source.ts`](../backend-endorsements-hapi/src/config/data-source.ts), no invoca el CLI ni globs, y el patrón nunca proviene del cliente. **No alcanzable por HTTP**: riesgo residual bajo.
- Las críticas (`vitest` UI, `tinypool`) son de tooling de test. `npm ci --omit=dev` las excluye del runtime y el frontend no las incluye en el bundle estático.
- El frontend compila con Vite 6.4.5 (fuera del rango afectado) y su imagen final solo contiene nginx + assets.
- No hay parsers XML/YAML ni descompresión de `Content-Encoding` en la ruta de request: solo JSON, con límite de payload de Hapi y `http.MaxBytesReader` de 1 MiB en Go.

---

## 4. Hallazgos no-CVE (configuración y arquitectura)

| # | Hallazgo | Evidencia | Decisión |
|---|---|---|---|
| A1 | `ssl: { rejectUnauthorized: false }` hacia Postgres | `backend-endorsements-hapi/src/config/data-source.ts` | **Corregir con pre-check contra Neon antes de desplegar** (si la CA no valida, el backend no arranca) |
| A2 | `ENABLE_DEMO_TOKEN=true` por defecto en el deploy | `deploy-gcp.sh` | **Riesgo aceptado durante la evaluación** (token acotado por `scope` y TTL de 1 h). Desactivar y rotar `JWT_SECRET` al cerrar |
| A3 | Secretos como env vars en Cloud Run | `deploy-gcp.sh` | Aceptado para la demo; migrar a Secret Manager con `--set-secrets` |
| A4 | `--allow-unauthenticated` en los 3 servicios | `deploy-gcp.sh` | Aceptado (demo pública); la autorización real es el JWT de aplicación |
| A5 | SCA deshabilitado (`--no-audit`) y sin escaneo de imágenes | ambos Dockerfiles, `deploy-gcp.sh` | **Corregir en CI** (gates no bloqueantes primero) |
| A6 | nginx corre como root, sin CSP/HSTS | `frontend-monolith/Dockerfile`, `nginx.conf.template` | Endurecer en la última fase |
| A7 | `npm ci` sin `--ignore-scripts` | ambos Dockerfiles | Endurecer en runtime/build |

---

## 5. Plan de corrección por commits (rama `develop`)

| # | Commit | Riesgo | Verificación |
|---|---|---|---|
| 0 | `docs(security): auditoría y riesgos aceptados` | nulo | — |
| 1 | `ci(security): gates SCA no bloqueantes` | bajo | `./scripts/sca.sh` |
| 2 | `build(go): toolchain 1.27 + go 1.26` | bajo | `go vet ./... && go test ./...` |
| 3 | `build(frontend): nginx 1.29-alpine` | bajo | `docker compose build frontend` + `nginx -t` |
| 4 | `chore: engines/.nvmrc + digest pinning` | nulo | `docker buildx imagetools inspect` |
| 5 | `fix(db): verificación TLS estricta` | medio (operativo) | pre-check TLS contra Neon + smoke |
| 6 | `deps: typeorm 1.1.2` | alto (major) | `npm run typecheck`, `npm test`, `npm run seed`, consulta real |
| 7 | `deps(dev): vitest 5 + vite 8` | alto (major) | `npm test` |
| 8 | `harden: runtime sin npm, nginx no-root, CSP/HSTS` | medio | smoke completo |

Regla: cada commit debe dejar `docker compose build --no-cache` y la suite de tests en verde. Si un commit falla la validación, se revierte individualmente (`git revert <sha>`).

### 5.1 Gates SCA locales (`scripts/sca.sh`)

El gate se implementó como script **aditivo y no bloqueante**, no como modificación de `deploy-gcp.sh` ni de `cloudbuild-frontend.yaml`: el pipeline que produjo la entrega queda byte a byte igual.

```bash
./scripts/sca.sh              # informa y sale 0 siempre
./scripts/sca.sh --strict     # sale 1 si hay hallazgos en dependencias de producción
./scripts/sca.sh --images     # además escanea las imágenes locales con trivy
```

Qué verifica: `npm audit --omit=dev` (bloqueante en modo `--strict`), `npm audit` del árbol completo (solo informativo, es donde viven las advisories de vitest/vite), `govulncheck ./...` sobre Go y `trivy image` con `--ignore-unfixed` sobre las tres imágenes. Los reportes quedan en `.sca/` (ignorado por git).

---

## 6. Validación y rollback

**Pre-check TLS (antes del commit 5):** abrir conexión con `rejectUnauthorized: true` contra el host pooled de Neon usando las mismas credenciales y verificar que la cadena valida desde el entorno de ejecución.

**Validación local completa:**

```bash
docker compose build --no-cache
docker compose up -d db endorsements routes frontend
docker compose run --rm seed
curl -fsS http://localhost:8080/healthz
curl -fsS http://localhost:8082/health
curl -fsS http://localhost:8081/health
docker compose exec frontend nginx -t
./deploy-gcp.sh smoke   # solo cuando exista una revisión nueva con tráfico
```

**Rollback de despliegue (si alguna vez se redespliega):**

```bash
# Guardar la imagen de la revisión que atiende tráfico antes de cambiar nada
gcloud run services describe endorsements --region us-central1 \
  --format='value(spec.template.spec.containers[0].image)'

# Desplegar sin tráfico y promover solo si el smoke pasa
gcloud run deploy endorsements --image IMAGE_NUEVA --no-traffic --tag canary
gcloud run services update-traffic endorsements --to-tags canary=100
# Revertir
gcloud run services update-traffic endorsements --to-revisions REVISION_ANTERIOR=100
```

---

## 7. Criterio de cierre

- `npm audit --audit-level=moderate` = 0 en ambos lockfiles.
- `govulncheck ./...` sin hallazgos en Go.
- Imágenes escaneadas sin HIGH/CRITICAL corregibles (Trivy o Artifact Registry scanning).
- Los tres smoke tests (`/health`, `/v1/templates`, `POST /v1/endorse/translate`) en verde.
- `main` intacto en `entrega-v1` hasta el cierre de la evaluación; el merge de `develop` es una decisión posterior y separada.
