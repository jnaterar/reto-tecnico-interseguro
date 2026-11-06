import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';

export interface AppConfig {
  nodeEnv: string;
  host: string;
  port: number;
  dbHost: string;
  dbPort: number;
  dbUser: string;
  dbPassword: string;
  dbName: string;
  dbSynchronize: boolean;
  dbLogging: boolean;
  dbSsl: boolean;
  /**
   * Verificación estricta del certificado del servidor Postgres.
   * `true` por defecto: un `DB_SSL=true` sin verificación acepta cualquier
   * certificado y convierte TLS en cifrado sin autenticación (MITM trivial).
   * Solo se pone en `false` explícitamente contra un certificado self-signed.
   */
  dbSslVerify: boolean;
  jwtSecret: string;
  jwtTtlSeconds: number;
  enableDemoToken: boolean;
  corsOrigins: string[];
}

const MIN_SECRET_LENGTH = 16;

// Orígenes que usa el navegador en local: nginx del compose (:8080) y el
// servidor de desarrollo de Vite (:5173). Solo aplican cuando NODE_ENV no es
// production; en producción CORS_ORIGINS es obligatoria.
const DEFAULT_DEV_CORS_ORIGINS = ['http://localhost:8080', 'http://localhost:5173'];

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) {
    return fallback;
  }
  return value.toLowerCase() === 'true';
}

function parseNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * Convierte `CORS_ORIGINS` (lista separada por comas) en un array normalizado.
 *
 * - `*` solo se conserva tal cual: `buildServer` lo rechaza en producción.
 * - En desarrollo, si no se define, se aceptan los orígenes locales conocidos.
 * - En producción, si no se define, la lista queda vacía (sin CORS) hasta que
 *   `update-cors` fije la URL real del frontend. Nunca se asume `*`.
 */
function parseOrigins(value: string | undefined, nodeEnv: string): string[] {
  const raw = value?.trim();
  if (!raw) {
    return nodeEnv === 'production' ? [] : [...DEFAULT_DEV_CORS_ORIGINS];
  }
  return raw
    .split(',')
    .map((origin) => origin.trim().replace(/\/+$/, ''))
    .filter((origin) => origin.length > 0);
}

/**
 * Lee una variable obligatoria sin inventar un valor.
 *
 * No hay defaults a `localhost` ni a nombres de docker-compose: la misma imagen
 * debe funcionar en Cloud Run (Cloud SQL) y en local, y un fallback silencioso
 * apuntaría al host equivocado sin fallar. El valor se devuelve sin `trim` para
 * no alterar contraseñas que contengan espacios.
 */
function requireEnv(env: NodeJS.ProcessEnv, key: string): string {
  const value = env[key];
  if (value === undefined || value.trim().length === 0) {
    throw new Error(
      `Falta la variable de entorno obligatoria ${key}. ` +
        'Defínela explícitamente (ver .env.example); no se asume ningún host por defecto.',
    );
  }
  return value;
}

let dotenvLoaded = false;

/**
 * Comodidad para ejecución local sin Docker (`npm run dev` / `npm run seed`):
 * carga `.env` una sola vez. Nunca se ejecuta en producción ni dentro de la
 * imagen (NODE_ENV=production y `.dockerignore` excluye `.env`).
 */
function loadLocalEnvOnce(): void {
  if (dotenvLoaded || process.env.NODE_ENV === 'production') {
    return;
  }
  dotenvLoaded = true;
  if (typeof loadEnvFile === 'function' && existsSync('.env')) {
    loadEnvFile('.env');
  }
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  if (env === process.env) {
    loadLocalEnvOnce();
  }

  const nodeEnv = env.NODE_ENV?.trim() || 'development';
  const jwtSecret = requireEnv(env, 'JWT_SECRET');
  if (jwtSecret.length < MIN_SECRET_LENGTH) {
    throw new Error(`JWT_SECRET debe tener al menos ${MIN_SECRET_LENGTH} caracteres`);
  }

  return {
    nodeEnv,
    host: env.HOST?.trim() || '0.0.0.0',
    // Cloud Run inyecta PORT; 8082 es solo el puerto por defecto del servicio.
    port: parseNumber(env.PORT, 8082),
    dbHost: requireEnv(env, 'DB_HOST'),
    dbPort: parseNumber(env.DB_PORT, 5432),
    dbUser: requireEnv(env, 'DB_USER'),
    dbPassword: requireEnv(env, 'DB_PASSWORD'),
    dbName: requireEnv(env, 'DB_NAME'),
    // false por defecto: `synchronize` en producción es peligroso. Local y
    // docker-compose lo activan explícitamente.
    dbSynchronize: parseBoolean(env.DB_SYNCHRONIZE, false),
    dbLogging: parseBoolean(env.DB_LOGGING, false),
    // Postgres gestionado (Cloud SQL por IP pública, Render) exige TLS.
    dbSsl: parseBoolean(env.DB_SSL, false),
    // Estricto por defecto: la CA del servidor debe validar contra el trust
    // store de Node. Neon usa Let's Encrypt, presente en el trust store.
    dbSslVerify: parseBoolean(env.DB_SSL_REJECT_UNAUTHORIZED, true),
    jwtSecret,
    // Una hora en todos los entornos: el jurado no debería tener que re-emitir
    // el token, y el riesgo queda acotado por el scope (endorse:translate) y la
    // lista blanca de CORS. deploy-gcp.sh envía el mismo valor.
    jwtTtlSeconds: parseNumber(env.JWT_TTL_SECONDS, 3600),
    // En producción el emisor de tokens de demo queda apagado salvo opt-in.
    enableDemoToken: parseBoolean(env.ENABLE_DEMO_TOKEN, nodeEnv !== 'production'),
    corsOrigins: parseOrigins(env.CORS_ORIGINS, nodeEnv),
  };
}
