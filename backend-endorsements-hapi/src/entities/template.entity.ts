// Entidad de dominio de la plantilla. Es independiente de TypeORM: el mapper
// y el servicio trabajan con estos tipos, no con los modelos de persistencia
// (Dependency Inversion / testabilidad sin infraestructura).

export type TemplateFieldSource = 'INPUT' | 'CONSTANT' | 'DEFAULT';

export interface TemplateFieldDefinition {
  label: string;
  order: number;
  source: TemplateFieldSource;
  /** Campo del JSON plano del que se toma el valor cuando source = INPUT. */
  sourceKey: string | null;
  /** Valor fijo cuando source = CONSTANT (código de negocio o texto literal). */
  constantValue: string | null;
  /**
   * Valor por defecto cuando source = INPUT y el input no trae el campo, o
   * valor literal cuando source = DEFAULT.
   *
   * Distinguir null de "" es clave:
   *   null -> no hay default configurado (campo obligatorio)
   *   ""   -> default vacío intencional (ej. TipoVigenciaEndoso)
   */
  defaultValue: string | null;
}

export interface TemplateEventDefinition {
  description: string;
  orderEvent: number;
}

export interface EndorsementTemplate {
  templateId: number;
  version: number;
  productCode: string;
  productName: string;
  endorsementTypeCode: string;
  endorsementTypeName: string;
  fields: TemplateFieldDefinition[];
  events: TemplateEventDefinition[];
}
