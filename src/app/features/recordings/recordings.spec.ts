import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { RecordingsComponent } from './recordings';
import { RecordingList, RecordingSummary } from '../../core/models/recording';
import { Track } from '../../core/models/track';
import { environment } from '../../../environments/environment';

const RECORDINGS = `${environment.apiRootUrl}/recordings`;
const TRACKS = `${environment.apiRootUrl}/tracks`;
const STYLE_MODEL = `${environment.apiRootUrl}/autodj/style-model`;
const MODELO = { goodRecordings: 0, required: 20, ready: false, enabled: false };

const grabacion = (cambios: Partial<RecordingSummary> = {}): RecordingSummary => ({
  id: 1, fromTrackId: 10, toTrackId: 11, source: 'manual', dj: 'dj', mixOutAt: 200, mixInAt: 0.5, overlapSeconds: 32,
  genreA: 'salsa', genreB: 'salsa', quality: 'unreviewed', notes: '', createdAt: '2026-10-24T20:30:00+00:00',
  features: { overlapBars: 16, crossfaderShape: 'gradual', bassSwapAt: 0.5, phaseErrorMs: 12.4 },
  ...cambios,
});

const lista = (recordings: RecordingSummary[], counts = { unreviewed: recordings.length, good: 0, discard: 0 }): RecordingList => ({
  recordings,
  counts: { ...counts, total: counts.unreviewed + counts.good + counts.discard },
});

const pista = (id: number, title: string): Track => ({
  id, title, duration: 200, bpm: 120, key: 'C major', camelot: '8B', energy: 0.5, cuePoints: [], hasAudio: true,
  createdAt: '2026-10-20T10:00:00Z',
});

