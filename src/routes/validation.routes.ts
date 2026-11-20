import { Router } from 'express';
import * as validationController from '../controllers/validation.controller';
import { validateBody } from '../middlewares/validate';
import { createValidationBodySchema } from '../schemas/validation.schema';

export const validationRouter = Router();

validationRouter.post(
  '/validations',
  validateBody(createValidationBodySchema),
  validationController.create,
);
validationRouter.get('/validations/:id', validationController.getById);
