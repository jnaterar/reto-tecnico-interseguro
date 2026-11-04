import type { EndorsementTemplate } from '../entities/template.entity';

/**
 * Puerto del repositorio de plantillas.
 *
 * El servicio depende de esta interfaz (Dependency Inversion), no de TypeORM.
 * Permite probar la traducción sin base de datos y cambiar el motor de
 * persistencia sin tocar la lógica de negocio.
 */
export interface TemplateRepository {
  /**
   * Busca la plantilla activa de mayor versión para producto + tipo de endoso.
   * Acepta tanto nombre visible ("Rumbo") como código ("RUMBO").
   */
  findTemplate(product: string, endorsementType: string): Promise<EndorsementTemplate | null>;
}
