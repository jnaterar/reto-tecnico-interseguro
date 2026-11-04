import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { loadConfig } from './env';
import { EndorsementTypeModel } from '../models/endorsement-type.model';
import { ProductModel } from '../models/product.model';
import {
  TemplateEventModel,
  TemplateFieldModel,
  TemplateModel,
} from '../models/template.model';

export function createDataSource(): DataSource {
  const config = loadConfig();

  return new DataSource({
    type: 'postgres',
    host: config.dbHost,
    port: config.dbPort,
    username: config.dbUser,
    password: config.dbPassword,
    database: config.dbName,
    entities: [
      ProductModel,
      EndorsementTypeModel,
      TemplateModel,
      TemplateFieldModel,
      TemplateEventModel,
    ],
    // synchronize=true es aceptable para el reto (BD efímera). En producción
    // se usarían migraciones versionadas.
    synchronize: config.dbSynchronize,
    logging: config.dbLogging,
  });
}
