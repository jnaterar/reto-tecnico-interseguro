import type { DataSource } from 'typeorm';
import type {
  EndorsementTemplate,
  TemplateEventDefinition,
  TemplateFieldDefinition,
} from '../entities/template.entity';
import { TemplateModel } from '../models/template.model';
import type { TemplateRepository } from './template.repository';

/**
 * Adaptador TypeORM del puerto TemplateRepository.
 *
 * Toda la "inteligencia" de qué etiquetas y en qué orden existen vive en BD.
 * Agregar un producto o tipo de endoso nuevo es un INSERT, no un cambio de
 * código (Open/Closed).
 */
export class TypeOrmTemplateRepository implements TemplateRepository {
  constructor(private readonly dataSource: DataSource) {}

  async findTemplate(product: string, endorsementType: string): Promise<EndorsementTemplate | null> {
    const template = await this.dataSource
      .getRepository(TemplateModel)
      .createQueryBuilder('template')
      .innerJoinAndSelect('template.product', 'product')
      .innerJoinAndSelect('template.endorsementType', 'endorsementType')
      .leftJoinAndSelect('template.fields', 'field')
      .leftJoinAndSelect('template.events', 'event')
      .where('template.isActive = :isActive', { isActive: true })
      .andWhere('(LOWER(product.name) = LOWER(:product) OR LOWER(product.code) = LOWER(:product))', {
        product,
      })
      .andWhere(
        '(LOWER(endorsementType.name) = LOWER(:endorsementType) OR LOWER(endorsementType.code) = LOWER(:endorsementType))',
        { endorsementType },
      )
      .orderBy('template.version', 'DESC')
      .getOne();

    if (!template) {
      return null;
    }
    return toDomain(template);
  }
}

function toDomain(model: TemplateModel): EndorsementTemplate {
  const fields: TemplateFieldDefinition[] = model.fields.map((field) => ({
    label: field.label,
    order: field.orderIndex,
    source: field.source,
    sourceKey: field.sourceKey,
    constantValue: field.constantValue,
    defaultValue: field.defaultValue,
  }));

  const events: TemplateEventDefinition[] = model.events.map((event) => ({
    description: event.description,
    orderEvent: event.orderEvent,
  }));

  return {
    templateId: model.id,
    version: model.version,
    productCode: model.product.code,
    productName: model.product.name,
    endorsementTypeCode: model.endorsementType.code,
    endorsementTypeName: model.endorsementType.name,
    fields,
    events,
  };
}
