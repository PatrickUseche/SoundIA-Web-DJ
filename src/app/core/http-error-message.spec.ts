import { HttpErrorResponse } from '@angular/common/http';
import { httpErrorMessage } from './http-error-message';

const http = (status: number, error: unknown = null) =>
  new HttpErrorResponse({ status, statusText: 'x', error });

describe('httpErrorMessage', () => {
  it('muestra el mensaje del API cuando viene en el cuerpo uniforme', () => {
    expect(httpErrorMessage(http(422, { error: 'El audio es silencio; no hay nada que analizar.' })))
      .toBe('El audio es silencio; no hay nada que analizar.');
  });

  it('el mensaje del API tiene prioridad sobre el del codigo HTTP', () => {
    expect(httpErrorMessage(http(404, { error: 'No existe la sesion 9.' }))).toBe('No existe la sesion 9.');
  });

  it('ignora un cuerpo sin mensaje util y usa el del codigo', () => {
    expect(httpErrorMessage(http(404, { error: '   ' }))).toBe('No se encontró lo que se pedía.');
    expect(httpErrorMessage(http(404, { otro: 1 }))).toBe('No se encontró lo que se pedía.');
    expect(httpErrorMessage(http(404, 'texto plano'))).toBe('No se encontró lo que se pedía.');
  });

  it('lee el mensaje cuando el cuerpo llega como ArrayBuffer (descargas binarias que fallan)', () => {
    const cuerpo = new TextEncoder().encode('{"error":"La pista no tiene audio guardado."}').buffer;

    expect(httpErrorMessage(http(404, cuerpo))).toBe('La pista no tiene audio guardado.');
  });

  it('un ArrayBuffer que no contiene JSON usa el mensaje del codigo HTTP', () => {
    const cuerpo = new TextEncoder().encode('<html>Not Found</html>').buffer;

    expect(httpErrorMessage(http(404, cuerpo))).toBe('No se encontró lo que se pedía.');
  });

  it('un ArrayBuffer vacio usa el mensaje del codigo HTTP', () => {
    expect(httpErrorMessage(http(502, new ArrayBuffer(0)))).toContain('problema');
  });

  it('sin conexion (status 0) lo explica', () => {
    expect(httpErrorMessage(http(0))).toContain('No se pudo conectar');
  });

  it('un archivo demasiado grande se explica', () => {
    expect(httpErrorMessage(http(413))).toContain('demasiado grande');
  });

  it('un error del servidor se muestra de forma generica', () => {
    expect(httpErrorMessage(http(500))).toContain('problema');
    expect(httpErrorMessage(http(502))).toContain('problema');
  });

  it('otros codigos sin mensaje del API usan el mensaje de respaldo por defecto', () => {
    expect(httpErrorMessage(http(409))).toBe('Ocurrió un error inesperado.');
    expect(httpErrorMessage(http(418))).toBe('Ocurrió un error inesperado.');
  });

  it('permite personalizar el mensaje de respaldo', () => {
    expect(httpErrorMessage(http(418), 'Algo fallo')).toBe('Algo fallo');
    expect(httpErrorMessage(new Object(), 'No se pudo cargar')).toBe('No se pudo cargar');
  });

  it('un Error normal muestra su mensaje', () => {
    expect(httpErrorMessage(new Error('No se pudo decodificar el audio.'))).toBe('No se pudo decodificar el audio.');
  });

  it('un valor desconocido usa el respaldo', () => {
    expect(httpErrorMessage(undefined)).toBe('Ocurrió un error inesperado.');
    expect(httpErrorMessage('boom', 'Fallo')).toBe('Fallo');
  });
});
