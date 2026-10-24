import { Page } from '@playwright/test';

export const PISTAS = [
  {
    id: 1, title: 'Noche de verano', duration: 2, bpm: 124, key: 'A minor', camelot: '8A',
    energy: 0.7, cuePoints: [0.5, 1.5], hasAudio: true, createdAt: '2026-10-20T10:00:00Z',
  },
  {
    id: 2, title: 'Amanecer', duration: 2, bpm: 126, key: 'E minor', camelot: '9A',
    energy: 0.5, cuePoints: [0.5], hasAudio: true, createdAt: '2026-10-20T11:00:00Z',
  },
  {
    id: 3, title: 'Pista antigua', duration: 2, bpm: 120, key: 'C major', camelot: '8B',
    energy: 0.4, cuePoints: [], hasAudio: false, createdAt: '2026-10-19T09:00:00Z',
  },
];

export const GRABACIONES = [
  {
    id: 1, fromTrackId: 1, toTrackId: 2, source: 'manual', dj: 'dj', mixOutAt: 1.5, mixInAt: 0.1, overlapSeconds: 1,
    genreA: 'salsa', genreB: 'salsa', quality: 'unreviewed', notes: '', createdAt: '2026-10-24T20:30:00+00:00',
    features: { overlapBars: 2, crossfaderShape: 'gradual', bassSwapAt: 0.5, phaseErrorMs: 12 },
  },
  {
    id: 2, fromTrackId: 2, toTrackId: 1, source: 'manual', dj: 'dj', mixOutAt: 1.2, mixInAt: 0.2, overlapSeconds: 1,
    genreA: 'bachata', genreB: 'salsa', quality: 'good', notes: 'entro justo', createdAt: '2026-10-24T20:40:00+00:00',
    features: { overlapBars: 2, crossfaderShape: 'corte', bassSwapAt: null, phaseErrorMs: null },
  },
];

export const LOGS = [
  { id: 1, controlId: 7, value: 64, action: 'CROSSFADE', createdIn: '2026-10-21T20:00:00Z' },
  { id: 2, controlId: 12, value: 100, action: null, createdIn: '2026-10-21T20:01:00Z' },
];

/** WAV mono de 16 bits con un tono de 440 Hz, suficiente para que el navegador lo decodifique. */
export function crearWav(segundos = 2, frecuencia = 8000): Buffer {
  const muestras = segundos * frecuencia;
  const datos = Buffer.alloc(muestras * 2);
  for (let i = 0; i < muestras; i++) {
    datos.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 440 * i) / frecuencia) * 8000), i * 2);
  }
  const cabecera = Buffer.alloc(44);
  cabecera.write('RIFF', 0);
  cabecera.writeUInt32LE(36 + datos.length, 4);
  cabecera.write('WAVEfmt ', 8);
  cabecera.writeUInt32LE(16, 16);
  cabecera.writeUInt16LE(1, 20);
  cabecera.writeUInt16LE(1, 22);
  cabecera.writeUInt32LE(frecuencia, 24);
  cabecera.writeUInt32LE(frecuencia * 2, 28);
  cabecera.writeUInt16LE(2, 32);
  cabecera.writeUInt16LE(16, 34);
  cabecera.write('data', 36);
  cabecera.writeUInt32LE(datos.length, 40);
  return Buffer.concat([cabecera, datos]);
}

/** Simula el API Gateway (/api/v1) con datos fijos; todo lo no previsto responde 404. */
export const TOKEN_FALSO = 'token-falso';
export const CREDENCIALES = { username: 'dj', password: 'clave-de-prueba' };

/**
 * Con `conLogin` el API exige iniciar sesion como el de verdad: el login devuelve un token, las demas rutas
 * responden 401 sin el y el stream pide un ticket.
 */
