import type { Server } from '@hapi/hapi';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildServer } from '../src/app';
import {
  exampleRequest,
  expectedPayload,
  InMemoryTemplateRepository,
  rumboTemplate,
} from './fixtures';

const JWT_SECRET = 'test-secret-key-123456';

let server: Server;

beforeAll(async () => {
  server = await buildServer({
    templateRepository: new InMemoryTemplateRepository([rumboTemplate]),
    jwtSecret: JWT_SECRET,
    jwtTtlSeconds: 3600,
    enableDemoToken: true,
    corsOrigins: ['*'],
    host: '127.0.0.1',
    port: 0,
  });
  await server.initialize();
});

afterAll(async () => {
  await server.stop();
});

async function getToken(): Promise<string> {
  const response = await server.inject({ method: 'POST', url: '/v1/auth/token', payload: {} });
  return (response.result as { token: string }).token;
}

describe('HTTP /v1/endorse/translate', () => {
  it('GET /health responde ok', async () => {
    const response = await server.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
    expect((response.result as { status: string }).status).toBe('ok');
  });

  it('rechaza la petición sin JWT (401)', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/v1/endorse/translate',
      payload: exampleRequest,
    });

    expect(response.statusCode).toBe(401);
    expect((response.result as { error: { code: string } }).error.code).toBe('UNAUTHORIZED');
  });

  it('traduce con JWT válido y devuelve el JSON del core', async () => {
    const token = await getToken();

    const response = await server.inject({
      method: 'POST',
      url: '/v1/endorse/translate',
      headers: { authorization: `Bearer ${token}` },
      payload: exampleRequest,
    });

    expect(response.statusCode).toBe(200);
    expect(response.result).toEqual(expectedPayload);
  });

  it('valida el contrato de entrada (400)', async () => {
    const token = await getToken();

    const response = await server.inject({
      method: 'POST',
      url: '/v1/endorse/translate',
      headers: { authorization: `Bearer ${token}` },
      payload: { ...exampleRequest, policyNumber: '' },
    });

    expect(response.statusCode).toBe(400);
    const body = response.result as {
      error: { code: string; details: Array<{ path: string }> };
    };
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.details.some((issue) => issue.path === 'policyNumber')).toBe(true);
  });

  it('rechaza fechas imposibles como 2025-02-31 (400)', async () => {
    const token = await getToken();

    const response = await server.inject({
      method: 'POST',
      url: '/v1/endorse/translate',
      headers: { authorization: `Bearer ${token}` },
      payload: { ...exampleRequest, fechaSolicitud: '2025-02-31' },
    });

    expect(response.statusCode).toBe(400);
    const body = response.result as {
      error: { code: string; details: Array<{ path: string }> };
    };
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.details.some((issue) => issue.path === 'fechaSolicitud')).toBe(true);
  });

  it('rechaza fechas con formato distinto de YYYY-MM-DD (400)', async () => {
    const token = await getToken();

    const response = await server.inject({
      method: 'POST',
      url: '/v1/endorse/translate',
      headers: { authorization: `Bearer ${token}` },
      payload: { ...exampleRequest, fechaEfectiva: '01-09-2025' },
    });

    expect(response.statusCode).toBe(400);
  });

  it('devuelve TEMPLATE_NOT_FOUND (404) si no hay plantilla', async () => {
    const token = await getToken();

    const response = await server.inject({
      method: 'POST',
      url: '/v1/endorse/translate',
      headers: { authorization: `Bearer ${token}` },
      payload: { ...exampleRequest, producto: 'Inexistente' },
    });

    expect(response.statusCode).toBe(404);
    expect((response.result as { error: { code: string } }).error.code).toBe('TEMPLATE_NOT_FOUND');
  });

  it('rechaza un JWT manipulado (401)', async () => {
    const token = await getToken();
    const tampered = `${token}tampered`;

    const response = await server.inject({
      method: 'POST',
      url: '/v1/endorse/translate',
      headers: { authorization: `Bearer ${tampered}` },
      payload: exampleRequest,
    });

    expect(response.statusCode).toBe(401);
  });
});
