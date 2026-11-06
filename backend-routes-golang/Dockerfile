# --- build stage ---
# Go 1.26 fija la semantica de lenguaje; el toolchain 1.27 aporta la stdlib
# parcheada (1.22 esta EOL desde feb-2025 y no recibe correcciones de seguridad).
FROM golang:1.27.3-alpine3.24 AS builder

WORKDIR /src
COPY go.mod ./
COPY . .
# Se compilan dos binarios: el servidor y un healthcheck propio, porque
# distroless no incluye shell ni curl/wget para el HEALTHCHECK.
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/routes-server ./cmd/server \
 && CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/healthcheck ./cmd/healthcheck

# --- runtime stage ---
# Imagen final distroless: sin shell, sin paquetes del sistema y con usuario
# `nonroot` por defecto. El binario lee PORT con os.Getenv, tal como lo inyecta
# Cloud Run; 8081 es solo el valor por defecto para docker-compose/local.
FROM gcr.io/distroless/static-debian12:nonroot

COPY --from=builder /out/routes-server /routes-server
COPY --from=builder /out/healthcheck /healthcheck

ENV PORT=8081
EXPOSE 8081
USER nonroot:nonroot

HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=3 \
  CMD ["/healthcheck"]

ENTRYPOINT ["/routes-server"]
