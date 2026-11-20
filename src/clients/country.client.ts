import { z } from 'zod';
import { env } from '../config/env';
import {
  CountryNotFoundError,
  ExternalApiError,
  ExternalApiTimeoutError,
} from '../errors/app-error';

// Forma que esperamos de Nager.Date. Se valida para no guardar basura si la API cambia.
const countryInfoSchema = z.object({
  commonName: z.string(),
  officialName: z.string(),
  region: z.string(),
  countryCode: z.string(),
});

export type CountryInfo = z.infer<typeof countryInfoSchema>;

/** Una sola llamada a la API externa, con timeout. Traduce cada falla a un error propio. */
async function fetchCountryInfo(countryCode: string): Promise<CountryInfo> {
  const baseUrl = env.EXTERNAL_API_BASE_URL.replace(/\/+$/, '');
  const url = `${baseUrl}/CountryInfo/${encodeURIComponent(countryCode)}`;

  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(env.EXTERNAL_API_TIMEOUT_MS),
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'TimeoutError') {
      throw new ExternalApiTimeoutError(env.EXTERNAL_API_TIMEOUT_MS);
    }
    // Error de red (DNS, conexión rechazada, etc.): vale la pena reintentar
    throw new ExternalApiError('No se pudo conectar con la API externa', true);
  }

  // País inexistente: no se reintenta porque el resultado no va a cambiar
  if (response.status === 404) {
    throw new CountryNotFoundError(countryCode);
  }

  if (!response.ok) {
    // 5xx y 429 pueden ser transitorios; el resto de 4xx no se arregla reintentando
    const retryable = response.status >= 500 || response.status === 429;
    throw new ExternalApiError(`La API externa respondió con estado ${response.status}`, retryable);
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new ExternalApiError('La API externa devolvió una respuesta que no es JSON', false);
  }

  const parsed = countryInfoSchema.safeParse(body);
  if (!parsed.success) {
    throw new ExternalApiError(
      'La API externa devolvió una respuesta con formato inesperado',
      false,
    );
  }

  return parsed.data;
}

function isRetryable(error: unknown): boolean {
  return (
    error instanceof ExternalApiTimeoutError ||
    (error instanceof ExternalApiError && error.retryable)
  );
}

/**
 * Obtiene la información del país con reintentos.
 * Intentos totales = 1 + EXTERNAL_API_RETRIES. Solo reintenta fallas transitorias.
 */
export async function getCountryInfo(countryCode: string): Promise<CountryInfo> {
  const maxAttempts = 1 + env.EXTERNAL_API_RETRIES;

  for (let attempt = 1; ; attempt++) {
    try {
      return await fetchCountryInfo(countryCode);
    } catch (error) {
      if (attempt >= maxAttempts || !isRetryable(error)) {
        throw error;
      }
      console.warn(`API externa falló (intento ${attempt}/${maxAttempts}), reintentando...`);
    }
  }
}
