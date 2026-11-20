import 'dotenv/config';
import { z } from 'zod';

// Esquema de las variables de entorno. Si falta o es inválida alguna,
// la app falla al arrancar con un mensaje claro (fail-fast).
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3001),

  MONGO_URI: z.string().min(1, 'MONGO_URI es requerida'),
  MONGO_DB_NAME: z.string().min(1).default('auco_validations'),

  EXTERNAL_API_BASE_URL: z.url().default('https://date.nager.at/api/v3'),
  EXTERNAL_API_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
  EXTERNAL_API_RETRIES: z.coerce.number().int().min(0).max(3).default(1),

  AWS_REGION: z.string().min(1).default('us-east-1'),
  AWS_ACCESS_KEY_ID: z.string().min(1).default('local'),
  AWS_SECRET_ACCESS_KEY: z.string().min(1).default('local'),
  DYNAMODB_ENDPOINT: z.url().default('http://localhost:8000'),
  DYNAMODB_TABLE: z.string().min(1).default('ValidationAudit'),
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
