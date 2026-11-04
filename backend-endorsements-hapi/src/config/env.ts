export interface AppConfig {
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

const DEFAULT_SECRET = 'dev-secret-change-me-please';

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

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const jwtSecret = env.JWT_SECRET ?? DEFAULT_SECRET;
  if (jwtSecret.length < 16) {
    throw new Error('JWT_SECRET debe tener al menos 16 caracteres');
  }

  const cors = env.CORS_ORIGINS?.trim();

  return {
    host: env.HOST ?? '0.0.0.0',
    port: parseNumber(env.PORT, 8082),
    dbHost: env.DB_HOST ?? 'localhost',
    dbPort: parseNumber(env.DB_PORT, 5432),
    dbUser: env.DB_USER ?? 'interseguro',
    dbPassword: env.DB_PASSWORD ?? 'interseguro',
    dbName: env.DB_NAME ?? 'endorsements',
    dbSynchronize: parseBoolean(env.DB_SYNCHRONIZE, true),
    dbLogging: parseBoolean(env.DB_LOGGING, false),
    // Postgres gestionado (Render, Cloud SQL por IP pública) exige TLS.
    dbSsl: parseBoolean(env.DB_SSL, false),
    jwtSecret,
    jwtTtlSeconds: parseNumber(env.JWT_TTL_SECONDS, 3600),
    enableDemoToken: parseBoolean(env.ENABLE_DEMO_TOKEN, true),
    corsOrigins: !cors || cors === '*' ? ['*'] : cors.split(',').map((origin) => origin.trim()),
  };
}
