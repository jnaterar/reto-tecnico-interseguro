import { describe, expect, it } from 'vitest';
import { AppError } from '../src/errors/app-error';
import { mapToCorePayload } from '../src/mappers/endorse.mapper';
import {
  exampleRequest,
  expectedPayload,
  rumboTemplate,
} from './fixtures';

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
});
