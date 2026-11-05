// Entidades (DTO) del contrato HTTP. Se usan hasta la capa de servicios.
// El JSON plano de entrada no conoce la plantilla; la plantilla vive en BD.

export interface EndorseTranslateRequest {
  policyNumber: string;
  idEnvio: number;
  frecuencia: string;
  tipoEndoso: string;
  producto: string;
  plan: string;
  moneda: string;
  usuario: string;
  fechaSolicitud: string;
  fechaCliente: string;
  fechaEfectiva: string;
}

/**
 * Registro de claves del contrato de entrada: ÚNICA fuente de verdad para
 * validar que un `source_key` de la plantilla (que es dato, vive en BD) apunta
 * a un campo que realmente existe en el request.
 *
 * Tiparlo como `Record<keyof EndorseTranslateRequest, true>` obliga a que
 * agregar o renombrar un campo del contrato rompa la compilación AQUÍ, en lugar
 * de degradarse en un error silencioso en runtime.
 */
const ENDORSE_REQUEST_KEY_REGISTRY: Record<keyof EndorseTranslateRequest, true> = {
  policyNumber: true,
  idEnvio: true,
  frecuencia: true,
  tipoEndoso: true,
  producto: true,
  plan: true,
  moneda: true,
  usuario: true,
  fechaSolicitud: true,
  fechaCliente: true,
  fechaEfectiva: true,
};

/** ¿La clave pertenece al contrato de entrada? (type guard, sin strings sueltos). */
export function isEndorseRequestKey(key: string): key is keyof EndorseTranslateRequest {
  return Object.prototype.hasOwnProperty.call(ENDORSE_REQUEST_KEY_REGISTRY, key);
}

export interface DynamicDataEntry {
  etiqueta: string;
  value: string;
}

export interface EventAppliedEntity {
  description: string;
  orderEvent: number;
}

export interface InsuranceObjectEntity {
  insuranceObjectNumber: string;
  coverageEntities: unknown[];
  participationEntities: unknown[];
}

export interface RiskUnitEntity {
  insuranceObjectEntities: InsuranceObjectEntity[];
  plansEntity: { description: string };
  riskUnitNumber: string;
}

// Contrato de salida hacia el core. El orden de las propiedades importa:
// el core espera el JSON "estructurado y ordenado".
export interface CoreEndorsePayload {
  policyNumber: string;
  idEnvio: number;
  financialPlansEntity: { description: string };
  currency: { description: string };
  productEntity: { description: string };
  eventEntity: { description: string; dynamicData: DynamicDataEntry[] };
  eventAppliedEntities: EventAppliedEntity[];
  riskUnitEntities: RiskUnitEntity[];
  participationEntities: unknown[];
}
