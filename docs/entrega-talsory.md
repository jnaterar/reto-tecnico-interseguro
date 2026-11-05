# Correo de entrega — Reto Técnico Interseguro

> Plantilla lista para enviar. Los valores entre `<>` son los únicos que debes completar
> (nombre, cargo, contacto, repositorio y URLs). **Ninguna URL de despliegue está inventada**:
> queda marcada como pendiente hasta ejecutar la guía de despliegue del README (§8).

---

**Para:** `<nombre-del-contacto>` · `<contacto@talsory>`
**CC:** `<equipo-de-reclutamiento>`
**Asunto:** Entrega del reto técnico — Traductor de endosos, rutas óptimas de grúa y arquitectura de préstamos

---

Hola `<nombre-del-contacto>`:

Gracias por la oportunidad de participar en el proceso para **Software Architect / Technical Lead**
en Interseguro. Envío la entrega completa del reto técnico: los tres ejercicios resueltos más el
frontend que los unifica, en un único repositorio reproducible.

- **Repositorio:** `<URL_REPO>` (rama `main`)
- **Demo desplegada:** `<URL_DEMO_FRONTEND>` — *pendiente de despliegue; los artefactos están
  listos y validados en local, ver más abajo*
- **Documento principal:** el `README.md` del repositorio. Está pensado para leerse en unos
  15 minutos y contiene el resumen ejecutivo, las trampas de cada reto, las decisiones y los
  comandos exactos que ejecuté.

## Cómo evaluarlo

**En local, con un solo comando:**

```bash
git clone <URL_REPO> && cd reto-tecnico-interseguro
docker compose up --build
```

Cuando los cuatro servicios estén *healthy*, abre **http://localhost:8080**. El token de demo se
pide solo, no hay que configurar nada.

**En el despliegue, en tres pasos (cuando la URL esté publicada):**

1. Abre `<URL_DEMO_FRONTEND>` en el navegador.
2. Pestaña **Traductor de endosos** → botón **Traducir** (el JSON de ejemplo ya viene cargado).
3. Pestaña **Ruta óptima de grúa** → elige un distrito y marca las bases → **Calcular ruta**.

Si el despliegue aún no está arriba, esos mismos tres pasos funcionan igual en `localhost:8080`.

## Credenciales de prueba

No hay usuarios ni contraseñas reales. La autenticación es un **JWT HS256 de demo** que emite cada
backend y que el frontend obtiene de forma transparente.

| Dato | Valor |
|---|---|
| Emisor Reto 1 | `POST /v1/auth/token` en el servicio de endosos (cuerpo `{}`) |
| Emisor Reto 2 | `POST /v1/auth/token` en el servicio de rutas (cuerpo `{}`) |
| Secreto local | `dev-secret-change-me-please` (`JWT_SECRET`, solo local; en la nube va por Secret Manager) |
| Vigencia | 3600 s (1 hora) en todos los entornos |
| Alcance | `endorse:translate` (endosos) y `routes:optimal` (rutas); cualquier otro scope se rechaza con `400` al emitir y con `403` al consumir |

El emisor de demo queda encendido en el despliegue (`ENABLE_DEMO_TOKEN=true`) para que puedas
autenticarte sin infraestructura adicional, pero es de **mínimos privilegios**: no hay endpoints
administrativos, cada ruta exige su scope y la lista de orígenes CORS está cerrada. En un escenario
corporativo se apaga con `ENABLE_DEMO_TOKEN=false` y los tokens los emite el IdP.

## Cinco decisiones que explican el resto

1. **El negocio vive en la base de datos, no en el código.** El mapeo del traductor de endosos se
   resuelve desde plantillas (`templates`, `template_fields`, `template_events`). Agregar un
   producto o un tipo de endoso es un `INSERT`, no un *deploy*. Es la diferencia entre resolver el
   caso de hoy y resolver el siguiente.
