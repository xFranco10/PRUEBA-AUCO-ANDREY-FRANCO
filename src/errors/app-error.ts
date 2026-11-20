/**
 * Error controlado de la aplicación. Lleva el código HTTP que debe
 * devolverse al cliente y un código interno estable para facilitar el consumo de la API.
 */
export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly code: string = 'INTERNAL_ERROR',
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Recurso no encontrado') {
    super(404, message, 'NOT_FOUND');
    this.name = 'NotFoundError';
  }
}

export class InvalidIdError extends AppError {
  constructor(message = 'El id no es válido') {
    super(400, message, 'INVALID_ID');
    this.name = 'InvalidIdError';
  }
}

/** El país tiene formato válido pero la API externa no lo conoce -> 422. */
export class CountryNotFoundError extends AppError {
  constructor(countryCode: string) {
    super(422, `El país "${countryCode}" no existe`, 'COUNTRY_NOT_FOUND');
    this.name = 'CountryNotFoundError';
  }
}

/** Falla de la API externa (5xx, red, respuesta inesperada) -> 502. */
export class ExternalApiError extends AppError {
  constructor(
    message: string,
    // Indica si vale la pena reintentar la llamada (ej. 5xx o red sí; respuesta mal formada no)
    public readonly retryable: boolean,
  ) {
    super(502, message, 'EXTERNAL_API_ERROR');
    this.name = 'ExternalApiError';
  }
}

/** La API externa no respondió a tiempo -> 504. Siempre es reintentable. */
export class ExternalApiTimeoutError extends AppError {
  constructor(timeoutMs: number) {
    super(504, `La API externa no respondió en ${timeoutMs} ms`, 'EXTERNAL_API_TIMEOUT');
    this.name = 'ExternalApiTimeoutError';
  }
}
