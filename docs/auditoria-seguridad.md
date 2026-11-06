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
**Conteo `npm audit --omit=dev` (lo que realmente se despliega):** backend `{ moderate: 3 }` → **`{ total: 0 }` tras el commit 7**, las 3 estaban en la cadena `typeorm@0.3.31 → glob@10.5.0 → minimatch`; frontend `{ total: 0 }`. Conclusión: las 2 críticas y la alta del árbol completo **no viajan a la imagen** (`npm ci --omit=dev` las excluye); el único hallazgo de producción era la cadena de TypeORM, y `npm audit` solo la corrige con `typeorm@1.1.2` (major, ya aplicado).

**Conteo tras el commit 8:** el árbol completo (incluyendo dev/test) queda en **`{ total: 0 }` en ambos servicios**. vitest `2.1.9 → 5.1.0` y vite `5.4.21 → 8.3.6` arrastran `tinypool≥2` y `esbuild 0.28.2`, con lo que desaparecen las 2 críticas, la alta y los moderados asociados a `@vitest/mocker`, `esbuild` y la UI de vitest. Los 9 advisories del backend pasan a 0 sin excepciones ni supresiones.

**Go:** sin `go.sum`; no hay módulos de terceros, por lo que la superficie se limita a stdlib + imagen base.

### 3.1 Análisis de alcanzabilidad

- `glob`/`minimatch` se usan en TypeORM para cargar entidades por patrón. Este proyecto pasa un **array explícito de clases** en [`../backend-endorsements-hapi/src/config/data-source.ts`](../backend-endorsements-hapi/src/config/data-source.ts), no invoca el CLI ni globs, y el patrón nunca proviene del cliente. **No alcanzable por HTTP**: riesgo residual bajo.
- Las críticas (`vitest` UI, `tinypool`) son de tooling de test. `npm ci --omit=dev` las excluye del runtime y el frontend no las incluye en el bundle estático.
- El frontend compila con Vite 8.3.6 (fuera del rango afectado) y su imagen final solo contiene nginx + assets.
- No hay parsers XML/YAML ni descompresión de `Content-Encoding` en la ruta de request: solo JSON, con límite de payload de Hapi y `http.MaxBytesReader` de 1 MiB en Go.

---

## 4. Hallazgos no-CVE (configuración y arquitectura)

| # | Hallazgo | Evidencia | Decisión |
|---|---|---|---|
| A1 | `ssl: { rejectUnauthorized: false }` hacia Postgres | `backend-endorsements-hapi/src/config/data-source.ts` | **Corregido en `develop`**: `DB_SSL_REJECT_UNAUTHORIZED` es `true` por defecto. Pre-check ejecutado contra el host real de Neon → `authorized=true`, TLSv1.3, Let's Encrypt, válido hasta 2027-01-20 |
| A2 | `ENABLE_DEMO_TOKEN=true` por defecto en el deploy | `deploy-gcp.sh` | **Riesgo aceptado durante la evaluación** (token acotado por `scope` y TTL de 1 h). Desactivar y rotar `JWT_SECRET` al cerrar |
| A3 | Secretos como env vars en Cloud Run | `deploy-gcp.sh` | Aceptado para la demo; migrar a Secret Manager con `--set-secrets` |
| A4 | `--allow-unauthenticated` en los 3 servicios | `deploy-gcp.sh` | Aceptado (demo pública); la autorización real es el JWT de aplicación |
| A5 | SCA deshabilitado (`--no-audit`) y sin escaneo de imágenes | ambos Dockerfiles, `deploy-gcp.sh` | **Corregido en `develop`**: los Dockerfiles siguen con `--no-audit` (para no frenar builds) pero el gate vive en `scripts/sca.sh`, fuera del pipeline que produjo la entrega |
| A6 | nginx corre como root, sin CSP/HSTS | `frontend-monolith/Dockerfile`, `nginx.conf.template` | **Corregido en `develop`**: `USER nginx` (uid 101 verificado en ejecución), PID en `/tmp`, `server_tokens off`, CSP, HSTS, `Permissions-Policy` y `frame-ancestors 'none'`. Cabeceras presentes también en 4xx |
| A7 | `npm ci` sin `--ignore-scripts` | ambos Dockerfiles | **Corregido en runtime**: `--ignore-scripts` en la etapa de producción del backend (ninguna dependencia de runtime necesita postinstall) |

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
| 6 | `deps: typeorm 1.1.2 + pg 8.23.1 + hapi 21.4.13` | alto (major) | **Hecho y validado** contra Neon (ver 5.2) |
| 7 | `deps(dev): vitest 5 + vite 8` | alto (major) | **Hecho y validado**: `npm test`, build y auditoría en 0 (ver 5.3) |
| 8 | `harden: runtime sin npm, nginx no-root, CSP/HSTS` | medio | **Hecho y validado**: smoke completo (ver 5.4) |

