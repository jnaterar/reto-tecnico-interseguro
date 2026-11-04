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
| Vigencia | 3600 s (endosos) / 60 min (rutas) |

En producción se apaga con `ENABLE_DEMO_TOKEN=false` y los tokens los emite el IdP.

## Cómo está construido y cómo prioricé

**Arquitectura.** Ambos backends siguen el mismo corte por capas: `Routes → Controller → Service →
Repository (puerto) → Adaptador/Modelo`, con el mapeo y el algoritmo como **funciones puras** en el
dominio. Los errores son tipos con código y HTTP propio, no strings; el envelope es idéntico en los
dos servicios, lo que permite al frontend tener un único manejador de errores.

**Priorización declarada.** Primero la correctitud silenciosa (trampas que producen resultados
incorrectos sin lanzar error: grafo dirigido, orden de campos, `'Default'` vs `''`, bases aisladas),
después la experiencia que permite evaluar los retos en un minuto, y al final la narrativa de
infraestructura. Preferí terminar tres retos verificables antes que cuatro a medias.

## Transparencia sobre el estado

- Verificado ejecutando comandos: **20/20 tests** de endosos, `typecheck` y `build` limpios;
  `go build`, `go vet` y `go test ./...` verdes; build del frontend verde; `docker compose config` válido.
- **No ejecutado** en este entorno: `docker compose up --build` y el despliegue cloud. La guía de
  despliegue (GCP Cloud Run, con alternativa Render/Railway) está en el README, paso a paso.
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
