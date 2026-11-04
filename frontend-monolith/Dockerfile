# ---- Build ----
FROM node:22-alpine AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci --no-audit --no-fund

COPY . .

# Las bases son relativas por defecto; en la nube se sobreescriben con las
# URLs públicas de cada backend (build args).
ARG VITE_API_ENDORSEMENTS_URL=/endorse-api
ARG VITE_API_ROUTES_URL=/routes-api
ENV VITE_API_ENDORSEMENTS_URL=$VITE_API_ENDORSEMENTS_URL
ENV VITE_API_ROUTES_URL=$VITE_API_ROUTES_URL

RUN npm run build

# ---- Runtime ----
FROM nginx:1.27-alpine AS runtime

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1

CMD ["nginx", "-g", "daemon off;"]
