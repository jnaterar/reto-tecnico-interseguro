import { describe, expect, it } from 'vitest';
import { AppError } from '../src/errors/app-error';
import { mapToCorePayload } from '../src/mappers/endorse.mapper';
import type { TemplateFieldSource } from '../src/entities/template.entity';
import {
  exampleRequest,
  expectedPayload,
  rumboTemplate,
} from './fixtures';

/**
 * Afirma que el mapper lanza un AppError con el CÓDIGO exacto esperado.
 * Importa el código, no solo "que lanza": los dos bordes de source_key comparten
 * tipo de error pero antes se reportaban con el código equivocado (400 en vez
 * de 500) o no se reportaban en absoluto.
 */
function expectErrorCode(fn: () => unknown, code: string): void {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).code).toBe(code);
    return;
  }

  throw new Error(`se esperaba un AppError con código ${code}, pero no se lanzó nada`);
}

describe('mapToCorePayload', () => {
  it('traduce exactamente el ejemplo del enunciado', () => {
    const result = mapToCorePayload(exampleRequest, rumboTemplate);
    expect(result).toEqual(expectedPayload);
  });

  it('mantiene el orden de dynamicData según el order de la plantilla', () => {
    const shuffledTemplate = {
      ...rumboTemplate,
      fields: [...rumboTemplate.fields].reverse(),
    };

    const result = mapToCorePayload(exampleRequest, shuffledTemplate);
    const labels = result.eventEntity.dynamicData.map((entry) => entry.etiqueta);

    expect(labels).toEqual(expectedPayload.eventEntity.dynamicData.map((entry) => entry.etiqueta));
  });

  it('mantiene el orden de eventAppliedEntities', () => {
    const shuffledTemplate = {
      ...rumboTemplate,
      events: [...rumboTemplate.events].reverse(),
    };

    const result = mapToCorePayload(exampleRequest, shuffledTemplate);

    expect(result.eventEntity.description).toBe('SolicitarEndoso');
    expect(result.eventAppliedEntities).toEqual([
      { description: 'SolicitarEndoso', orderEvent: 1 },
      { description: 'AprobarEndoso', orderEvent: 2 },
    ]);
  });

  it('distingue el default literal "Default" del default vacío ""', () => {
    const result = mapToCorePayload(exampleRequest, rumboTemplate);
    const byLabel = new Map(result.eventEntity.dynamicData.map((entry) => [entry.etiqueta, entry.value]));

    expect(byLabel.get('InicioVigenciaEndoso')).toBe('Default');
    expect(byLabel.get('TipoVigenciaEndoso')).toBe('');
    expect(byLabel.has('TipoVigenciaEndoso')).toBe(true);
  });

  it('usa default_value cuando el input no envía un campo INPUT', () => {
    const templateWithDefault = {
      ...rumboTemplate,
      fields: rumboTemplate.fields.map((field) =>
        field.label === 'NombreUsuario' ? { ...field, defaultValue: 'anonimo' } : field,
      ),
    };

    const result = mapToCorePayload(
      { ...exampleRequest, usuario: '' },
      templateWithDefault,
    );
    const nombre = result.eventEntity.dynamicData.find(
      (entry) => entry.etiqueta === 'NombreUsuario',
    );

    expect(nombre?.value).toBe('anonimo');
  });

  it('falla con MISSING_FIELD_VALUE si falta un campo sin default', () => {
    expect(() => mapToCorePayload({ ...exampleRequest, usuario: '' }, rumboTemplate)).toThrowError(
      AppError,
    );

    try {
      mapToCorePayload({ ...exampleRequest, usuario: '' }, rumboTemplate);
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).code).toBe('MISSING_FIELD_VALUE');
    }
  });

  it('falla con TEMPLATE_CONFIG_INVALID si hay órdenes duplicados', () => {
    const invalidTemplate = {
      ...rumboTemplate,
      fields: rumboTemplate.fields.map((field) =>
        field.label === 'NombreUsuario' ? { ...field, order: 1 } : field,
      ),
    };

    try {
      mapToCorePayload(exampleRequest, invalidTemplate);
      throw new Error('se esperaba un AppError');
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).code).toBe('TEMPLATE_CONFIG_INVALID');
    }
  });

  it('falla con TEMPLATE_CONFIG_INVALID si un CONSTANT no define valor', () => {
    const invalidTemplate = {
      ...rumboTemplate,
      fields: rumboTemplate.fields.map((field) =>
        field.label === 'ResponsableAtencion' ? { ...field, constantValue: null } : field,
      ),
    };

    try {
      mapToCorePayload(exampleRequest, invalidTemplate);
      throw new Error('se esperaba un AppError');
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).code).toBe('TEMPLATE_CONFIG_INVALID');
    }
  });

  it('falla con TEMPLATE_CONFIG_INVALID si la plantilla no tiene campos', () => {
    try {
      mapToCorePayload(exampleRequest, { ...rumboTemplate, fields: [] });
      throw new Error('se esperaba un AppError');
    } catch (error) {
      expect((error as AppError).code).toBe('TEMPLATE_CONFIG_INVALID');
    }
  });

  // --- Configuración inválida: ramas que existían en el código y no tenían test ---

  it('falla con TEMPLATE_CONFIG_INVALID si un DEFAULT no define default_value', () => {
    const invalidTemplate = {
      ...rumboTemplate,
      fields: rumboTemplate.fields.map((field) =>
        field.label === 'InicioVigenciaEndoso' ? { ...field, defaultValue: null } : field,
      ),
    };

    expectErrorCode(
      () => mapToCorePayload(exampleRequest, invalidTemplate),
      'TEMPLATE_CONFIG_INVALID',
    );
  });

  it('falla con TEMPLATE_CONFIG_INVALID si un INPUT no define source_key', () => {
    // `sourceKey: null` se normaliza a '' y lo atrapa el guard de vacío, pero el
    // guard de contrato (`''` tampoco es clave del request) lo atraparía igual.
    // Este test afirma el COMPORTAMIENTO observable (TEMPLATE_CONFIG_INVALID),
    // no cuál de las dos capas responde: ambas dan el mismo resultado por diseño.
    const invalidTemplate = {
      ...rumboTemplate,
      fields: rumboTemplate.fields.map((field) =>
        field.label === 'NombreUsuario' ? { ...field, sourceKey: null } : field,
      ),
    };

    expectErrorCode(
      () => mapToCorePayload(exampleRequest, invalidTemplate),
      'TEMPLATE_CONFIG_INVALID',
    );
  });

  it('falla con TEMPLATE_CONFIG_INVALID si la plantilla no define eventos', () => {
    // `events: []` es atrapado por assertValidTemplate Y por el guard del evento
    // principal (`orderedEvents[0]`). Este test afirma el COMPORTAMIENTO
    // observable (TEMPLATE_CONFIG_INVALID), no cuál de las dos defensas lo emite.
    expectErrorCode(
      () => mapToCorePayload(exampleRequest, { ...rumboTemplate, events: [] }),
      'TEMPLATE_CONFIG_INVALID',
    );
  });

  it('falla con TEMPLATE_CONFIG_INVALID si hay un orderEvent duplicado', () => {
    const invalidTemplate = {
      ...rumboTemplate,
      events: rumboTemplate.events.map((event) =>
        event.description === 'AprobarEndoso' ? { ...event, orderEvent: 1 } : event,
      ),
    };

    expectErrorCode(
      () => mapToCorePayload(exampleRequest, invalidTemplate),
      'TEMPLATE_CONFIG_INVALID',
    );
  });

  it('falla con TEMPLATE_CONFIG_INVALID si el source del campo no está soportado', () => {
    const invalidTemplate = {
      ...rumboTemplate,
      fields: rumboTemplate.fields.map((field) =>
        field.label === 'ProductosVida'
          ? { ...field, source: 'INVENTADO' as TemplateFieldSource }
          : field,
      ),
    };

    expectErrorCode(
      () => mapToCorePayload(exampleRequest, invalidTemplate),
      'TEMPLATE_CONFIG_INVALID',
    );
  });

  // --- Bordes nuevos: source_key defectuoso es error de PLANTILLA, no de request ---

  it('falla con TEMPLATE_CONFIG_INVALID si source_key está vacío o solo espacios', () => {
    for (const badKey of ['', '   ']) {
      const invalidTemplate = {
        ...rumboTemplate,
        fields: rumboTemplate.fields.map((field) =>
          field.label === 'NombreUsuario' ? { ...field, sourceKey: badKey } : field,
        ),
      };

      expectErrorCode(
        () => mapToCorePayload(exampleRequest, invalidTemplate),
        'TEMPLATE_CONFIG_INVALID',
      );
    }
  });

  it('falla con TEMPLATE_CONFIG_INVALID si source_key no existe en el contrato, aunque haya default', () => {
    const invalidTemplate = {
      ...rumboTemplate,
      fields: rumboTemplate.fields.map((field) =>
        field.label === 'NombreUsuario'
          ? { ...field, sourceKey: 'usuarioTipeado', defaultValue: 'anonimo' }
          : field,
      ),
    };

    // Antes: devolvía 'anonimo' en silencio y el payload salía incorrecto sin error.
    expectErrorCode(
      () => mapToCorePayload(exampleRequest, invalidTemplate),
      'TEMPLATE_CONFIG_INVALID',
    );
  });
});
