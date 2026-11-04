# backend-routes-golang

Servicio de cálculo de rutas óptimas para asignación de grúas (Reto 2).

## API (v1)

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| GET | `/health` | — | Liveness simplificado |
| POST | `/v1/auth/token` | — | Emite JWT de demo (`ENABLE_DEMO_TOKEN`) |
| POST | `/v1/routes/optimal` | Bearer JWT | Calcula la base más cercana y la ruta |

### Variables de entorno

| Variable | Default | Uso |
|---|---|---|
| `PORT` | `8081` | Puerto HTTP (mismo valor en local y en Docker) |
| `JWT_SECRET` | `dev-secret-change-me-please` | Firma HS256 (mínimo 16 caracteres) |
| `JWT_TTL_MINUTES` | `60` | Vida del token |
| `ENABLE_DEMO_TOKEN` | `true` | Habilita `/v1/auth/token` (apagar en prod) |
| `CORS_ORIGIN` | `*` | Origen permitido para el frontend |

### Ejemplo

```bash
TOKEN=$(curl -s -X POST localhost:8081/v1/auth/token \
  -H 'Content-Type: application/json' -d '{}' | sed -E 's/.*"token":"([^"]+)".*/\1/')

curl -s -X POST localhost:8081/v1/routes/optimal \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{
    "accidentLocation": "San Isidro",
    "depots": ["Miraflores", "Ate"],
    "graph": {
      "Miraflores": { "San Isidro": 7, "Barranco": 3 },
      "San Isidro": { "Miraflores": 7, "Lince": 4 },
      "Barranco": { "Miraflores": 3, "Surco": 5 },
      "Lince": { "San Isidro": 4, "Surco": 6 },
      "Surco": { "Barranco": 5, "Lince": 6, "Ate": 10 },
      "Ate": { "Surco": 10 }
    }
  }'
```

## Decisiones de diseño

- **Grafo NO DIRIGIDO.** La entrada describe aristas en un solo sentido, pero
  una vía urbana se recorre en ambos. `NewGraph` normaliza cada arista a doble
  sentido; de lo contrario, bases que sí son alcanzables quedarían descartadas.
- **Dijkstra con `container/heap`** → O((V+E) log V).
- **Se evalúan TODAS las bases** y se elige la más cercana *alcanzable*. Una
  base aislada no bloquea a las demás.
- **Empates deterministas**: gana la primera base en el orden del input.
- **Errores tipados**: `VALIDATION_ERROR` (400), `NODE_NOT_FOUND` /
  `UNREACHABLE` (422), `UNAUTHORIZED` (401).
- **Extensibilidad**: el grafo viene en el payload; cambiar la red de Lima no
  toca el algoritmo.
- **Sin dependencias externas**: JWT HS256 con `crypto/hmac` para mantener el
  binario pequeño y auditable.