Regla: cada commit debe dejar `docker compose build --no-cache` y la suite de tests en verde. Si un commit falla la validación, se revierte individualmente (`git revert <sha>`).

### 5.1 Gates SCA locales (`scripts/sca.sh`)

El gate se implementó como script **aditivo y no bloqueante**, no como modificación de `deploy-gcp.sh` ni de `cloudbuild-frontend.yaml`: el pipeline que produjo la entrega queda byte a byte igual.

```bash
./scripts/sca.sh              # informa y sale 0 siempre
./scripts/sca.sh --strict     # sale 1 si hay hallazgos en dependencias de producción
./scripts/sca.sh --images     # además escanea las imágenes locales con trivy
```

Qué verifica: `npm audit --omit=dev` (bloqueante en modo `--strict`), `npm audit` del árbol completo (solo informativo, es donde viven las advisories de vitest/vite), `govulncheck ./...` sobre Go y `trivy image` con `--ignore-unfixed` sobre las tres imágenes. Los reportes quedan en `.sca/` (ignorado por git).

### 5.2 Evidencia del salto a TypeORM 1.1.2

Contexto del salto: `typeorm@0.3.31` no es una versión abandonada, es la **línea `legacy`** del paquete (`dist-tag legacy`), mientras que `latest` apunta a `1.1.2`. Es decir, la rama 0.3 sigue recibiendo parches, pero el advisory de `glob → minimatch` solo se resuelve en la línea 1.x.

Sin cambios de código. TypeORM 1.1.2 sustituye la cadena `glob`/`minimatch` por `tinyglobby` y **conserva los decoradores legacy**, que es justo lo que declara el `tsconfig.json` del backend (`experimentalDecorators` + `emitDecoratorMetadata`, `module: commonjs`). El código de acceso a datos tampoco necesitó ajustes: [`TypeOrmTemplateRepository`](backend-endorsements-hapi/src/repositories/typeorm-template.repository.ts:17) usa `createQueryBuilder` con `innerJoinAndSelect`/`leftJoinAndSelect`, API estable entre ambas líneas.

La validación no se apoyó en mocks: se ejecutó contra la base real de Neon, con la imagen construida con el lockfile nuevo.

| Verificación | Comando | Resultado |
|---|---|---|
| Tipado | `npm run typecheck` | OK, sin errores |
| Tests | `npm test` | 38/38 en verde |
| Build | `npm run build` | OK (`dist/` generado) |
| Lockfile con el npm del runtime | `docker build` sobre `node:22.23.4-slim` (npm 10.9.9) | `npm ci` OK |
| Listado de plantillas | `listTemplates()` | 2 plantillas |
| Plantilla AUTO | `findTemplate('AUTO','CAMBIO_FRECUENCIA')` | v1, 7 campos, 2 eventos |
| Plantilla RUMBO | `findTemplate('RUMBO','CAMBIO_FRECUENCIA')` | v1, 12 campos, 2 eventos |
| Endpoint de tokens | `GET /health`, `POST /v1/auth/token` | 200, JWT de 192 caracteres |
| Endpoints de plantillas | `GET /v1/templates`, `GET /v1/templates/{producto}/{tipoEndoso}` | 200 con payload correcto |
| Endoso traducido | `POST /v1/endorse/translate` | 200, `financialPlansEntity`/`productEntity`/`eventEntity` presentes, 7 `dynamicData`, 2 `eventAppliedEntities` |
| Advisories de producción | `npm audit --omit=dev` | `found 0 vulnerabilities` |

Efecto colateral medido: la instalación **eliminó 84 paquetes** del árbol (la cadena `glob`/`minimatch` completa), que es exactamente el origen de los 3 advisories moderados de producción.

### 5.3 Evidencia del salto de tooling: vitest 5 + vite 8

Estas 9 advisories (2 críticas, 1 alta, 6 moderadas) eran **solo de herramientas de test**: `npm ci --omit=dev` nunca las instaló en la imagen y el bundle del frontend es estático. Aun así se corrigieron para no dejar deuda en el árbol.

Detalle de resolución: vitest 5.1.0 declara `vite` como **peer** (`^6.4 || ^7 || ^8`) y el árbol anterior retenía `vite@5.4.21`. En vez de forzar la instalación con `--force` o `--legacy-peer-deps` —que produciría un lockfile que `npm ci` rechazaría—, se declaró `vite@^8.3.6` de forma explícita en el backend. En el frontend el salto obliga a acompañar el plugin: [`@vitejs/plugin-react`](frontend-monolith/package.json:25) sube a `6.2.1`, cuya única exigencia dura es `vite ^8` (los peers `oxc-transform-react`, `@rolldown/plugin-babel` y `babel-plugin-react-compiler` son opcionales).

