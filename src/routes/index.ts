import { Router } from 'express';

export const router = Router();

// Healthcheck sencillo para verificar que el servicio está arriba
router.get('/health', (_req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

// Las rutas de /validations se registrarán aquí en la Fase 3
