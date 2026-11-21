import 'dotenv/config';
import { z } from 'zod';

// Una variable declarada vacía en el .env (ej. DYNAMODB_ENDPOINT=) se trata como si no existiera
const emptyToUndefined = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => (value === '' ? undefined : value), schema);

// Esquema de las variables de entorno. Si falta o es inválida alguna,
// la app falla al arrancar con un mensaje claro (fail-fast).
const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(3000),

    MONGO_URI: z.string().min(1, 'MONGO_URI es requerida'),
    MONGO_DB_NAME: z.string().min(1).default('auco_validations'),

    EXTERNAL_API_BASE_URL: z.url().default('https://date.nager.at/api/v3'),
    EXTERNAL_API_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
    EXTERNAL_API_RETRIES: z.coerce.number().int().min(0).max(3).default(1),

    AWS_REGION: z.string().min(1).default('us-east-1'),
    // Opcionales a propósito: en AWS real las credenciales las aporta el rol IAM y no deben
    // forzarse aquí; DYNAMODB_ENDPOINT solo se define para apuntar a DynamoDB Local.
    AWS_ACCESS_KEY_ID: emptyToUndefined(z.string().min(1).optional()),
    AWS_SECRET_ACCESS_KEY: emptyToUndefined(z.string().min(1).optional()),
    DYNAMODB_ENDPOINT: emptyToUndefined(z.url().optional()),
    DYNAMODB_TABLE: z.string().min(1).default('ValidationAudit'),
  })
  // Las credenciales van juntas o ninguna
  .refine((value) => Boolean(value.AWS_ACCESS_KEY_ID) === Boolean(value.AWS_SECRET_ACCESS_KEY), {
    message: 'AWS_ACCESS_KEY_ID y AWS_SECRET_ACCESS_KEY deben definirse juntas',
    path: ['AWS_SECRET_ACCESS_KEY'],
  });

export type Env = z.infer<typeof envSchema>;

/** Parsea y valida un objeto de variables de entorno. Lanza un Error legible si es inválido. */
export function parseEnv(source: NodeJS.ProcessEnv): Env {
  const result = envSchema.safeParse(source);

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Variables de entorno inválidas:\n${details}`);
  }

  return result.data;
}

export const env = parseEnv(process.env);