| Verificación | Backend | Frontend |
|---|---|---|
| Versiones resueltas | vitest 5.1.0, vite 8.3.6 | vite 8.3.6, plugin-react 6.2.1, react 18.3.1 |
| Tipo | `npm run typecheck` OK | `npm run typecheck` OK |
| Tests | `npm test` → 38/38 | — (sin suite, el build valida el bundle) |
| Build | `npm run build` OK | `vite build` OK: 37 módulos, `dist/assets` generado |
| Lockfile con npm 10.9.9 | `docker build` OK | `docker build` OK |
| Auditoría prod | `found 0 vulnerabilities` | `found 0 vulnerabilities` |
| Auditoría árbol completo | `found 0 vulnerabilities` | `found 0 vulnerabilities` |
| Smoke HTTP | `/health` 200, `/v1/templates` 200, `/v1/endorse/translate` 200 (7 `dynamicData`, 2 `eventAppliedEntities`), sin token 401 | `/` 200, `/healthz` 200, asset `/assets/index-*.js` 200 |

Efecto en el árbol: el backend retiró 21 paquetes y el frontend 50 (toda la cadena de esbuild antiguo, tinypool y `@vitest/*` vulnerables).

### 5.4 Endurecimiento de los runtimes

Tres cambios, todos verificados en ejecución y no solo en el build:

1. **El backend ya no lleva `npm`.** En la etapa de producción se instala con `--omit=dev --ignore-scripts` y después se borran `npm`, `npx` y `corepack` del sistema de archivos. Ninguna dependencia de runtime necesita postinstall (`pg` es JS puro y TypeORM 1.x dejó de arrastrar `glob`), y el proceso nunca invoca el gestor de paquetes: ni el `CMD` ni el `HEALTHCHECK` ni el contenedor `seed` de [`docker-compose.yml`](docker-compose.yml:73), que ejecuta `node dist/seed/seed.js`. `bootstrap-db` de [`deploy-gcp.sh`](deploy-gcp.sh:330) hace `npm ci` en el **host**, no dentro de la imagen, así que tampoco se ve afectado.
2. **nginx corre sin privilegios.** El puerto 8080 no es privilegiado, así que el master no necesita root: se reasignan a `nginx` los directorios que escribe el entrypoint (`/etc/nginx/conf.d`) y los de caché/log, se mueve el PID de `/var/run` a `/tmp` y se comenta la directiva `user` (sin root nginx la ignora con un warning).
3. **Cabeceras de seguridad.** `server_tokens off`, CSP con `script-src 'self'` (el bundle de Vite carga todo desde `/assets` y no hay HTML inyectado ni scripts inline), `style-src 'self' 'unsafe-inline'` (React puede aplicar atributos `style`), `connect-src 'self' https:` para cubrir tanto las rutas relativas de compose como las URLs absolutas de Cloud Run, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, `frame-ancestors 'none'` y HSTS de un año sin `includeSubDomains` ni `preload`.

| Verificación | Resultado |
|---|---|
| `docker build` backend y frontend | OK |
| Usuario del proceso backend | `uid=1000 (node)` |
| `npm`/`npx` dentro del contenedor backend | ausentes; `node -v` = v22.23.4 |
| Usuario del master nginx | `uid=101 (nginx)` |
| `nginx -t` dentro del contenedor | `syntax is ok` / `test is successful` |
| `/health` backend contra Neon real | 200 |
| `/v1/templates` y `/v1/endorse/translate` con token | 200 / 200 |
| Frontend `/`, `/healthz` y asset `/assets/index-*.js` | 200 / 200 / 200 |
| Cabeceras en respuesta 200 y en 404 | CSP, HSTS, `Permissions-Policy` y `X-Frame-Options` presentes en ambas |

Sin cambios en `deploy-gcp.sh`, `cloudbuild-frontend.yaml` ni `docker-compose.yml`: el pipeline y la orquestación que produjeron la entrega siguen intactos.

---

## 6. Validación y rollback

**Pre-check TLS (commit 5) — ejecutado y aprobado.** Handshake con SNI y `rejectUnauthorized: true` contra el host pooled de Neon, lanzado desde la propia imagen `node:22.23.4-slim`:

```bash
HOST="$(grep -m1 '^export DB_HOST_POOLED=' deploy.env.sh | sed -e 's/^export DB_HOST_POOLED=//' -e 's/^"//' -e 's/"$//')"
docker run --rm -e H="$HOST" node:22.23.4-slim node -e '
const tls = require("node:tls");
const s = tls.connect({ host: process.env.H, port: 5432, servername: process.env.H, rejectUnauthorized: true }, () => {
  console.log("authorized =", s.authorized, "|", s.getProtocol());
  s.end();
});
s.on("error", (e) => { console.log("ERROR:", e.code); process.exit(1); });'
```

Resultado: `authorized = true`, `TLSv1.3`, emisor **Let's Encrypt**, CN `*.c-16.us-east-1.aws.neon.tech`, válido hasta **2027-01-20**. Let's Encrypt está en el trust store de Node 22, así que activar la verificación estricta no impide que el backend arranque.

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
