import { describe, expect, it } from 'vitest';
import type { EndorsementTemplate } from '../src/entities/template.entity';
import { AppError } from '../src/errors/app-error';
import { EndorseService } from '../src/services/endorse.service';
import {
  exampleRequest,
  expectedPayload,
  InMemoryTemplateRepository,
  rumboTemplate,
} from './fixtures';

describe('EndorseService', () => {
  it('traduce cuando existe la plantilla', async () => {
    const service = new EndorseService(new InMemoryTemplateRepository([rumboTemplate]));

    const result = await service.translate(exampleRequest);

    expect(result).toEqual(expectedPayload);
  });

  it('devuelve TEMPLATE_NOT_FOUND si no hay plantilla para el producto/tipo', async () => {
    const service = new EndorseService(new InMemoryTemplateRepository([rumboTemplate]));

    try {
      await service.translate({ ...exampleRequest, producto: 'NoExiste' });
      throw new Error('se esperaba un AppError');
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).code).toBe('TEMPLATE_NOT_FOUND');
      expect((error as AppError).statusCode).toBe(404);
    }
  });

  it('es extensible por datos: un producto nuevo funciona sin tocar código', async () => {
    // Simula el INSERT de una plantilla nueva (producto "Vehicular") y verifica
    // que el servicio la traduce igual, sin cambios en el mapper ni el servicio.
    const nuevaPlantilla: EndorsementTemplate = {
      templateId: 99,
      version: 3,
      productCode: 'VEHICULAR',
      productName: 'Vehicular',
      endorsementTypeCode: 'CAMBIO_PLAN',
      endorsementTypeName: 'CambioPlan',
      fields: [
        { label: 'Producto', order: 1, source: 'INPUT', sourceKey: 'producto', constantValue: null, defaultValue: null },
        { label: 'PlanNuevo', order: 2, source: 'INPUT', sourceKey: 'plan', constantValue: null, defaultValue: null },
        { label: 'Canal', order: 3, source: 'CONSTANT', sourceKey: null, constantValue: 'WEB', defaultValue: null },
      ],
      events: [{ description: 'SolicitarEndoso', orderEvent: 1 }],
    };

    const service = new EndorseService(
      new InMemoryTemplateRepository([rumboTemplate, nuevaPlantilla]),
    );

    const result = await service.translate({
      ...exampleRequest,
      producto: 'Vehicular',
      tipoEndoso: 'CambioPlan',
      plan: 'PlanFull',
    });

    expect(result.eventEntity.dynamicData).toEqual([
      { etiqueta: 'Producto', value: 'Vehicular' },
      { etiqueta: 'PlanNuevo', value: 'PlanFull' },
      { etiqueta: 'Canal', value: 'WEB' },
    ]);
    expect(result.eventAppliedEntities).toEqual([
      { description: 'SolicitarEndoso', orderEvent: 1 },
    ]);
  });
});
