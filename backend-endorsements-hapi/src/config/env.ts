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
  jwtSecret: string;
  jwtTtlSeconds: number;
  enableDemoToken: boolean;
  corsOrigins: string[];
}

const MIN_SECRET_LENGTH = 16;

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

  const cors = env.CORS_ORIGINS?.trim();

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
    jwtSecret,
    jwtTtlSeconds: parseNumber(env.JWT_TTL_SECONDS, 3600),
    // En producción el emisor de tokens de demo queda apagado salvo opt-in.
    enableDemoToken: parseBoolean(env.ENABLE_DEMO_TOKEN, nodeEnv !== 'production'),
    corsOrigins: !cors || cors === '*' ? ['*'] : cors.split(',').map((origin) => origin.trim()),
  };
}
