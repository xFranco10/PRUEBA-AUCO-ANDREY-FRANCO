import { z } from 'zod';

// Texto obligatorio con mensajes en español para "falta el campo" y "no es texto"
const requiredString = (label: string) =>
  z.string({
    error: (issue) =>
      issue.input === undefined ? `${label} es requerido` : `${label} debe ser texto`,
  });

export const createValidationBodySchema = z.object(
  {
    // Letras (con tildes y ñ), espacios, guion y apóstrofe. Debe empezar con una letra.
    name: requiredString('name')
      .trim()
      .min(2, 'name debe tener al menos 2 caracteres')
      .max(100, 'name debe tener máximo 100 caracteres')
      .regex(/^\p{L}[\p{L}\p{M}\s'’-]*$/u, 'name solo admite letras, espacios, guion y apóstrofe'),

    // Cédula colombiana: solo dígitos, de 6 a 10. Se exige string para no perder ceros iniciales.
    document: requiredString('document').regex(
      /^\d{6,10}$/,
      'document debe contener solo dígitos (entre 6 y 10)',
    ),

    // Código ISO 3166-1 alpha-2. Se normaliza a mayúsculas.
    country: requiredString('country')
      .trim()
      .regex(/^[A-Za-z]{2}$/, 'country debe ser un código ISO de 2 letras (ej. CO)')
      .transform((value) => value.toUpperCase()),
  },
  { error: 'El cuerpo de la petición debe ser un objeto JSON' },
);

export type CreateValidationInput = z.infer<typeof createValidationBodySchema>;

// ObjectId de MongoDB: 24 caracteres hexadecimales
export const objectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/);
