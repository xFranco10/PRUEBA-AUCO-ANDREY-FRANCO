import type { Request, Response, NextFunction, RequestHandler } from 'express';
import type { ZodType } from 'zod';

/**
 * Valida req.body con un esquema de zod. Si es válido reemplaza el body por el dato
 * ya parseado y normalizado; si no, delega el ZodError al manejador central (400).
 */
export function validateBody(schema: ZodType): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      next(result.error);
      return;
    }
    req.body = result.data;
    next();
  };
}
