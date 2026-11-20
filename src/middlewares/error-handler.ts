import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../errors/app-error';

interface ErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

/**
 * Manejador central de errores. Debe registrarse al final de la cadena de middlewares.
 * Convierte cualquier error en una respuesta JSON con formato consistente.
 */
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  // Errores de validación de zod -> 400
  if (err instanceof ZodError) {
    const body: ErrorBody = {
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Los datos enviados no son válidos',
        details: err.issues.map((issue) => ({
          field: issue.path.join('.'),
          message: issue.message,
        })),
      },
    };
    res.status(400).json(body);
    return;
  }

  // Errores controlados de la aplicación
  if (err instanceof AppError) {
    const body: ErrorBody = {
      error: { code: err.code, message: err.message, details: err.details },
    };
    res.status(err.statusCode).json(body);
    return;
  }

  // Errores del parser de body de Express (JSON mal formado, body demasiado grande)
  if (typeof err === 'object' && err !== null && 'type' in err) {
    const type = (err as { type: unknown }).type;
    if (type === 'entity.parse.failed') {
      const body: ErrorBody = {
        error: { code: 'INVALID_JSON', message: 'El cuerpo de la petición no es un JSON válido' },
      };
      res.status(400).json(body);
      return;
    }
    if (type === 'entity.too.large') {
      const body: ErrorBody = {
        error: {
          code: 'PAYLOAD_TOO_LARGE',
          message: 'El cuerpo de la petición es demasiado grande',
        },
      };
      res.status(413).json(body);
      return;
    }
  }

  // Cualquier otro error es inesperado: se registra y no se expone el detalle al cliente
  console.error('Error no controlado:', err);
  const body: ErrorBody = {
    error: { code: 'INTERNAL_ERROR', message: 'Error interno del servidor' },
  };
  res.status(500).json(body);
}
