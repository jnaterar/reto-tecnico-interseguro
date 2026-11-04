# --- build stage ---
FROM node:22-alpine AS builder

WORKDIR /app
COPY package*.json ./
# `npm ci` respeta el package-lock.json: builds reproducibles.
RUN npm ci --no-audit --no-fund
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# --- runtime stage ---
FROM node:22-alpine AS runtime

WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force
# `dist` incluye el API (dist/index.js) y el seed (dist/seed/seed.js).
COPY --from=builder /app/dist ./dist

ENV PORT=8082
EXPOSE 8082

# node:22-alpine trae busybox wget, suficiente para el healthcheck.
HEALTHCHECK --interval=15s --timeout=3s --start-period=15s --retries=5 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/health" >/dev/null 2>&1 || exit 1

CMD ["node", "dist/index.js"]
