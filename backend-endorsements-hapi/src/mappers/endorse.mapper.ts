import type { CoreEndorsePayload, EndorseTranslateRequest } from '../entities/endorse.entity';
import type {
  EndorsementTemplate,
  TemplateFieldDefinition,
} from '../entities/template.entity';
import { missingFieldValue, templateConfigInvalid } from '../errors/app-error';

/**
 * Mapper puro: transforma el JSON plano + plantilla de BD en el JSON del core.
 *
 * No tiene efectos secundarios ni dependencias de infraestructura, por lo que
 * es trivialmente testeable. Es el corazón del Reto 1 y la razón por la que
 * agregar un producto nuevo no requiere compilar: la plantilla es dato.
 */
export function mapToCorePayload(
  request: EndorseTranslateRequest,
  template: EndorsementTemplate,
): CoreEndorsePayload {
  assertValidTemplate(template);

  // El orden del array es el orden de la plantilla. Nunca se depende del orden
  // de las claves de un objeto JS (que el core no debe interpretar).
  const orderedFields = [...template.fields].sort((a, b) => a.order - b.order);
  const orderedEvents = [...template.events].sort((a, b) => a.orderEvent - b.orderEvent);

  const primaryEvent = orderedEvents[0];
  if (!primaryEvent) {
    throw templateConfigInvalid('La plantilla no define el evento principal');
  }

  const dynamicData = orderedFields.map((field) => ({
    etiqueta: field.label,
    value: resolveFieldValue(field, request),
  }));

  return {
    policyNumber: request.policyNumber,
    idEnvio: request.idEnvio,
    financialPlansEntity: { description: request.frecuencia },
    currency: { description: request.moneda },
    // El nombre canónico del producto lo dicta la plantilla en BD, no el texto
    // que mandó el cliente: así "AUTO" y "Auto" se resuelven a un único valor.
    productEntity: { description: template.productName },
    eventEntity: {
      description: primaryEvent.description,
      dynamicData,
    },
    eventAppliedEntities: orderedEvents.map((event) => ({
      description: event.description,
      orderEvent: event.orderEvent,
    })),
    riskUnitEntities: [
      {
        insuranceObjectEntities: [
          {
            insuranceObjectNumber: '1',
            coverageEntities: [],
            participationEntities: [],
          },
        ],
        plansEntity: { description: request.plan },
        riskUnitNumber: '1',
      },
    ],
    participationEntities: [],
  };
}

/**
 * Resuelve el valor de un campo según su origen configurado en BD.
 * - CONSTANT: valor fijo definido en la plantilla (nunca en el código).
 * - DEFAULT: valor literal (ej. "Default" o "").
 * - INPUT: campo del request; si falta usa default_value si existe.
 */
function resolveFieldValue(
  field: TemplateFieldDefinition,
  request: EndorseTranslateRequest,
): string {
  switch (field.source) {
    case 'CONSTANT': {
      if (field.constantValue === null) {
        throw templateConfigInvalid(
          `El campo "${field.label}" es CONSTANT pero la plantilla no define constant_value`,
          { label: field.label },
        );
      }
      return field.constantValue;
    }
    case 'DEFAULT': {
      if (field.defaultValue === null) {
        throw templateConfigInvalid(
          `El campo "${field.label}" es DEFAULT pero la plantilla no define default_value`,
          { label: field.label },
        );
      }
      return field.defaultValue;
    }
    case 'INPUT': {
      if (field.sourceKey === null) {
        throw templateConfigInvalid(
          `El campo "${field.label}" es INPUT pero la plantilla no define source_key`,
          { label: field.label },
        );
      }

      const rawValue = (request as unknown as Record<string, unknown>)[field.sourceKey];
      if (rawValue !== undefined && rawValue !== null && String(rawValue).trim() !== '') {
        return String(rawValue);
      }

      // Se distingue "sin default" (null -> error) de "default vacío" ("" -> válido).
      if (field.defaultValue !== null) {
        return field.defaultValue;
      }

      throw missingFieldValue(field.label, field.sourceKey);
    }
    default: {
      throw templateConfigInvalid(`Origen de campo no soportado: ${String(field.source)}`, {
        label: field.label,
      });
    }
  }
}

/**
 * Valida la coherencia de la plantilla configurada en BD. Un error de
 * configuración debe ser explícito (500 con código propio), no un resultado
 * silenciosamente incorrecto.
 */
function assertValidTemplate(template: EndorsementTemplate): void {
  if (template.fields.length === 0) {
    throw templateConfigInvalid('La plantilla no define campos para dynamicData', {
      templateId: template.templateId,
    });
  }
  if (template.events.length === 0) {
    throw templateConfigInvalid('La plantilla no define eventAppliedEntities', {
      templateId: template.templateId,
    });
  }

  const fieldOrders = new Set<number>();
  for (const field of template.fields) {
    if (fieldOrders.has(field.order)) {
      throw templateConfigInvalid(`Orden de campo duplicado: ${field.order}`, {
        templateId: template.templateId,
        label: field.label,
      });
    }
    fieldOrders.add(field.order);
  }

  const eventOrders = new Set<number>();
  for (const event of template.events) {
    if (eventOrders.has(event.orderEvent)) {
      throw templateConfigInvalid(`Orden de evento duplicado: ${event.orderEvent}`, {
        templateId: template.templateId,
        description: event.description,
      });
    }
    eventOrders.add(event.orderEvent);
  }
}
