/**
 * Convierte un error en un texto útil para logs. Algunos errores de conexión de Node
 * (ej. ECONNREFUSED) llegan con `message` vacío, así que se incluye también nombre y código.
 */
export function describeError(error: unknown): string {
  if (error instanceof Error) {
    const code = (error as { code?: unknown }).code;
    return [error.name, typeof code === 'string' ? code : undefined, error.message]
      .filter(Boolean)
      .join(': ');
  }
  return String(error);
}
