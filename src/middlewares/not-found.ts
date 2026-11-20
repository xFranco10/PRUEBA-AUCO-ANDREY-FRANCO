import type { Request, Response, NextFunction } from 'express';
import { NotFoundError } from '../errors/app-error';

/** Captura cualquier ruta que no exista y la delega al manejador de errores. */
export function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
  next(new NotFoundError(`Ruta no encontrada: ${req.method} ${req.originalUrl}`));
}
