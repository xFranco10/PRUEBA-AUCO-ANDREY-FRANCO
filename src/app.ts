import express from 'express';
import { router } from './routes';
import { notFoundHandler } from './middlewares/not-found';
import { errorHandler } from './middlewares/error-handler';

// Se exporta una función fábrica para poder crear la app en las pruebas (supertest) sin levantar el servidor
export function createApp() {
  const app = express();

  app.use(express.json());
  app.use(router);

  // El orden importa: primero 404, al final el manejador de errores
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