2. **Grafo no dirigido y errores tipados.** El grafo se normaliza en ambos sentidos, Dijkstra corre
   sobre `container/heap` y cada base se evalúa de forma independiente. Distingo *nodo inexistente*
   (`NODE_NOT_FOUND`) de *inalcanzable* (`UNREACHABLE`) porque son incidentes distintos para quien
   opera la grúa.
3. **En préstamos, la causa raíz es la falta de idempotencia, no el timeout.** Un `502` no duplica
   dinero por sí solo; lo duplica reintentar sin una llave idempotente. Propongo `Idempotency-Key`
   persistida, un `UNIQUE` como control de concurrencia, outbox/saga con compensación y una máquina
   de estados con reconciliación sobre **Cloud Run + Pub/Sub**. Con ~600 préstamos/día, Kafka y
   Kubernetes serían coste sin beneficio.
4. **Despliegue sin estado y configurable.** Tres servicios en Cloud Run (nginx, Node/Hapi, Go
   distroless) contra **Neon Postgres** externo, con endpoint *pooled* para el runtime y *directo*
   para el bootstrap. Toda la configuración entra por variables de entorno validadas al arrancar:
   el proceso falla rápido si falta algo, en lugar de arrancar a medias.
5. **Seguridad proporcional a una demo pública.** CORS por lista blanca con reflexión del origen
   exacto (`Vary: Origin` además en el servicio Go; nunca `*`, y el backend Hapi se niega a arrancar
   en producción con comodín), scope mínimo por ruta y tres cabeceras de endurecimiento en nginx.
   `--allow-unauthenticated` es deliberado: es una demo evaluable y CORS no es un control de acceso,
   solo una regla del navegador.

## Sobre el despliegue

El despliegue está **preparado y validado en local, no ejecutado** contra GCP, porque no cuento con
un proyecto activo en este momento. Entrego el script `deploy-gcp.sh` por subcomandos
(`preflight`, `ensure-ar`, `ensure-secrets`, `bootstrap-db`, `build`, `deploy`, `urls`, `update-cors`)
y el `cloudbuild-frontend.yaml` que inyecta las URLs del frontend en tiempo de build. El orden exacto
y las variables requeridas están en la sección 8 del README.

El único paso que no puede automatizarse de antemano es `update-cors`: la URL del frontend no existe
hasta que el frontend está desplegado, y los backends necesitan conocerla. Mientras tanto corren con
lista vacía, que es el estado seguro (rechaza todos los orígenes).

## Transparencia sobre el estado

- **Verificado ejecutando comandos:** 25/25 tests del servicio de endosos, 20 tests (40 casos) del
  servicio de rutas, `typecheck` y `build` limpios en frontend y backend, `docker compose config`
  válido y `docker compose up -d --build` levantando 4 servicios *healthy* más el seed y un flujo
  end-to-end a través de nginx.
- **CORS con control negativo:** el preflight desde el origen permitido devuelve `204` con el
  origen exacto en `Access-Control-Allow-Origin`; desde `http://evil.example.com` no se emite esa
  cabecera. También está cubierto por tests unitarios en ambos backends.
- **Despliegue en GCP:** artefactos creados y validados con dry checks locales (`bash -n`,
  `shellcheck`, parseo del YAML); no ejecutados contra la nube. Las URLs del correo y del README
  son placeholders, no valores inventados.
- **Pendientes declarados:** tests automatizados del frontend, un framework de migraciones en lugar
  de `DB_SYNCHRONIZE`, e integración con el IdP real (OIDC/JWKS) en lugar del token de demo.

El README incluye además la priorización declarada, los criterios que descarté y por qué
(Nx/Turborepo, Cloud SQL frente a Neon, Kafka/Kubernetes), la tabla de trampas con su test asociado
y los ejemplos `cURL` que realmente ejecuté.

Quedo atento a cualquier aclaración o a una demo guiada.

Saludos cordiales,

**`<Tu nombre>`**
`<Cargo>` · `<teléfono>` · `<tu correo>`
