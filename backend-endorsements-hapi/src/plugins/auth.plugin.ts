import * as Boom from '@hapi/boom';
import type { Plugin, Request, ResponseToolkit, Server } from '@hapi/hapi';
import { verifyToken, type JwtClaims } from '../security/jwt';

export interface AuthPluginOptions {
  secret: string;
}

/**
 * Esquema de autenticación JWT propio sobre Hapi.
 *
 * Se implementa como scheme/strategy para que el resto del código no sepa cómo
 * se valida el token: basta con `auth: 'jwt'` en la ruta.
 */
export const authPlugin: Plugin<AuthPluginOptions> = {
  name: 'auth-jwt',
  version: '1.0.0',
  register: async (server: Server, options: AuthPluginOptions) => {
    server.auth.scheme('hmac-jwt', () => ({
      authenticate: (request: Request, h: ResponseToolkit) => {
        const header = String(request.headers.authorization ?? '');
        if (!header.startsWith('Bearer ')) {
          throw Boom.unauthorized('Se requiere el header Authorization: Bearer <token>');
        }

        try {
          const claims: JwtClaims = verifyToken(header.slice('Bearer '.length).trim(), options.secret);
          // Hapi tipa credentials.scope como string[]; el JWT lo transporta
          // como string. Se adapta en el borde para no filtrar esa diferencia.
          return h.authenticated({ credentials: { ...claims, scope: [claims.scope] } });
        } catch {
          throw Boom.unauthorized('Token inválido o expirado');
        }
      },
    }));

    server.auth.strategy('jwt', 'hmac-jwt');
  },
};
