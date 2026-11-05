import * as Boom from '@hapi/boom';
import type { Request, ResponseToolkit } from '@hapi/hapi';
import { issueToken } from '../security/jwt';

// El token de demo solo puede pedir los scopes del reto. Aceptar un scope
// arbitrario del cliente permitiría ampliar privilegios si en el futuro se
// añadieran endpoints administrativos.
const DEMO_SCOPES = ['endorse:translate'] as const;
const DEFAULT_DEMO_SCOPE = 'endorse:translate';

/**
 * Emisor de tokens de DEMO para que el frontend pueda consumir el API.
 * En producción el token lo emite el IdP / API Gateway y este endpoint se
 * apaga con ENABLE_DEMO_TOKEN=false.
 */
export class AuthController {
  constructor(
    private readonly secret: string,
    private readonly ttlSeconds: number,
    private readonly enabled: boolean,
  ) {}

  issueToken = async (request: Request, h: ResponseToolkit) => {
    if (!this.enabled) {
      throw Boom.forbidden('La emisión de tokens de demo está deshabilitada');
    }

    const payload = (request.payload ?? {}) as { subject?: string; scope?: string };
    const subject = payload.subject?.trim() || 'demo-client';
    const scope = payload.scope?.trim() || DEFAULT_DEMO_SCOPE;

    if (!(DEMO_SCOPES as readonly string[]).includes(scope)) {
      throw Boom.badRequest(
        `El scope solicitado no está permitido para el token de demo (válidos: ${DEMO_SCOPES.join(', ')})`,
      );
    }

    const { token, expiresAt } = issueToken(subject, scope, this.secret, this.ttlSeconds);
    const expiresIn = Math.max(0, expiresAt - Math.floor(Date.now() / 1000));

    return h
      .response({ token, tokenType: 'Bearer', expiresIn })
      .code(200)
      .header('x-api-version', 'v1');
  };
}
