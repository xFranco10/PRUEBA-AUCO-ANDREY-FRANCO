import type { Request, Response } from 'express';
import * as validationService from '../services/validation.service';

// Express 5 propaga automáticamente los errores de handlers async al manejador central

export async function create(req: Request, res: Response): Promise<void> {
  const id = await validationService.createValidation(req.body);
  res.status(201).json({ id });
}

export async function getById(req: Request, res: Response): Promise<void> {
  const validation = await validationService.getValidationById(String(req.params.id));
  res.json(validation);
}
