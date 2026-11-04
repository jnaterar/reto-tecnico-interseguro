import * as Boom from '@hapi/boom';
import type { Request, ResponseToolkit } from '@hapi/hapi';
import { issueToken } from '../security/jwt';

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
    const scope = payload.scope?.trim() || 'endorse:translate';

    const { token, expiresAt } = issueToken(subject, scope, this.secret, this.ttlSeconds);
    const expiresIn = Math.max(0, expiresAt - Math.floor(Date.now() / 1000));

    return h
      .response({ token, tokenType: 'Bearer', expiresIn })
      .code(200)
      .header('x-api-version', 'v1');
  };
}
