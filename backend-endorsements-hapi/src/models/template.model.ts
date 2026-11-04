import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import type { TemplateFieldSource } from '../entities/template.entity';
import { EndorsementTypeModel } from './endorsement-type.model';
import { ProductModel } from './product.model';

@Entity({ name: 'templates' })
@Unique('uq_template_product_type_version', ['product', 'endorsementType', 'version'])
export class TemplateModel {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => ProductModel, (product) => product.templates, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'product_id' })
  product!: ProductModel;

  @ManyToOne(() => EndorsementTypeModel, (type) => type.templates, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'endorsement_type_id' })
  endorsementType!: EndorsementTypeModel;

  @Column({ type: 'int', default: 1 })
  version!: number;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @OneToMany(() => TemplateFieldModel, (field) => field.template, { cascade: true })
  fields!: TemplateFieldModel[];

  @OneToMany(() => TemplateEventModel, (event) => event.template, { cascade: true })
  events!: TemplateEventModel[];
}

@Entity({ name: 'template_fields' })
export class TemplateFieldModel {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => TemplateModel, (template) => template.fields, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'template_id' })
  template!: TemplateModel;

  @Column({ type: 'varchar', length: 80 })
  label!: string;

  @Column({ name: 'order_index', type: 'int' })
  orderIndex!: number;

  @Column({ type: 'varchar', length: 20 })
  source!: TemplateFieldSource;

  @Column({ name: 'source_key', type: 'varchar', length: 60, nullable: true })
  sourceKey!: string | null;

  @Column({ name: 'constant_value', type: 'varchar', length: 200, nullable: true })
  constantValue!: string | null;

  @Column({ name: 'default_value', type: 'varchar', length: 200, nullable: true })
  defaultValue!: string | null;
}

@Entity({ name: 'template_events' })
export class TemplateEventModel {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => TemplateModel, (template) => template.events, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'template_id' })
  template!: TemplateModel;

  @Column({ type: 'varchar', length: 80 })
  description!: string;

  @Column({ name: 'order_event', type: 'int' })
  orderEvent!: number;
}
