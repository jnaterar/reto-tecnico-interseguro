import type {
  CoreEndorsePayload,
  EndorseTranslateRequest,
} from '../src/entities/endorse.entity';
import type { EndorsementTemplate } from '../src/entities/template.entity';
import type { TemplateRepository } from '../src/repositories/template.repository';

export const exampleRequest: EndorseTranslateRequest = {
  policyNumber: '08200000049',
  idEnvio: 5984,
  frecuencia: 'Semestral',
  tipoEndoso: 'CambioFrecuencia',
  producto: 'Rumbo',
  plan: 'PlanRumbo',
  moneda: 'Nuevo Sol',
  usuario: 'interface.servicios',
  fechaSolicitud: '2025-08-27',
  fechaCliente: '2025-08-27',
  fechaEfectiva: '2025-09-01',
};

export const rumboTemplate: EndorsementTemplate = {
  templateId: 1,
  version: 1,
  productCode: 'RUMBO',
  productName: 'Rumbo',
  endorsementTypeCode: 'CAMBIO_FRECUENCIA',
  endorsementTypeName: 'CambioFrecuencia',
  fields: [
    { label: 'ProductosVida', order: 1, source: 'INPUT', sourceKey: 'producto', constantValue: null, defaultValue: null },
    { label: 'NombreUsuario', order: 2, source: 'INPUT', sourceKey: 'usuario', constantValue: null, defaultValue: null },
    { label: 'NumeroPolizaEndoso', order: 3, source: 'INPUT', sourceKey: 'policyNumber', constantValue: null, defaultValue: null },
    { label: 'TipoEndosoPol', order: 4, source: 'CONSTANT', sourceKey: null, constantValue: 'Endoso Simple', defaultValue: null },
    { label: 'ResponsableAtencion', order: 5, source: 'CONSTANT', sourceKey: null, constantValue: 'SAC', defaultValue: null },
    { label: 'EndosoModifPrima', order: 6, source: 'CONSTANT', sourceKey: null, constantValue: 'Si', defaultValue: null },
    { label: 'InicioVigenciaEndoso', order: 7, source: 'DEFAULT', sourceKey: null, constantValue: null, defaultValue: 'Default' },
    { label: 'TipoVigenciaEndoso', order: 8, source: 'DEFAULT', sourceKey: null, constantValue: null, defaultValue: '' },
    { label: 'EndososSimplesSACRumbo', order: 9, source: 'CONSTANT', sourceKey: null, constantValue: 'TES008', defaultValue: null },
    { label: 'FechaSolicitud', order: 10, source: 'INPUT', sourceKey: 'fechaSolicitud', constantValue: null, defaultValue: null },
    { label: 'FechaCliente', order: 11, source: 'INPUT', sourceKey: 'fechaCliente', constantValue: null, defaultValue: null },
    { label: 'FechaEfectiva', order: 12, source: 'INPUT', sourceKey: 'fechaEfectiva', constantValue: null, defaultValue: null },
  ],
  events: [
    { description: 'SolicitarEndoso', orderEvent: 1 },
    { description: 'AprobarEndoso', orderEvent: 2 },
  ],
};

/**
 * Espejo exacto de AUTO_CAMBIO_FRECUENCIA del seed: misma estructura, menos
 * campos. Sirve para probar que el catálogo y la traducción salen de la
 * plantilla y no de una lista escrita a mano.
 */
export const autoTemplate: EndorsementTemplate = {
  templateId: 2,
  version: 1,
  productCode: 'AUTO',
  productName: 'Auto',
  endorsementTypeCode: 'CAMBIO_FRECUENCIA',
  endorsementTypeName: 'CambioFrecuencia',
  fields: [
    { label: 'ProductosVida', order: 1, source: 'INPUT', sourceKey: 'producto', constantValue: null, defaultValue: null },
    { label: 'NombreUsuario', order: 2, source: 'INPUT', sourceKey: 'usuario', constantValue: null, defaultValue: null },
    { label: 'NumeroPolizaEndoso', order: 3, source: 'INPUT', sourceKey: 'policyNumber', constantValue: null, defaultValue: null },
    { label: 'TipoEndosoPol', order: 4, source: 'CONSTANT', sourceKey: null, constantValue: 'Endoso Simple', defaultValue: null },
    { label: 'ResponsableAtencion', order: 5, source: 'CONSTANT', sourceKey: null, constantValue: 'SAC', defaultValue: null },
    { label: 'InicioVigenciaEndoso', order: 6, source: 'DEFAULT', sourceKey: null, constantValue: null, defaultValue: 'Default' },
    { label: 'FechaSolicitud', order: 7, source: 'INPUT', sourceKey: 'fechaSolicitud', constantValue: null, defaultValue: null },
  ],
  events: [
    { description: 'SolicitarEndoso', orderEvent: 1 },
    { description: 'AprobarEndoso', orderEvent: 2 },
  ],
};

export const expectedPayload: CoreEndorsePayload = {
  policyNumber: '08200000049',
  idEnvio: 5984,
  financialPlansEntity: { description: 'Semestral' },
  currency: { description: 'Nuevo Sol' },
  productEntity: { description: 'Rumbo' },
  eventEntity: {
    description: 'SolicitarEndoso',
    dynamicData: [
      { etiqueta: 'ProductosVida', value: 'Rumbo' },
      { etiqueta: 'NombreUsuario', value: 'interface.servicios' },
      { etiqueta: 'NumeroPolizaEndoso', value: '08200000049' },
      { etiqueta: 'TipoEndosoPol', value: 'Endoso Simple' },
      { etiqueta: 'ResponsableAtencion', value: 'SAC' },
      { etiqueta: 'EndosoModifPrima', value: 'Si' },
      { etiqueta: 'InicioVigenciaEndoso', value: 'Default' },
      { etiqueta: 'TipoVigenciaEndoso', value: '' },
      { etiqueta: 'EndososSimplesSACRumbo', value: 'TES008' },
      { etiqueta: 'FechaSolicitud', value: '2025-08-27' },
      { etiqueta: 'FechaCliente', value: '2025-08-27' },
      { etiqueta: 'FechaEfectiva', value: '2025-09-01' },
    ],
  },
  eventAppliedEntities: [
    { description: 'SolicitarEndoso', orderEvent: 1 },
    { description: 'AprobarEndoso', orderEvent: 2 },
  ],
  riskUnitEntities: [
    {
      insuranceObjectEntities: [
        {
          insuranceObjectNumber: '1',
          coverageEntities: [],
          participationEntities: [],
        },
      ],
      plansEntity: { description: 'PlanRumbo' },
      riskUnitNumber: '1',
    },
  ],
  participationEntities: [],
};

const normalize = (value: string): string => value.trim().toLowerCase();

/**
 * Repositorio en memoria: demuestra que el servicio depende de un puerto y
 * puede probarse sin PostgreSQL.
 */
export class InMemoryTemplateRepository implements TemplateRepository {
  constructor(private readonly templates: EndorsementTemplate[]) {}

  async findTemplate(product: string, endorsementType: string): Promise<EndorsementTemplate | null> {
    const found = this.templates.find((template) => {
      const productMatches =
        normalize(template.productName) === normalize(product) ||
        normalize(template.productCode) === normalize(product);
      const typeMatches =
        normalize(template.endorsementTypeName) === normalize(endorsementType) ||
        normalize(template.endorsementTypeCode) === normalize(endorsementType);
      return productMatches && typeMatches;
    });
    return found ?? null;
  }

  async listTemplates(): Promise<EndorsementTemplate[]> {
    return [...this.templates];
  }
}
