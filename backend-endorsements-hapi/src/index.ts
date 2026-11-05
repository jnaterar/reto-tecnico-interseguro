import 'reflect-metadata';
import { buildServer } from './app';
import { createDataSource } from './config/data-source';
import { loadConfig } from './config/env';
import { TypeOrmTemplateRepository } from './repositories/typeorm-template.repository';

async function main(): Promise<void> {
  const config = loadConfig();
  const dataSource = createDataSource();

  await dataSource.initialize();

  const templateRepository = new TypeOrmTemplateRepository(dataSource);
  const server = await buildServer({
    templateRepository,
    jwtSecret: config.jwtSecret,
    jwtTtlSeconds: config.jwtTtlSeconds,
    enableDemoToken: config.enableDemoToken,
    corsOrigins: config.corsOrigins,
    nodeEnv: config.nodeEnv,
    host: config.host,
    port: config.port,
  });

  await server.start();
  // eslint-disable-next-line no-console
  console.log(`endorsements-hapi escuchando en ${server.info.uri} (api v1)`);

  const shutdown = async (signal: string): Promise<void> => {
    // eslint-disable-next-line no-console
    console.log(`recibido ${signal}, apagando...`);
    await server.stop({ timeout: 10_000 });
    if (dataSource.isInitialized) {
      await dataSource.destroy();
    }
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((error: unknown) => {
  // eslint-disable-next-line no-console
  console.error('No se pudo iniciar el servicio de endosos', error);
  process.exit(1);
});
