import mongoose from 'mongoose';
import { env } from './env';

/** Abre la conexión a MongoDB. Falla rápido (5 s) si el servidor no responde. */
export async function connectMongo(): Promise<void> {
  await mongoose.connect(env.MONGO_URI, {
    dbName: env.MONGO_DB_NAME,
    serverSelectionTimeoutMS: 5000,
  });
  console.log(`MongoDB conectado (base: ${env.MONGO_DB_NAME})`);
}

export async function disconnectMongo(): Promise<void> {
  await mongoose.disconnect();
}
