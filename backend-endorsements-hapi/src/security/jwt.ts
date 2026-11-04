import { createHmac, timingSafeEqual } from 'node:crypto';

// JWT HS256 mínimo con la librería estándar. Se evita una dependencia externa
// para que la superficie de seguridad sea auditable y el contenedor pequeño.
// En producción se preferiría un IdP / API Gateway que valide los tokens.

export interface JwtClaims {
  sub: string;
  scope: string;
  iat: number;
  exp: number;
}

export class JwtError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'JwtError';
  }
}

const encodeSegment = (value: unknown): string =>
  Buffer.from(JSON.stringify(value)).toString('base64url');

const signSegment = (data: string, secret: string): string =>
  createHmac('sha256', secret).update(data).digest('base64url');

export function issueToken(
  subject: string,
  scope: string,
  secret: string,
  ttlSeconds: number,
): { token: string; expiresAt: number } {
  const issuedAt = Math.floor(Date.now() / 1000);
  const expiresAt = issuedAt + ttlSeconds;

  const header = encodeSegment({ alg: 'HS256', typ: 'JWT' });
  const payload = encodeSegment({ sub: subject, scope, iat: issuedAt, exp: expiresAt });
  const signature = signSegment(`${header}.${payload}`, secret);

  return { token: `${header}.${payload}.${signature}`, expiresAt };
}

export function verifyToken(token: string, secret: string): JwtClaims {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new JwtError('formato de token inválido');
  }

  const [header, payload, signature] = parts as [string, string, string];
  const expected = signSegment(`${header}.${payload}`, secret);
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(signature);

  if (
    expectedBuffer.length !== actualBuffer.length ||
    !timingSafeEqual(expectedBuffer, actualBuffer)
  ) {
    throw new JwtError('firma inválida');
  }

  let claims: JwtClaims;
  try {
    claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as JwtClaims;
  } catch {
    throw new JwtError('payload inválido');
  }

  if (!claims.exp || claims.exp <= Math.floor(Date.now() / 1000)) {
    throw new JwtError('token expirado');
  }

  return claims;
}
