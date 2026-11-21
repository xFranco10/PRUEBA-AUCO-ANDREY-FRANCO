import express from 'express';
import morgan from 'morgan';
import { env } from './config/env';
import { router } from './routes';
import { notFoundHandler } from './middlewares/not-found';
import { errorHandler } from './middlewares/error-handler';

// Se exporta una función fábrica para poder crear la app en las pruebas (supertest) sin levantar el servidor
export function createApp() {
  const app = express();

  // Log de cada petición en consola (método, ruta, estado, tiempo). No registra el body,
  // así que el documento enviado en el POST nunca aparece en los logs. Se omite en las pruebas.
  if (env.NODE_ENV !== 'test') {
    app.use(morgan(env.NODE_ENV === 'production' ? 'combined' : 'dev'));
  }

  app.use(express.json());
  app.use(router);

  // El orden importa: primero 404, al final el manejador de errores
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
