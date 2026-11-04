// Contratos compartidos con los backends. Se mantienen explícitos para que el
// compilador detecte cualquier desalineación con la API.

export interface TokenResponse {
  token: string;
  tokenType: string;
  expiresIn: number;
}

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

export interface CoreEndorsePayload {
  policyNumber: string;
  idEnvio: number;
  financialPlansEntity: { description: string };
  currency: { description: string };
  productEntity: { description: string };
  eventEntity: { description: string; dynamicData: DynamicDataEntry[] };
  eventAppliedEntities: EventAppliedEntity[];
  riskUnitEntities: Array<{
    insuranceObjectEntities: Array<{
      insuranceObjectNumber: string;
      coverageEntities: unknown[];
      participationEntities: unknown[];
    }>;
    plansEntity: { description: string };
    riskUnitNumber: string;
  }>;
  participationEntities: unknown[];
}

export type Graph = Record<string, Record<string, number>>;

export interface OptimalRouteRequest {
  accidentLocation: string;
  depots: string[];
  graph: Graph;
}

export interface OptimalRouteResponse {
  fromDepot: string;
  to: string;
  path: string[];
  distance: number;
}
