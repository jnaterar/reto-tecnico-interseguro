import type { Request, ResponseToolkit } from '@hapi/hapi';
import type { TemplateService } from '../services/template.service';

/**
 * Capa Controller de consulta de plantillas: recibe la request, delega en el
 * servicio y devuelve el JSON. Sin lógica de negocio ni acceso a datos.
 */
export class TemplateController {
  constructor(private readonly templateService: TemplateService) {}

  getTemplate = async (request: Request, h: ResponseToolkit) => {
    // Hapi decodifica los segmentos de la URL (%20 -> espacio) y los entrega
    // como texto; las dos partes de la ruta son obligatorias por definición.
    const producto = String(request.params.producto);
    const tipoEndoso = String(request.params.tipoEndoso);
    const template = await this.templateService.getTemplate(producto, tipoEndoso);
    return h.response(template).code(200).header('x-api-version', 'v1');
  };

  listCatalog = async (_request: Request, h: ResponseToolkit) => {
    const catalog = await this.templateService.listCatalog();
    return h.response(catalog).code(200).header('x-api-version', 'v1');
  };
}
