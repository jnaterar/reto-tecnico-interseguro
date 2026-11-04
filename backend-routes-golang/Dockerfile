# --- build stage ---
FROM golang:1.22-alpine AS builder

WORKDIR /src
COPY go.mod ./
COPY . .
# Se compilan dos binarios: el servidor y un healthcheck propio, porque
# distroless no incluye shell ni curl/wget para el HEALTHCHECK.
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/routes-server ./cmd/server \
 && CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/healthcheck ./cmd/healthcheck

# --- runtime stage ---
FROM gcr.io/distroless/static-debian12:nonroot

COPY --from=builder /out/routes-server /routes-server
COPY --from=builder /out/healthcheck /healthcheck

ENV PORT=8081
EXPOSE 8081
USER nonroot:nonroot

HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=3 \
  CMD ["/healthcheck"]

ENTRYPOINT ["/routes-server"]
