import type { Server } from 'node:http';
import { env } from './config/env';
import { connectMongo, disconnectMongo } from './config/database';
import { ensureAuditTable } from './config/dynamo';
import { createApp } from './app';
import { describeError } from './utils/describe-error';

let server: Server | undefined;

async function start(): Promise<void> {
  // Primero la base de datos: si Mongo no responde, la app no arranca a medias
  await connectMongo();

  // DynamoDB es secundario (auditoría): si no responde se avisa pero la app arranca igual
  try {
    const created = await ensureAuditTable();
    console.log(created ? 'Tabla de auditoría creada en DynamoDB' : 'Tabla de auditoría lista');
  } catch (error) {
    console.warn(
      'No se pudo verificar la tabla de auditoría en DynamoDB; los eventos fallarán hasta que esté disponible:',
      describeError(error),
    );
  }

  server = createApp().listen(env.PORT, () => {
    console.log(`Servidor escuchando en http://localhost:${env.PORT} (${env.NODE_ENV})`);
  });
}

// Cierre ordenado: deja de aceptar conexiones, termina las en curso y cierra Mongo
async function shutdown(signal: string): Promise<void> {
  console.log(`${signal} recibido, cerrando servidor...`);
  if (server) {
    await new Promise<void>((resolve) => server!.close(() => resolve()));
  }
  await disconnectMongo();
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

start().catch((error: unknown) => {
  console.error('No se pudo iniciar el servidor:', error);
  process.exit(1);
});
