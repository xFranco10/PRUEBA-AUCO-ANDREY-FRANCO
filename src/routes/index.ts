import { Router } from 'express';
import { validationRouter } from './validation.routes';

export const router = Router();

// Healthcheck sencillo para verificar que el servicio está arriba
router.get('/health', (_req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

router.use(validationRouter);
