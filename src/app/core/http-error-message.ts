import { HttpErrorResponse } from '@angular/common/http';

/**
 * El cuerpo de un error ya parseado, o el JSON que contiene si llego como ArrayBuffer (asi llegan los
 * errores de las peticiones con responseType "arraybuffer", como la descarga del audio de una pista).
 */
function bodyOf(error: HttpErrorResponse): { error?: unknown } | null {
  const body: unknown = error.error;
  // Se compara por la etiqueta interna y no con instanceof: un ArrayBuffer de otro "realm" (iframe, worker)
  // no es instanceof del global, pero sigue siendo un ArrayBuffer.
  if (Object.prototype.toString.call(body) === '[object ArrayBuffer]') {
    try {
      return JSON.parse(new TextDecoder().decode(body as ArrayBuffer));
    } catch {
      return null; // vacio o no es JSON
    }
  }
  return body && typeof body === 'object' ? (body as { error?: unknown }) : null;
}

/**
 * Mensaje legible para el usuario a partir de un error: si el API Gateway respondio con su cuerpo uniforme
 * `{ error: "..." }` se muestra ese texto; si no, uno generico segun el codigo HTTP.
 */
export function httpErrorMessage(error: unknown, fallback = 'Ocurrió un error inesperado.'): string {
  if (error instanceof HttpErrorResponse) {
    const body = bodyOf(error);
    if (body && typeof body.error === 'string' && body.error.trim() !== '') {
      return body.error;
    }
    if (error.status === 0) {
      return 'No se pudo conectar con el servidor. Verifica que el API esté activo.';
    }
    if (error.status === 404) {
      return 'No se encontró lo que se pedía.';
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
