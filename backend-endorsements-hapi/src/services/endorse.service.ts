import type { CoreEndorsePayload, EndorseTranslateRequest } from '../entities/endorse.entity';
import { templateNotFound } from '../errors/app-error';
import { mapToCorePayload } from '../mappers/endorse.mapper';
import type { TemplateRepository } from '../repositories/template.repository';

/**
 * Servicio de traducción de endosos.
 *
 * Caso de uso: obtener la plantilla (Repository) y delegar la transformación
 * al Mapper. El servicio no conoce etiquetas ni códigos: los lee de BD.
 */
export class EndorseService {
  constructor(private readonly templateRepository: TemplateRepository) {}

  async translate(request: EndorseTranslateRequest): Promise<CoreEndorsePayload> {
    const template = await this.templateRepository.findTemplate(
      request.producto,
      request.tipoEndoso,
    );

    if (!template) {
      throw templateNotFound(request.producto, request.tipoEndoso);
    }

    return mapToCorePayload(request, template);
  }
}
