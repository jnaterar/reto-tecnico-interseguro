# ---- Build ----
FROM node:22-alpine AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci --no-audit --no-fund

COPY . .

# Las VITE_* son BUILD-TIME: Vite las incrusta en el bundle durante `npm run
# build`. Por eso deben declararse como ARG y promoverse a ENV ANTES del build;
# si faltan, la SPA queda apuntando al fallback relativo (/endorse-api).
ARG VITE_API_ENDORSEMENTS_URL=/endorse-api
ARG VITE_API_ROUTES_URL=/routes-api
ENV VITE_API_ENDORSEMENTS_URL=$VITE_API_ENDORSEMENTS_URL
ENV VITE_API_ROUTES_URL=$VITE_API_ROUTES_URL

RUN npm run build

# ---- Runtime ----
FROM nginx:1.27-alpine AS runtime

# POR QUÉ EL PROXY INTERNO NO SIRVE EN CLOUD RUN:
# `proxy_pass http://endorsements:8082` y `http://routes:8081` dependen del DNS
# de la red de docker-compose. En Cloud Run cada backend tiene su propia URL
# HTTPS pública y ese DNS no existe, por lo que el proxy devolvería 502. La
# solución es construir la SPA con las VITE_* absolutas (ARG/ENV de arriba):
# el navegador llama directo a cada backend y CORS se encarga del resto.
# El bloque proxy de nginx se conserva solo para el flujo local de compose.
COPY nginx.conf.template /etc/nginx/templates/default.conf.template

# Cloud Run inyecta PORT en runtime. El entrypoint oficial de nginx ejecuta
# envsubst sobre el template y genera /etc/nginx/conf.d/default.conf, de modo
# que `listen ${PORT}` funciona tanto en local (8080) como en Cloud Run.
ENV PORT=8080

COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/healthz" >/dev/null 2>&1 || exit 1

CMD ["nginx", "-g", "daemon off;"]
