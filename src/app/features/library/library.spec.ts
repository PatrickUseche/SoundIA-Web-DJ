import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { LibraryComponent } from './library';
import { MixerService } from '../../core/services/mixer';
import { QueueService } from '../../core/services/queue';
import { Track } from '../../core/models/track';
import { FakeAudioBuffer, FakeAudioContext, provideFakeAudio } from '../../core/testing/fake-audio';
import { environment } from '../../../environments/environment';

const TRACKS = `${environment.apiRootUrl}/tracks`;

const pista = (cambios: Partial<Track> = {}): Track => ({
  id: 1, title: 'Tema uno', duration: 215, bpm: 127.98, key: 'C major', camelot: '8B', energy: 0.62,
  cuePoints: [0.4], hasAudio: true, createdAt: '2026-10-21T18:30:00+00:00', ...cambios,
});

describe('LibraryComponent', () => {
  let fixture: ComponentFixture<LibraryComponent>;
  let http: HttpTestingController;
  let mixer: MixerService;

  const el = () => fixture.nativeElement as HTMLElement;
  const texto = () => el().textContent ?? '';
  const filas = () => Array.from(el().querySelectorAll('tbody tr'));
  const botonEn = (fila: Element, nombre: string) =>
    Array.from(fila.querySelectorAll('button')).find((b) => b.textContent?.includes(nombre)) as HTMLButtonElement;

  // La logica de la cola se prueba en su propio spec: aqui solo se verifica que la biblioteca la use.
  const colaDoble = { enqueue: vi.fn(async () => true), error: vi.fn(() => null as string | null) };

  function crear(ctx: FakeAudioContext | null = new FakeAudioContext()) {
    colaDoble.enqueue.mockClear();
    colaDoble.enqueue.mockResolvedValue(true);
    colaDoble.error.mockReturnValue(null);
    TestBed.configureTestingModule({
      imports: [LibraryComponent],
      providers: [
        provideHttpClient(), provideHttpClientTesting(), provideFakeAudio(ctx),
        { provide: QueueService, useValue: colaDoble },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    mixer = TestBed.inject(MixerService);
    fixture = TestBed.createComponent(LibraryComponent);
    fixture.detectChanges();
  }

  const esperar = async () => {
    await fixture.whenStable();
    await new Promise((resolver) => setTimeout(resolver, 0));
    fixture.detectChanges();
  };

  const responderLista = async (tracks: Track[]) => {
    http.expectOne(TRACKS).flush({ tracks });
    await esperar();
  };

  afterEach(() => http?.verify());

  describe('listado', () => {
    it('muestra que esta cargando y luego el estado vacio', async () => {
      crear();
      expect(texto()).toContain('Cargando biblioteca');

      await responderLista([]);

      expect(texto()).toContain('Todavia no hay pistas');
    });

    it('muestra una fila por pista con BPM, tonalidad, Camelot y duracion', async () => {
      crear();
      await responderLista([pista(), pista({ id: 2, title: 'Tema dos', bpm: 100, camelot: '5A', key: 'A minor', duration: 65 })]);

      expect(filas().length).toBe(2);
      const primera = filas()[0].textContent ?? '';
      expect(primera).toContain('Tema uno');
      expect(primera).toContain('128.0');
      expect(primera).toContain('C major');
      expect(primera).toContain('8B');
      expect(primera).toContain('3:35');
      expect(filas()[1].textContent).toContain('1:05');
    });

    it('muestra la energia con un medidor accesible', async () => {
      crear();
      await responderLista([pista({ energy: 0.62 })]);

      const medidor = el().querySelector('meter') as HTMLMeterElement;
      expect(medidor.value).toBe(0.62);
      expect(medidor.getAttribute('aria-label')).toBe('Energia de Tema uno');
    });

    it('si falla la carga muestra el error del API', async () => {
      crear();
      http.expectOne(TRACKS).flush({ error: 'El motor de IA no esta disponible' }, { status: 502, statusText: 'Bad Gateway' });
      await esperar();

      expect(el().querySelector('.lista-error')?.textContent).toContain('El motor de IA no esta disponible');
    });

    it('Actualizar vuelve a pedir la lista', async () => {
      crear();
      await responderLista([pista()]);

      (Array.from(el().querySelectorAll('button')).find((b) => b.textContent?.includes('Actualizar')) as HTMLButtonElement).click();
      await responderLista([pista(), pista({ id: 2, title: 'Nueva' })]);

      expect(filas().length).toBe(2);
    });
  });

  describe('cargar en un deck', () => {
    it('descarga el audio y lo carga en el deck elegido', async () => {
      crear();
      await responderLista([pista({ id: 7 })]);

      botonEn(filas()[0], 'Deck B').click();
      http.expectOne(`${TRACKS}/7/audio`).flush(new Uint8Array([1, 2, 3]).buffer);
      await esperar();

      expect(mixer.deck('B').loaded).toBe(true);
      expect(mixer.deck('B').track()?.id).toBe(7);
      expect(mixer.deck('A').loaded).toBe(false);
    });

    it('mientras descarga deshabilita los botones y muestra Cargando', async () => {
      crear();
      await responderLista([pista({ id: 7 })]);

      botonEn(filas()[0], 'Deck A').click();
      fixture.detectChanges();

      expect(botonEn(filas()[0], 'Cargando').textContent).toContain('Cargando');
      expect(botonEn(filas()[0], 'Deck B').disabled).toBe(true);
      http.expectOne(`${TRACKS}/7/audio`).flush(new Uint8Array([1]).buffer);
      await esperar();
    });

    it('si falla la descarga muestra el error y rehabilita los botones', async () => {
      crear();
      await responderLista([pista({ id: 7 })]);

      botonEn(filas()[0], 'Deck A').click();
      // Un error de una descarga binaria llega como ArrayBuffer con el JSON dentro.
      const cuerpo = Uint8Array.from(Array.from('{"error":"La pista no tiene audio guardado."}').map((c) => c.charCodeAt(0))).buffer;
      http.expectOne(`${TRACKS}/7/audio`).flush(cuerpo, { status: 404, statusText: 'Not Found' });
      await esperar();

      expect(el().querySelector('.deck-error')?.textContent).toContain('La pista no tiene audio guardado.');
      expect(botonEn(filas()[0], 'Deck A').disabled).toBe(false);
    });

    it('una pista sin audio guardado no ofrece botones de carga y lo explica', async () => {
      crear();
      await responderLista([pista({ hasAudio: false })]);

      expect(botonEn(filas()[0], 'Deck A')).toBeUndefined();
      expect(filas()[0].querySelector('.sin-audio')).not.toBeNull();
    });

    it('sin Web Audio no ofrece botones de carga', async () => {
      crear(null);
      await responderLista([pista()]);

      expect(botonEn(filas()[0], 'Deck A')).toBeUndefined();
    });

    it('marca la pista que ya esta en un deck', async () => {
      crear();
      mixer.loadBuffer('A', new FakeAudioBuffer(5) as unknown as AudioBuffer, pista({ id: 1 }));
      await responderLista([pista({ id: 1 }), pista({ id: 2, title: 'Otra' })]);

      expect(filas()[0].classList.contains('en-deck')).toBe(true);
      expect(filas()[1].classList.contains('en-deck')).toBe(false);
    });
  });

  describe('agregar a la cola', () => {
    it('cada pista con audio tiene un boton A la cola', async () => {
      crear();
      await responderLista([pista({ id: 1 }), pista({ id: 2, title: 'Dos' })]);

      expect(botonEn(filas()[0], 'A la cola').disabled).toBe(false);
      expect(botonEn(filas()[1], 'A la cola').disabled).toBe(false);
    });

    it('el boton tiene una etiqueta accesible con el titulo', async () => {
      crear();
      await responderLista([pista({ title: 'Tema uno' })]);

      expect(botonEn(filas()[0], 'A la cola').getAttribute('aria-label')).toBe('Agregar Tema uno a la cola');
    });

    it('una pista sin audio no se puede encolar (el Auto-DJ no podria reproducirla)', async () => {
      crear();
      await responderLista([pista({ hasAudio: false })]);

      expect(botonEn(filas()[0], 'A la cola').disabled).toBe(true);
    });

    it('al pulsarlo agrega la pista a la cola y lo confirma', async () => {
      crear();
      await responderLista([pista({ id: 7, title: 'Tema siete' })]);

      botonEn(filas()[0], 'A la cola').click();
      await esperar();

      expect(colaDoble.enqueue).toHaveBeenCalledWith(7);
      expect(el().querySelector('.cola-ok')?.textContent).toContain('"Tema siete" agregada a la cola.');
      expect(el().querySelector('.cola-error')).toBeNull();
    });

    it('si no se pudo encolar muestra el motivo', async () => {
      crear();
      colaDoble.enqueue.mockResolvedValue(false);
      colaDoble.error.mockReturnValue('La cola de la sesion 5 esta llena (maximo 100).');
      await responderLista([pista({ id: 7 })]);

      botonEn(filas()[0], 'A la cola').click();
      await esperar();

      expect(el().querySelector('.cola-error')?.textContent).toContain('esta llena');
      expect(el().querySelector('.cola-ok')).toBeNull();
    });

    it('un aviso nuevo reemplaza al anterior', async () => {
      crear();
      await responderLista([pista({ id: 1, title: 'Uno' }), pista({ id: 2, title: 'Dos' })]);

      botonEn(filas()[0], 'A la cola').click();
      await esperar();
      botonEn(filas()[1], 'A la cola').click();
      await esperar();

      expect(el().querySelector('.cola-ok')?.textContent).toContain('"Dos"');
      expect(el().querySelector('.cola-ok')?.textContent).not.toContain('"Uno"');
    });
  });

  describe('compatibilidad armonica', () => {
    it('resalta las pistas que mezclan bien con la cargada en un deck', async () => {
      crear();
      mixer.loadBuffer('A', new FakeAudioBuffer(5) as unknown as AudioBuffer, pista({ id: 1, camelot: '8B' }));
      await responderLista([
        pista({ id: 1, camelot: '8B' }),
        pista({ id: 2, title: 'Vecina', camelot: '9B' }),
        pista({ id: 3, title: 'Relativa', camelot: '8A' }),
        pista({ id: 4, title: 'Lejana', camelot: '3A' }),
      ]);

      expect(filas()[1].classList.contains('compatible')).toBe(true);
      expect(filas()[2].classList.contains('compatible')).toBe(true);
      expect(filas()[3].classList.contains('compatible')).toBe(false);
      expect(filas()[1].textContent).toContain('compatible');
    });

    it('avisa mientras la voz de una pista se esta analizando', async () => {
      crear();
      await responderLista([
        pista({ id: 1, title: 'En cola', vocals: { status: 'pending', lastEnd: null } }),
        pista({ id: 2, title: 'Analizando', vocals: { status: 'running', lastEnd: null } }),
        pista({ id: 3, title: 'Lista', vocals: { status: 'done', lastEnd: 229.7 } }),
        pista({ id: 4, title: 'Sin modelo', vocals: { status: 'unavailable', lastEnd: null } }),
        pista({ id: 5, title: 'Antigua' }),
      ]);

      expect(filas()[0].querySelector('.analizando-voz')).not.toBeNull();
      expect(filas()[1].querySelector('.analizando-voz')).not.toBeNull();
      expect(filas()[2].querySelector('.analizando-voz')).toBeNull();
      expect(filas()[3].querySelector('.analizando-voz')).toBeNull();
      expect(filas()[4].querySelector('.analizando-voz')).toBeNull();
    });

    it('sin pistas cargadas no resalta nada', async () => {
      crear();
      await responderLista([pista({ camelot: '8B' }), pista({ id: 2, camelot: '9B' })]);

      expect(el().querySelectorAll('tr.compatible').length).toBe(0);
    });

    it('la pista que ya esta en el deck no se etiqueta como compatible consigo misma', async () => {
      crear();
      mixer.loadBuffer('A', new FakeAudioBuffer(5) as unknown as AudioBuffer, pista({ id: 1, camelot: '8B' }));
      await responderLista([pista({ id: 1, camelot: '8B' })]);

      expect(filas()[0].querySelector('.etiqueta-compatible')).toBeNull();
    });
  });

  describe('subir una pista', () => {
    const elegir = (archivo: File) => {
      const input = el().querySelector('input[type="file"]') as HTMLInputElement;
      Object.defineProperty(input, 'files', { value: [archivo], configurable: true });
      input.dispatchEvent(new Event('change'));
    };

    it('analiza el archivo, lo agrega al principio de la lista y muestra el resultado', async () => {
      crear();
      await responderLista([pista({ id: 1 })]);

      elegir(new File(['RIFFdatos'], 'nueva.wav', { type: 'audio/wav' }));
      fixture.detectChanges();
      expect(texto()).toContain('Analizando la pista');
      http.expectOne(`${TRACKS}/analyze`).flush(pista({ id: 9, title: 'nueva.wav', bpm: 124, camelot: '5A', key: 'A minor' }));
      await esperar();

      expect(filas().length).toBe(2);
      expect(filas()[0].textContent).toContain('nueva.wav');
      expect(el().querySelector('.subida-ok')?.textContent).toContain('124.0 BPM');
      expect(el().querySelector('.subida-ok')?.textContent).toContain('5A');
    });

    it('envia el archivo elegido como multipart', async () => {
      crear();
      await responderLista([]);

      elegir(new File(['x'], 'mi_tema.mp3'));
      const req = http.expectOne(`${TRACKS}/analyze`);

      expect(((req.request.body as FormData).get('file') as File).name).toBe('mi_tema.mp3');
      req.flush(pista());
      await esperar();
    });

    it('si el servidor rechaza el archivo muestra su mensaje', async () => {
      crear();
      await responderLista([]);

      elegir(new File(['x'], 'silencio.wav'));
      http.expectOne(`${TRACKS}/analyze`).flush({ error: 'El audio es silencio; no hay nada que analizar.' }, { status: 422, statusText: 'Unprocessable' });
      await esperar();

      expect(el().querySelector('.subida-error')?.textContent).toContain('El audio es silencio');
      expect(texto()).not.toContain('Analizando la pista');
    });

    it('no analiza nada si se cancela la seleccion', async () => {
      crear();
      await responderLista([]);
      const input = el().querySelector('input[type="file"]') as HTMLInputElement;
      Object.defineProperty(input, 'files', { value: [], configurable: true });

      input.dispatchEvent(new Event('change'));

      http.expectNone(`${TRACKS}/analyze`);
    });

    it('si el archivo ya estaba analizado reemplaza la fila en lugar de duplicarla', async () => {
      crear();
      await responderLista([pista({ id: 5, title: 'Vieja' })]);

      elegir(new File(['x'], 'a.wav'));
      http.expectOne(`${TRACKS}/analyze`).flush(pista({ id: 5, title: 'Actualizada' }));
      await esperar();

      expect(filas().length).toBe(1);
      expect(filas()[0].textContent).toContain('Actualizada');
    });
  });
});
