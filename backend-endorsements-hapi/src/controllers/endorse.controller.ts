import type { Request, ResponseToolkit } from '@hapi/hapi';
import type { EndorseTranslateRequest } from '../entities/endorse.entity';
import type { EndorseService } from '../services/endorse.service';

/**
 * Capa Controller: recibe la request, delega en el servicio y devuelve el
 * JSON del core. No contiene lógica de negocio ni acceso a datos.
 */
export class EndorseController {
  constructor(private readonly endorseService: EndorseService) {}

  translate = async (request: Request, h: ResponseToolkit) => {
    const payload = request.payload as EndorseTranslateRequest;
    const result = await this.endorseService.translate(payload);
    return h.response(result).code(200).header('x-api-version', 'v1');
  };
}
