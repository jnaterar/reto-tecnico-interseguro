import * as Boom from '@hapi/boom';
import { server as createHapiServer, type Server } from '@hapi/hapi';
import { AuthController } from './controllers/auth.controller';
import { EndorseController } from './controllers/endorse.controller';
import { AppError } from './errors/app-error';
import { authPlugin } from './plugins/auth.plugin';
import { buildRoutes } from './routes';
import { EndorseService } from './services/endorse.service';
import type { TemplateRepository } from './repositories/template.repository';

export interface ServerDependencies {
  templateRepository: TemplateRepository;
  jwtSecret: string;
  jwtTtlSeconds: number;
  enableDemoToken: boolean;
  corsOrigins: string[];
  /** Se usa solo para rechazar `CORS_ORIGINS='*'` en producción. */
  nodeEnv?: string;
  host?: string;
  port?: number;
}

/**
 * Composition root: construye el servidor Hapi inyectando el repositorio.
 * Al recibir las dependencias por parámetro, los tests pueden usar un
 * repositorio en memoria sin levantar PostgreSQL.
 */
export async function buildServer(deps: ServerDependencies): Promise<Server> {
  const nodeEnv = deps.nodeEnv ?? 'development';
  if (nodeEnv === 'production' && deps.corsOrigins.includes('*')) {
    throw new Error(
      'CORS_ORIGINS no puede ser "*" en producción: define la URL exacta del frontend ' +
        '(./deploy-gcp.sh update-cors la fija después de desplegar el frontend).',
    );
  }

  const server = createHapiServer({
    host: deps.host ?? '0.0.0.0',
    port: deps.port ?? 8082,
    routes: {
      cors: {
        // Lista explícita de orígenes; `'ignore'` (lista vacía) = sin CORS.
        // Hapi refleja el Origin recibido solo si está en la lista, por lo que
        // un origen hostil no recibe Access-Control-Allow-Origin.
        origin: deps.corsOrigins.length > 0 ? deps.corsOrigins : 'ignore',
        additionalHeaders: ['authorization', 'content-type', 'x-api-version'],
        additionalExposedHeaders: ['x-api-version'],
        maxAge: 600,
        preflightStatusCode: 204,
        credentials: false,
      },
    },
  });

  await server.register({
    plugin: authPlugin,
    options: { secret: deps.jwtSecret },
  });

  const endorseService = new EndorseService(deps.templateRepository);
  const endorseController = new EndorseController(endorseService);
  const authController = new AuthController(
    deps.jwtSecret,
    deps.jwtTtlSeconds,
    deps.enableDemoToken,
  );

  server.route(buildRoutes({ endorseController, authController }));

  // Códigos de dominio por status HTTP: el cliente no debe depender de los
  // nombres internos de Boom ("Bad Request", "Unauthorized").
  const boomErrorCodes: Record<number, string> = {
    400: 'VALIDATION_ERROR',
    401: 'UNAUTHORIZED',
    403: 'FORBIDDEN',
    404: 'NOT_FOUND',
    405: 'METHOD_NOT_ALLOWED',
    415: 'UNSUPPORTED_MEDIA_TYPE',
    429: 'TOO_MANY_REQUESTS',
  };

  // Normaliza cualquier error (tipado, Boom o inesperado) a un envelope JSON
  // estable. Nunca se filtran stack traces ni mensajes internos al cliente.
  server.ext('onPreResponse', (request, h) => {
    const response = request.response;

    if (response instanceof AppError) {
      return h
        .response({
          error: {
            code: response.code,
            message: response.message,
            details: response.details,
          },
        })
        .code(response.statusCode);
    }

    if (Boom.isBoom(response)) {
      const status = response.output.statusCode;
      const isServerError = status >= 500;
      // Boom envuelve el segundo argumento en `data`: se desanida para que el
      // cliente reciba siempre `details` con la misma forma.
      const data = response.data as { details?: unknown } | undefined;
      // Hapi emite el 403 de scope con el texto en inglés; el envelope del
      // proyecto responde en español con el mismo código y la misma forma.
      const message = isServerError
        ? 'Error interno del servidor'
        : status === 403 && response.message === 'Insufficient scope'
          ? 'El token no tiene un scope autorizado para este endpoint'
          : response.message;

      return h
        .response({
          error: {
            code: boomErrorCodes[status] ?? (isServerError ? 'INTERNAL_ERROR' : 'HTTP_ERROR'),
            message,
            details: isServerError ? null : (data?.details ?? data ?? null),
          },
        })
        .code(status);
    }

    return h.continue;
  });

  return server;
}
