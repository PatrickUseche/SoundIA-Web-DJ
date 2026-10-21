import { HttpErrorResponse } from '@angular/common/http';

/**
 * Mensaje legible para el usuario a partir de un error: si el API Gateway respondio con su cuerpo uniforme
 * `{ error: "..." }` se muestra ese texto; si no, uno generico segun el codigo HTTP.
 */
export function httpErrorMessage(error: unknown, fallback = 'Ocurrio un error inesperado.'): string {
  if (error instanceof HttpErrorResponse) {
    const body = error.error as { error?: unknown } | null;
    if (body && typeof body === 'object' && typeof body.error === 'string' && body.error.trim() !== '') {
      return body.error;
    }
    if (error.status === 0) {
      return 'No se pudo conectar con el servidor. Verifica que el API este activo.';
    }
    if (error.status === 404) {
      return 'No se encontro lo que se pedia.';
    }
    if (error.status === 413) {
      return 'El archivo es demasiado grande.';
    }
    if (error.status >= 500) {
      return 'El servidor tuvo un problema. Intenta de nuevo en un momento.';
    }
    return fallback;
  }
  if (error instanceof Error && error.message !== '') {
    return error.message;
  }
  return fallback;
}
