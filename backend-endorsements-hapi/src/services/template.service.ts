import type { EndorsementTemplate, TemplateCatalogItem } from '../entities/template.entity';
import { templateNotFound } from '../errors/app-error';
import type { TemplateRepository } from '../repositories/template.repository';

/**
 * Servicio de consulta de plantillas (solo lectura).
 *
 * Existe para que la interfaz pueda mostrar de dónde sale la traducción: la
 * plantilla aplicada y el catálogo real de productos. No transforma nada ni
 * duplica la lógica del EndorseService: únicamente expone lo que hay en BD.
 */
export class TemplateService {
  constructor(private readonly templateRepository: TemplateRepository) {}

  /** Devuelve la plantilla activa de producto + tipo de endoso o lanza 404. */
  async getTemplate(producto: string, tipoEndoso: string): Promise<EndorsementTemplate> {
    const template = await this.templateRepository.findTemplate(producto, tipoEndoso);

    if (!template) {
      throw templateNotFound(producto, tipoEndoso);
    }

    return template;
  }

  /** Catálogo de plantillas activas, listo para poblar el selector. */
  async listCatalog(): Promise<TemplateCatalogItem[]> {
    const templates = await this.templateRepository.listTemplates();

    return templates.map((template) => ({
      productCode: template.productCode,
      productName: template.productName,
      endorsementTypeCode: template.endorsementTypeCode,
      endorsementTypeName: template.endorsementTypeName,
      fieldCount: template.fields.length,
    }));
  }
}
