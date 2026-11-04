import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { TemplateModel } from './template.model';

@Entity({ name: 'endorsement_types' })
export class EndorsementTypeModel {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'varchar', length: 40, unique: true })
  code!: string;

  @Column({ type: 'varchar', length: 100 })
  name!: string;

  @OneToMany(() => TemplateModel, (template) => template.endorsementType)
  templates!: TemplateModel[];
}