export async function simularApi(page: Page, opciones: { pistas?: unknown[]; conLogin?: boolean } = {}): Promise<void> {
  // Copia: una subida simulada agrega pistas a la lista de ESTA prueba, no a la de las demas.
  const pistas = [...(opciones.pistas ?? PISTAS)];
  let siguienteId = 100;
  const grabaciones = GRABACIONES.map((g) => ({ ...g }));
  const wav = crearWav();

  await page.route('**/api/v1/**', async (route) => {
    const url = new URL(route.request().url());
    const metodo = route.request().method();
    const ruta = url.pathname.replace('/api/v1', '');
    // "*" no cubre la cabecera Authorization en un preflight: hay que nombrarla.
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, content-type' };

    if (metodo === 'OPTIONS') {
      return route.fulfill({ status: 204, headers: { ...cors, 'access-control-allow-methods': '*' } });
    }
    if (ruta === '/auth/status') {
      return route.fulfill({ json: { enabled: !!opciones.conLogin }, headers: cors });
    }
    if (opciones.conLogin) {
      if (ruta === '/auth/login' && metodo === 'POST') {
        const enviado = route.request().postDataJSON() as { username?: string; password?: string };
        return enviado.username === CREDENCIALES.username && enviado.password === CREDENCIALES.password
          ? route.fulfill({ json: { token: TOKEN_FALSO, expiresAt: '2999-01-01T00:00:00Z' }, headers: cors })
          : route.fulfill({ status: 401, json: { error: 'Usuario o contrasena incorrectos' }, headers: cors });
      }
      const esElStream = ruta === '/midi/stream' && url.searchParams.get('ticket') === 'ticket-falso';
      if (!esElStream && route.request().headers()['authorization'] !== `Bearer ${TOKEN_FALSO}`) {
        return route.fulfill({ status: 401, json: { error: 'No autorizado' }, headers: cors });
      }
      if (ruta === '/auth/stream-ticket' && metodo === 'POST') {
        return route.fulfill({ json: { ticket: 'ticket-falso', expiresAt: '2999-01-01T00:00:00Z' }, headers: cors });
      }
    }
    if (ruta === '/tracks' && metodo === 'GET') {
      return route.fulfill({ json: { tracks: pistas }, headers: cors });
    }
    if (ruta === '/recordings' && metodo === 'GET') {
      const filtro = url.searchParams.get('quality');
      const lista = filtro ? grabaciones.filter((g) => g.quality === filtro) : grabaciones;
      const contar = (calidad: string) => grabaciones.filter((g) => g.quality === calidad).length;
      return route.fulfill({
        json: {
          recordings: lista,
          counts: { unreviewed: contar('unreviewed'), good: contar('good'), discard: contar('discard'), total: grabaciones.length },
        },
        headers: cors,
      });
    }
    const revision = /^\/recordings\/(\d+)$/.exec(ruta);
    if (revision && metodo === 'PUT') {
      const grabacion = grabaciones.find((g) => g.id === Number(revision[1]));
      if (!grabacion) {
        return route.fulfill({ status: 404, json: { error: 'Grabacion no encontrada' }, headers: cors });
      }
      Object.assign(grabacion, route.request().postDataJSON());
      return route.fulfill({ json: grabacion, headers: cors });
    }
    if (ruta === '/tracks/analyze' && metodo === 'POST') {
      // Subida de una pista: el nombre del archivo va dentro del cuerpo multipart.
      const nombre = /filename="([^"]+)"/.exec(route.request().postData() ?? '')?.[1] ?? 'subida.wav';
      const nueva = {
        id: siguienteId++, title: nombre, duration: 2, bpm: 122, key: 'D minor', camelot: '7A',
        energy: 0.6, cuePoints: [0.5], hasAudio: true, createdAt: '2026-10-24T12:00:00Z',
      };
      pistas.unshift(nueva);
      return route.fulfill({ status: 201, json: nueva, headers: cors });
    }
    if (/^\/tracks\/\d+\/audio$/.test(ruta)) {
      return route.fulfill({ body: wav, contentType: 'audio/wav', headers: cors });
    }
    if (ruta === '/midi/logs') {
      return route.fulfill({ json: LOGS, headers: cors });
    }
    if (ruta === '/midi/stream') {
      return route.fulfill({ body: ': conectado\n\n', contentType: 'text/event-stream', headers: cors });
    }
    if (ruta === '/sessions/active') {
      return route.fulfill({ status: 404, json: {}, headers: cors });
    }
    if (ruta === '/autodj/weights') {
      return route.fulfill({ status: 404, json: {}, headers: cors });
    }
    return route.fulfill({ status: 404, json: { error: 'no simulado' }, headers: cors });
  });
}
