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
    // Render y Cloud SQL por IP pública exigen TLS. En local (Postgres en
    // Docker) se deja desactivado para no exigir certificados.
    //
    // `rejectUnauthorized` es true por defecto: sin verificación de cadena el
    // TLS solo cifra y cualquiera con un certificado propio puede hacerse pasar
    // por la base. Se desactiva únicamente con DB_SSL_REJECT_UNAUTHORIZED=false
    // para un certificado self-signed concreto.
    ssl: config.dbSsl ? { rejectUnauthorized: config.dbSslVerify } : false,
    // synchronize=true es aceptable para el reto (BD efímera). En producción
    // se usarían migraciones versionadas.
    synchronize: config.dbSynchronize,
    logging: config.dbLogging,
  });
}
