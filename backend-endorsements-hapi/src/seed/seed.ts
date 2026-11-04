import 'reflect-metadata';
import type { DataSource } from 'typeorm';
import { createDataSource } from '../config/data-source';
import type { TemplateFieldSource } from '../entities/template.entity';
import { EndorsementTypeModel } from '../models/endorsement-type.model';
import { ProductModel } from '../models/product.model';
import {
  TemplateEventModel,
  TemplateFieldModel,
  TemplateModel,
} from '../models/template.model';

interface FieldSeed {
  label: string;
  order: number;
  source: TemplateFieldSource;
  sourceKey?: string;
  constantValue?: string;
  defaultValue?: string | null;
}

interface EventSeed {
  description: string;
  orderEvent: number;
}

export interface TemplateSeed {
  product: { code: string; name: string };
  endorsementType: { code: string; name: string };
  fields: FieldSeed[];
  events: EventSeed[];
}

/**
 * Plantilla del caso del enunciado: Rumbo / CambioFrecuencia.
 *
 * Nótese que TES008 y "EndososSimplesSACRumbo" NO vienen del request: son
 * columnas CONSTANT de la plantilla. "InicioVigenciaEndoso" es DEFAULT
 * "Default" y "TipoVigenciaEndoso" es DEFAULT "" (vacío intencional).
 */
export const RUMBO_CAMBIO_FRECUENCIA: TemplateSeed = {
  product: { code: 'RUMBO', name: 'Rumbo' },
  endorsementType: { code: 'CAMBIO_FRECUENCIA', name: 'CambioFrecuencia' },
  fields: [
    { label: 'ProductosVida', order: 1, source: 'INPUT', sourceKey: 'producto' },
    { label: 'NombreUsuario', order: 2, source: 'INPUT', sourceKey: 'usuario' },
    { label: 'NumeroPolizaEndoso', order: 3, source: 'INPUT', sourceKey: 'policyNumber' },
    { label: 'TipoEndosoPol', order: 4, source: 'CONSTANT', constantValue: 'Endoso Simple' },
    { label: 'ResponsableAtencion', order: 5, source: 'CONSTANT', constantValue: 'SAC' },
    { label: 'EndosoModifPrima', order: 6, source: 'CONSTANT', constantValue: 'Si' },
    { label: 'InicioVigenciaEndoso', order: 7, source: 'DEFAULT', defaultValue: 'Default' },
    { label: 'TipoVigenciaEndoso', order: 8, source: 'DEFAULT', defaultValue: '' },
    { label: 'EndososSimplesSACRumbo', order: 9, source: 'CONSTANT', constantValue: 'TES008' },
    { label: 'FechaSolicitud', order: 10, source: 'INPUT', sourceKey: 'fechaSolicitud' },
    { label: 'FechaCliente', order: 11, source: 'INPUT', sourceKey: 'fechaCliente' },
    { label: 'FechaEfectiva', order: 12, source: 'INPUT', sourceKey: 'fechaEfectiva' },
  ],
  events: [
    { description: 'SolicitarEndoso', orderEvent: 1 },
    { description: 'AprobarEndoso', orderEvent: 2 },
  ],
};

/**
 * Segunda plantilla incluida solo para demostrar extensibilidad: agregar un
 * producto/tipo de endoso nuevo es un INSERT (este seed), no un cambio en el
 * mapper ni en el servicio.
 */
export const AUTO_CAMBIO_FRECUENCIA: TemplateSeed = {
  product: { code: 'AUTO', name: 'Auto' },
  endorsementType: { code: 'CAMBIO_FRECUENCIA', name: 'CambioFrecuencia' },
  fields: [
    { label: 'ProductosVida', order: 1, source: 'INPUT', sourceKey: 'producto' },
    { label: 'NombreUsuario', order: 2, source: 'INPUT', sourceKey: 'usuario' },
    { label: 'NumeroPolizaEndoso', order: 3, source: 'INPUT', sourceKey: 'policyNumber' },
    { label: 'TipoEndosoPol', order: 4, source: 'CONSTANT', constantValue: 'Endoso Simple' },
    { label: 'ResponsableAtencion', order: 5, source: 'CONSTANT', constantValue: 'SAC' },
    { label: 'InicioVigenciaEndoso', order: 6, source: 'DEFAULT', defaultValue: 'Default' },
    { label: 'FechaSolicitud', order: 7, source: 'INPUT', sourceKey: 'fechaSolicitud' },
  ],
  events: [
    { description: 'SolicitarEndoso', orderEvent: 1 },
    { description: 'AprobarEndoso', orderEvent: 2 },
  ],
};

export async function upsertTemplate(dataSource: DataSource, seed: TemplateSeed): Promise<void> {
  const productRepository = dataSource.getRepository(ProductModel);
  const endorsementTypeRepository = dataSource.getRepository(EndorsementTypeModel);
  const templateRepository = dataSource.getRepository(TemplateModel);
  const fieldRepository = dataSource.getRepository(TemplateFieldModel);
  const eventRepository = dataSource.getRepository(TemplateEventModel);

  let product = await productRepository.findOne({ where: { code: seed.product.code } });
  if (!product) {
    product = await productRepository.save(productRepository.create(seed.product));
  }

  let endorsementType = await endorsementTypeRepository.findOne({
    where: { code: seed.endorsementType.code },
  });
  if (!endorsementType) {
    endorsementType = await endorsementTypeRepository.save(
      endorsementTypeRepository.create(seed.endorsementType),
    );
  }

  let template = await templateRepository.findOne({
    where: {
      product: { id: product.id },
      endorsementType: { id: endorsementType.id },
      version: 1,
    },
  });
  if (!template) {
    template = await templateRepository.save(
      templateRepository.create({
        product,
        endorsementType,
        version: 1,
        isActive: true,
      }),
    );
  }

  // Reemplazo completo de hijos para que el seed sea idempotente.
  await fieldRepository.delete({ template: { id: template.id } });
  await eventRepository.delete({ template: { id: template.id } });

  await fieldRepository.save(
    seed.fields.map((field) =>
      fieldRepository.create({
        template,
        label: field.label,
        orderIndex: field.order,
        source: field.source,
        sourceKey: field.sourceKey ?? null,
        constantValue: field.constantValue ?? null,
        defaultValue: field.defaultValue === undefined ? null : field.defaultValue,
      }),
    ),
  );

  await eventRepository.save(
    seed.events.map((event) =>
      eventRepository.create({
        template,
        description: event.description,
        orderEvent: event.orderEvent,
      }),
    ),
  );

  // eslint-disable-next-line no-console
  console.log(
    `Plantilla ${seed.product.code}/${seed.endorsementType.code} v${template.version} lista ` +
      `(${seed.fields.length} campos, ${seed.events.length} eventos)`,
  );
}

async function main(): Promise<void> {
  const dataSource = createDataSource();
  await dataSource.initialize();

  try {
    await upsertTemplate(dataSource, RUMBO_CAMBIO_FRECUENCIA);
    await upsertTemplate(dataSource, AUTO_CAMBIO_FRECUENCIA);
    // eslint-disable-next-line no-console
    console.log('Seed completado');
  } finally {
    await dataSource.destroy();
  }
}

if (require.main === module) {
  main().catch((error: unknown) => {
    // eslint-disable-next-line no-console
    console.error('Error ejecutando el seed', error);
    process.exit(1);
  });
}
