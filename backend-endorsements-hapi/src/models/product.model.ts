import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { TemplateModel } from './template.model';

@Entity({ name: 'products' })
export class ProductModel {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'varchar', length: 40, unique: true })
  code!: string;

  @Column({ type: 'varchar', length: 100 })
  name!: string;

  @OneToMany(() => TemplateModel, (template) => template.product)
  templates!: TemplateModel[];
}