describe('RecordingsComponent', () => {
  let fixture: ComponentFixture<RecordingsComponent>;
  let http: HttpTestingController;

  const el = () => fixture.nativeElement as HTMLElement;
  const texto = () => el().textContent ?? '';
  const filas = () => Array.from(el().querySelectorAll('tbody tr'));
  const boton = (dentro: Element | HTMLElement, nombre: string) =>
    Array.from(dentro.querySelectorAll('button')).find((b) => b.textContent?.trim() === nombre) as HTMLButtonElement;

  const esperar = async () => {
    await fixture.whenStable();
    fixture.detectChanges();
  };

  /** Crea el componente y responde a la lista de grabaciones y a la de pistas. */
  async function crear(datos: RecordingList, pistas: Track[] = [pista(10, 'Salsa uno'), pista(11, 'Salsa dos')]) {
    TestBed.configureTestingModule({ imports: [RecordingsComponent], providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(RecordingsComponent);
    fixture.detectChanges();
    http.expectOne(RECORDINGS).flush(datos);
    http.expectOne(TRACKS).flush({ tracks: pistas });
    http.expectOne(STYLE_MODEL).flush(MODELO);
    await esperar();
  }

  afterEach(() => http?.verify());

  describe('lista', () => {
    it('muestra que esta cargando y luego el estado vacio con una pista de que hacer', async () => {
      TestBed.configureTestingModule({ imports: [RecordingsComponent], providers: [provideHttpClient(), provideHttpClientTesting()] });
      http = TestBed.inject(HttpTestingController);
      fixture = TestBed.createComponent(RecordingsComponent);
      fixture.detectChanges();
      expect(texto()).toContain('Cargando grabaciones');

      http.expectOne(RECORDINGS).flush(lista([]));
      http.expectOne(TRACKS).flush({ tracks: [] });
      http.expectOne(STYLE_MODEL).flush(MODELO);
      await esperar();

      expect(texto()).toContain('Todavía no hay grabaciones');
      expect(texto()).toContain('modo aprendizaje');
    });

    it('muestra el resumen por calidad', async () => {
      await crear(lista([grabacion()], { unreviewed: 3, good: 2, discard: 1 }));

      expect(el().querySelector('.resumen')?.textContent).toContain('Total: 6');
      expect(el().querySelector('.resumen')?.textContent).toContain('Sin revisar: 3');
      expect(el().querySelector('.resumen')?.textContent).toContain('Buenas: 2');
      expect(el().querySelector('.resumen')?.textContent).toContain('Descartadas: 1');
    });

    it('cada fila dice de que pista a cual fue, su genero y sus rasgos', async () => {
      await crear(lista([grabacion()]));

      const fila = filas()[0].textContent ?? '';
      expect(fila).toContain('Salsa uno → Salsa dos');
      expect(fila).toContain('salsa');
      expect(fila).toContain('16 compases');
      expect(fila).toContain('Gradual');
      expect(fila).toContain('50 %');
      expect(fila).toContain('12 ms');
    });

    it('si una pista ya se borro lo dice y si no se conoce el titulo muestra su numero', async () => {
      await crear(lista([grabacion({ fromTrackId: null, toTrackId: 99 })]), []);

      expect(filas()[0].textContent).toContain('(pista borrada) → pista 99');
    });

    it('con dos generos distintos muestra de uno a otro', async () => {
      await crear(lista([grabacion({ genreA: 'salsa', genreB: 'merengue' })]));

      expect(filas()[0].textContent).toContain('salsa → merengue');
    });

    it('marca las que hizo el Auto-DJ', async () => {
      await crear(lista([grabacion({ source: 'autodj' })]));

      expect(el().querySelector('.etiqueta-autodj')).not.toBeNull();
    });

    it('si falla la carga muestra el motivo', async () => {
      TestBed.configureTestingModule({ imports: [RecordingsComponent], providers: [provideHttpClient(), provideHttpClientTesting()] });
      http = TestBed.inject(HttpTestingController);
      fixture = TestBed.createComponent(RecordingsComponent);
      fixture.detectChanges();

      http.expectOne(RECORDINGS).flush({ error: 'El motor de IA no esta disponible' }, { status: 502, statusText: 'Bad Gateway' });
      http.expectOne(TRACKS).flush({ tracks: [] });
      http.expectOne(STYLE_MODEL).flush(MODELO);
      await esperar();

      expect(el().querySelector('.lista-error')?.textContent).toContain('El motor de IA no esta disponible');
    });
  });

  describe('filtros', () => {
    it('pedir un filtro vuelve a cargar con esa calidad', async () => {
      await crear(lista([grabacion()], { unreviewed: 1, good: 1, discard: 0 }));

      boton(el(), 'Buenas').click();
      const req = http.expectOne((r) => r.url === RECORDINGS);
      expect(req.request.params.get('quality')).toBe('good');
      req.flush(lista([grabacion({ id: 2, quality: 'good' })], { unreviewed: 1, good: 1, discard: 0 }));
      http.expectOne(TRACKS).flush({ tracks: [] });
      await esperar();

      expect(boton(el(), 'Buenas').getAttribute('aria-pressed')).toBe('true');
      expect(boton(el(), 'Todas').getAttribute('aria-pressed')).toBe('false');
      expect(filas().length).toBe(1);
    });

    it('si el filtro no deja ninguna lo dice distinto a cuando no hay ninguna', async () => {
      await crear(lista([grabacion()], { unreviewed: 1, good: 0, discard: 0 }));

      boton(el(), 'Descartadas').click();
      http.expectOne((r) => r.url === RECORDINGS).flush(lista([], { unreviewed: 1, good: 0, discard: 0 }));
      http.expectOne(TRACKS).flush({ tracks: [] });
      await esperar();

      expect(texto()).toContain('Ninguna grabación coincide con el filtro');
    });
  });

  describe('revision', () => {
    it('Buena marca la grabacion, actualiza el resumen y deja el boton pulsado', async () => {
      await crear(lista([grabacion({ id: 4 })], { unreviewed: 2, good: 0, discard: 0 }));

      boton(filas()[0], 'Buena').click();
      const req = http.expectOne(`${RECORDINGS}/4`);
      expect(req.request.method).toBe('PUT');
      expect(req.request.body).toEqual({ quality: 'good' });
      req.flush(grabacion({ id: 4, quality: 'good' }));
      // Ahora hay una buena mas: el modelo de estilo se vuelve a consultar.
      http.expectOne(STYLE_MODEL).flush({ ...MODELO, goodRecordings: 1 });
      await esperar();

      expect(boton(filas()[0], 'Buena').getAttribute('aria-pressed')).toBe('true');
      expect(texto()).toContain('1 de 20 necesarias');
      expect(filas()[0].getAttribute('data-calidad')).toBe('good');
      expect(el().querySelector('.resumen')?.textContent).toContain('Sin revisar: 1');
      expect(el().querySelector('.resumen')?.textContent).toContain('Buenas: 1');
    });

    it('Descartar la marca como descartada', async () => {
      await crear(lista([grabacion({ id: 4 })]));

      boton(filas()[0], 'Descartar').click();
      const req = http.expectOne(`${RECORDINGS}/4`);
      expect(req.request.body).toEqual({ quality: 'discard' });
      req.flush(grabacion({ id: 4, quality: 'discard' }));
      await esperar();

      expect(filas()[0].getAttribute('data-calidad')).toBe('discard');
    });

    it('pulsar la calidad que ya tiene no llama al API', async () => {
      await crear(lista([grabacion({ id: 4, quality: 'good' })], { unreviewed: 0, good: 1, discard: 0 }));

      boton(filas()[0], 'Buena').click();

      http.expectNone(`${RECORDINGS}/4`);
    });

    it('con un filtro puesto, la que cambia de calidad sale de la lista', async () => {
      await crear(lista([grabacion({ id: 4 })]));
      boton(el(), 'Sin revisar').click();
      http.expectOne((r) => r.url === RECORDINGS).flush(lista([grabacion({ id: 4 })]));
      http.expectOne(TRACKS).flush({ tracks: [] });
      await esperar();

      boton(filas()[0], 'Buena').click();
      http.expectOne(`${RECORDINGS}/4`).flush(grabacion({ id: 4, quality: 'good' }));
      http.expectOne(STYLE_MODEL).flush(MODELO);
      await esperar();

      expect(filas().length).toBe(0);
    });

    it('si falla la revision muestra el motivo y no cambia nada', async () => {
      await crear(lista([grabacion({ id: 4 })]));

      boton(filas()[0], 'Buena').click();
      http.expectOne(`${RECORDINGS}/4`).flush({ error: 'Grabacion no encontrada' }, { status: 404, statusText: 'Not Found' });
      await esperar();

      expect(el().querySelector('.grabaciones-error')?.textContent).toContain('Grabacion no encontrada');
      expect(filas()[0].getAttribute('data-calidad')).toBe('unreviewed');
    });

    it('las notas se guardan al salir del campo', async () => {
      await crear(lista([grabacion({ id: 4 })]));
      const campo = filas()[0].querySelector('input.notas') as HTMLInputElement;

      campo.value = '  entro tarde  ';
      campo.dispatchEvent(new Event('change'));
      const req = http.expectOne(`${RECORDINGS}/4`);
      expect(req.request.body).toEqual({ notes: 'entro tarde' });
      req.flush(grabacion({ id: 4, notes: 'entro tarde' }));
      await esperar();

      expect((filas()[0].querySelector('input.notas') as HTMLInputElement).value).toBe('entro tarde');
    });

    it('si las notas no cambiaron no llama al API', async () => {
      await crear(lista([grabacion({ id: 4, notes: 'igual' })]));
      const campo = filas()[0].querySelector('input.notas') as HTMLInputElement;

      campo.dispatchEvent(new Event('change'));

      http.expectNone(`${RECORDINGS}/4`);
    });
  });

  describe('borrar', () => {
    it('pide confirmacion y no borra hasta que se acepta', async () => {
      await crear(lista([grabacion({ id: 4 })]));

      boton(filas()[0], 'Borrar').click();
      await esperar();

      expect(texto()).toContain('¿Seguro?');
      http.expectNone(`${RECORDINGS}/4`);
    });

    it('al confirmar la borra, actualiza el resumen y lo avisa', async () => {
      await crear(lista([grabacion({ id: 4 })], { unreviewed: 1, good: 0, discard: 0 }));
      boton(filas()[0], 'Borrar').click();
      await esperar();

      boton(filas()[0], 'Si, borrar').click();
      const req = http.expectOne(`${RECORDINGS}/4`);
      expect(req.request.method).toBe('DELETE');
      req.flush(null, { status: 204, statusText: 'No Content' });
      await esperar();

      expect(filas().length).toBe(0);
      expect(el().querySelector('.resumen')?.textContent).toContain('Total: 0');
      expect(el().querySelector('.grabaciones-ok')?.textContent).toContain('Grabación borrada');
    });

    it('con No se queda como estaba', async () => {
      await crear(lista([grabacion({ id: 4 })]));
      boton(filas()[0], 'Borrar').click();
      await esperar();

      boton(filas()[0], 'No').click();
      await esperar();

      expect(filas().length).toBe(1);
      expect(texto()).not.toContain('¿Seguro?');
    });
  });

  describe('copia de seguridad', () => {
    it('Descargar copia queda desactivado si no hay grabaciones', async () => {
      await crear(lista([]));

      expect(boton(el(), 'Descargar copia').disabled).toBe(true);
    });

    it('Descargar copia baja el archivo con el token y lo guarda', async () => {
      await crear(lista([grabacion()]));
      const crearUrl = vi.fn(() => 'blob:copia');
      const revocarUrl = vi.fn();
      vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: crearUrl, revokeObjectURL: revocarUrl }));
      const clic = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);

      boton(el(), 'Descargar copia').click();
      const req = http.expectOne(`${RECORDINGS}/export`);
      expect(req.request.responseType).toBe('blob');
      req.flush(new Blob(['{}']));
      await esperar();

      expect(crearUrl).toHaveBeenCalled();
      expect(clic).toHaveBeenCalled();
      expect(revocarUrl).toHaveBeenCalledWith('blob:copia');
      expect(el().querySelector('.grabaciones-ok')?.textContent).toContain('Copia descargada');
      clic.mockRestore();
      vi.unstubAllGlobals();
    });

    it('si falla la descarga muestra el motivo', async () => {
      await crear(lista([grabacion()]));

      boton(el(), 'Descargar copia').click();
      http.expectOne(`${RECORDINGS}/export`).flush(new Blob(['x']), { status: 502, statusText: 'Bad Gateway' });
      await esperar();

      expect(el().querySelector('.grabaciones-error')).not.toBeNull();
    });

    const elegirArchivo = async (contenido: string) => {
      const input = el().querySelector('input[type="file"]') as HTMLInputElement;
      const archivo = new File([contenido], 'copia.json', { type: 'application/json' });
      Object.defineProperty(input, 'files', { value: [archivo], configurable: true });
      input.dispatchEvent(new Event('change'));
      await new Promise((resolver) => setTimeout(resolver, 0));
      await fixture.whenStable();
    };

    it('Restaurar envia la copia, avisa cuantas entraron y vuelve a cargar la lista', async () => {
      await crear(lista([]));

      await elegirArchivo('{"format":"soundia-recordings","version":1,"recordings":[]}');
      const req = http.expectOne(`${RECORDINGS}/import`);
      expect(req.request.body).toEqual({ format: 'soundia-recordings', version: 1, recordings: [] });
      req.flush({ created: 3, skipped: 1 });
      await new Promise((resolver) => setTimeout(resolver, 0));
      http.expectOne(RECORDINGS).flush(lista([grabacion()]));
      http.expectOne(TRACKS).flush({ tracks: [] });
      await esperar();

      expect(el().querySelector('.grabaciones-ok')?.textContent).toContain('3 grabaciones restauradas; 1 ya estaban');
      expect(filas().length).toBe(1);
    });

    it('un archivo que no es JSON se rechaza sin llamar al API', async () => {
      await crear(lista([]));

      await elegirArchivo('esto no es json');
      fixture.detectChanges();

      http.expectNone(`${RECORDINGS}/import`);
      expect(el().querySelector('.grabaciones-error')?.textContent).toContain('no es un JSON válido');
    });

    it('si el motor rechaza la copia muestra su mensaje', async () => {
      await crear(lista([]));

      await elegirArchivo('{"format":"otra"}');
      http.expectOne(`${RECORDINGS}/import`).flush({ error: 'El archivo no es una copia de grabaciones de SoundIA.' }, { status: 400, statusText: 'Bad Request' });
      await new Promise((resolver) => setTimeout(resolver, 0));
      fixture.detectChanges();

      expect(el().querySelector('.grabaciones-error')?.textContent).toContain('no es una copia de grabaciones');
    });
  });
});
