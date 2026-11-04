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
