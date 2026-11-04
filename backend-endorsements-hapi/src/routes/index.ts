import * as Boom from '@hapi/boom';
import Joi from 'joi';
import type { Lifecycle, ServerRoute } from '@hapi/hapi';
import type { AuthController } from '../controllers/auth.controller';
import type { EndorseController } from '../controllers/endorse.controller';

export interface RoutesDependencies {
  endorseController: EndorseController;
  authController: AuthController;
}

const toIssues = (
  details: Joi.ValidationErrorItem[] | undefined,
): Array<{ path: string; type: string; message: string }> =>
  (details ?? []).map((detail) => ({
    path: detail.path.join('.'),
    type: detail.type,
    message: detail.message,
  }));

/**
 * Hapi convierte el error de Joi en un Boom genérico ("Invalid request payload
 * input") antes de invocar al `failAction`, perdiendo los detalles. Por eso se
 * revalida el payload contra el mismo esquema: así el cliente recibe qué campo
 * falló y el mensaje en español definido en el esquema.
 */
const failActionFor =
  (schema: Joi.ObjectSchema): Lifecycle.FailAction =>
  (request, _h) => {
    const { error } = schema.validate(request.payload, { abortEarly: false });

    throw Boom.badRequest('El payload no cumple el contrato', {
      details: toIssues(error?.details),
    });
  };

// Joi.string().isoDate() con convierte el valor a ISO completo
// ("2025-08-27" -> "2025-08-27T00:00:00.000Z") y además tolera fechas
// imposibles como "2025-02-31". Como el core espera el literal del contrato,
// validamos con ida y vuelta (round-trip) sin mutar el valor recibido.
const isoDateString = Joi.string()
  .trim()
  .custom((value: string, helpers: Joi.CustomHelpers) => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    const isRealDate =
      /^\d{4}-\d{2}-\d{2}$/.test(value) &&
      !Number.isNaN(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === value;

    return isRealDate ? value : helpers.error('date.invalid');
  }, 'validación ISO date (YYYY-MM-DD)')
  .messages({
    'date.invalid': '{{#label}} debe ser una fecha ISO válida con formato YYYY-MM-DD',
  });

// Contrato de entrada validado en el borde. Los valores fijos del negocio
// (códigos, responsables, textos) NO se piden aquí: se resuelven desde la
// plantilla en BD, por lo que agregar un producto no toca este esquema.
const endorseTranslatePayload = Joi.object({
  policyNumber: Joi.string().trim().min(1).required(),
  idEnvio: Joi.number().integer().positive().required(),
  frecuencia: Joi.string().trim().min(1).required(),
  tipoEndoso: Joi.string().trim().min(1).required(),
  producto: Joi.string().trim().min(1).required(),
  plan: Joi.string().trim().min(1).required(),
  moneda: Joi.string().trim().min(1).required(),
  usuario: Joi.string().trim().min(1).required(),
  fechaSolicitud: isoDateString.required(),
  fechaCliente: isoDateString.required(),
  fechaEfectiva: isoDateString.required(),
}).label('EndorseTranslateRequest');

const tokenPayload = Joi.object({
  subject: Joi.string().trim().optional(),
  scope: Joi.string().trim().optional(),
})
  .optional()
  .allow(null);

export function buildRoutes(deps: RoutesDependencies): ServerRoute[] {
  return [
    {
      method: 'GET',
      path: '/health',
      options: { auth: false, tags: ['health'] },
      handler: () => ({
        status: 'ok',
        service: 'endorsements-translator',
        version: 'v1',
      }),
    },
    {
      method: 'POST',
      path: '/v1/auth/token',
      options: {
        auth: false,
        tags: ['auth'],
        validate: { payload: tokenPayload, failAction: failActionFor(tokenPayload) },
      },
      handler: deps.authController.issueToken,
    },
    {
      method: 'POST',
      path: '/v1/endorse/translate',
      options: {
        auth: 'jwt',
        tags: ['api', 'endorse'],
        validate: {
          payload: endorseTranslatePayload,
          failAction: failActionFor(endorseTranslatePayload),
        },
      },
      handler: deps.endorseController.translate,
    },
  ];
}
