# --- build stage ---
# Node 22 es LTS en mantenimiento (soporte hasta 2027-04-30). Se fija el patch
# exacto para que el build no cambie por un `docker pull` (tag movil `22-slim`).
FROM node:22.23.4-slim AS builder

WORKDIR /app
COPY package*.json ./
# `npm ci` respeta el package-lock.json: builds reproducibles.
RUN npm ci --no-audit --no-fund
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# --- runtime stage ---
FROM node:22.23.4-slim AS runtime

WORKDIR /app
ENV NODE_ENV=production
# Cloud Run inyecta PORT en runtime; 8082 es solo el valor por defecto para
# docker-compose y ejecución local.
ENV PORT=8082

COPY package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force
# `dist` incluye el API (dist/index.js) y el seed (dist/seed/seed.js).
COPY --chown=node:node --from=builder /app/dist ./dist

# node:22-slim trae el usuario sin privilegios `node` (uid 1000).
# Cloud Run no requiere root: la app solo lee archivos y abre un socket.
USER node

EXPOSE 8082

# Healthcheck sin wget/curl: Node 22 incluye `fetch` global y respeta PORT.
HEALTHCHECK --interval=15s --timeout=3s --start-period=15s --retries=5 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:' + process.env.PORT + '/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"]

CMD ["node", "dist/index.js"]
