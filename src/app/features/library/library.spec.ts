import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { LibraryComponent, REFRESCO_VOZ_MS } from './library';
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
  const colaDoble = {
    enqueue: vi.fn(async () => true),
    error: vi.fn(() => null as string | null),
    refresh: vi.fn(async () => undefined),
  };

  function crear(ctx: FakeAudioContext | null = new FakeAudioContext()) {
    colaDoble.enqueue.mockClear();
    colaDoble.refresh.mockClear();
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

  describe('buscar y ordenar', () => {
    const titulos = () => filas().map((f) => f.querySelector('td')?.childNodes[0]?.textContent?.trim());
    const escribir = async (texto: string) => {
      const caja = el().querySelector('input[aria-label="Buscar pista"]') as HTMLInputElement;
      caja.value = texto;
      caja.dispatchEvent(new Event('input'));
      await esperar();
    };
    const ordenar = async (valor: string) => {
      const select = el().querySelector('select[aria-label="Ordenar pistas"]') as HTMLSelectElement;
      select.value = valor;
      select.dispatchEvent(new Event('change'));
      await esperar();
    };
    const tres = () => [
      pista({ id: 1, title: 'Cumbia', bpm: 100, camelot: '8B' }),
      pista({ id: 2, title: 'Bachata', bpm: 130, camelot: '2A' }),
      pista({ id: 3, title: 'Salsa', bpm: 115, camelot: '8A' }),
    ];

    it('sin lista no muestra los filtros', async () => {
      crear();
      await responderLista([]);

      expect(el().querySelector('[role="search"]')).toBeNull();
    });

    it('por defecto respeta el orden del API (mas recientes primero)', async () => {
      crear();
      await responderLista(tres());

      expect(titulos()).toEqual(['Cumbia', 'Bachata', 'Salsa']);
    });

    it('busca por el titulo sin distinguir mayusculas', async () => {
      crear();
      await responderLista(tres());

      await escribir('ACH');

      expect(titulos()).toEqual(['Bachata']);
    });

    it('si nada coincide lo dice', async () => {
      crear();
      await responderLista(tres());

      await escribir('zzz');

      expect(filas().length).toBe(0);
      expect(texto()).toContain('Ninguna pista coincide con el filtro');
    });

    it('ordena por BPM de menor a mayor y de mayor a menor', async () => {
      crear();
      await responderLista(tres());

      await ordenar('bpm-asc');
      expect(titulos()).toEqual(['Cumbia', 'Salsa', 'Bachata']);

      await ordenar('bpm-desc');
      expect(titulos()).toEqual(['Bachata', 'Salsa', 'Cumbia']);
    });

    it('ordena por tonalidad segun la rueda Camelot (2A, 8A, 8B)', async () => {
      crear();
      await responderLista(tres());

      await ordenar('camelot');

      expect(titulos()).toEqual(['Bachata', 'Salsa', 'Cumbia']);
    });

    it('ordena por titulo', async () => {
      crear();
      await responderLista(tres());

      await ordenar('titulo');

      expect(titulos()).toEqual(['Bachata', 'Cumbia', 'Salsa']);
    });

    it('buscar y ordenar se combinan', async () => {
      crear();
      await responderLista(tres());

      await escribir('a');
      await ordenar('bpm-desc');

      expect(titulos()).toEqual(['Bachata', 'Salsa', 'Cumbia']);
    });

    it('solo compatibles esta desactivado mientras no haya una pista en un deck', async () => {
      crear();
      await responderLista(tres());

      const caja = el().querySelector('input[aria-label="Solo compatibles"]') as HTMLInputElement;

      expect(caja.disabled).toBe(true);
    });

    it('con una pista en un deck, solo compatibles deja las que mezclan bien con ella', async () => {
      crear();
      await responderLista([pista({ id: 1, title: 'Cargada', camelot: '8A' }), ...tres().slice(1)]);
      botonEn(filas()[0], 'Deck A').click();
      http.expectOne(`${TRACKS}/1/audio`).flush(new Uint8Array([1, 2, 3]).buffer);
      await esperar();

      const caja = el().querySelector('input[aria-label="Solo compatibles"]') as HTMLInputElement;
      expect(caja.disabled).toBe(false);
      caja.checked = true;
      caja.dispatchEvent(new Event('change'));
      await esperar();

      // 8A es compatible con 8A (la propia), 8B (mismo numero) y 7A/9A; Bachata (2A) no, Salsa (8A) si.
      expect(titulos()).toEqual(['Cargada', 'Salsa']);
    });
  });

  describe('genero de la pista', () => {
    const campo = (fila: Element) => fila.querySelector('input.genero') as HTMLInputElement;
    const escribir = async (fila: Element, valor: string) => {
      const input = campo(fila);
      input.value = valor;
      input.dispatchEvent(new Event('change'));
      await esperar();
    };

    it('cada pista tiene su campo de genero, con una etiqueta accesible y sugerencias', async () => {
      crear();
      await responderLista([pista({ id: 1, title: 'Tema uno', genre: 'salsa' })]);

      expect(campo(filas()[0]).value).toBe('salsa');
      expect(campo(filas()[0]).getAttribute('aria-label')).toBe('Genero de Tema uno');
      expect(el().querySelectorAll('#generos-sugeridos option').length).toBeGreaterThan(4);
    });

    it('una pista sin genero deja el campo vacio', async () => {
      crear();
      await responderLista([pista({ id: 1 })]);

      expect(campo(filas()[0]).value).toBe('');
    });

    it('al cambiarlo lo guarda en el API y actualiza la fila', async () => {
      crear();
      await responderLista([pista({ id: 7 })]);

      await escribir(filas()[0], '  Bachata ');
      const req = http.expectOne(`${TRACKS}/7`);
      expect(req.request.method).toBe('PUT');
      expect(req.request.body).toEqual({ genre: 'bachata' });
      req.flush(pista({ id: 7, genre: 'bachata' }));
      await esperar();

      expect(campo(filas()[0]).value).toBe('bachata');
    });

    it('un genero vacio lo quita', async () => {
      crear();
      await responderLista([pista({ id: 7, genre: 'salsa' })]);

      await escribir(filas()[0], '');
      const req = http.expectOne(`${TRACKS}/7`);
      expect(req.request.body).toEqual({ genre: '' });
      req.flush(pista({ id: 7, genre: '' }));
      await esperar();

      expect(campo(filas()[0]).value).toBe('');
    });

    it('si no cambia nada no llama al API', async () => {
      crear();
      await responderLista([pista({ id: 7, genre: 'salsa' })]);

      await escribir(filas()[0], ' SALSA ');

      http.expectNone(`${TRACKS}/7`);
    });

    it('si falla vuelve al genero anterior y explica el motivo', async () => {
      crear();
      await responderLista([pista({ id: 7, title: 'Tema siete', genre: 'salsa' })]);

      await escribir(filas()[0], 'merengue');
      http.expectOne(`${TRACKS}/7`).flush({ error: "'genre' no puede pasar de 40 caracteres." }, { status: 400, statusText: 'Bad Request' });
      await esperar();

      expect(campo(filas()[0]).value).toBe('salsa');
      expect(el().querySelector('.genero-error')?.textContent).toContain('no puede pasar de 40');
    });

    it('la busqueda tambien encuentra por genero', async () => {
      crear();
      await responderLista([
        pista({ id: 1, title: 'Uno', genre: 'salsa' }),
        pista({ id: 2, title: 'Dos', genre: 'bachata' }),
      ]);
      const caja = el().querySelector('input[aria-label="Buscar pista"]') as HTMLInputElement;

      caja.value = 'bach';
      caja.dispatchEvent(new Event('input'));
      await esperar();

      expect(filas().length).toBe(1);
      expect(filas()[0].textContent).toContain('Dos');
    });

    it('ordenar por genero deja al final las pistas sin genero', async () => {
      crear();
      await responderLista([
        pista({ id: 1, title: 'Sin', genre: '' }),
        pista({ id: 2, title: 'Salsera', genre: 'salsa' }),
        pista({ id: 3, title: 'Bachatera', genre: 'bachata' }),
      ]);
      const select = el().querySelector('select[aria-label="Ordenar pistas"]') as HTMLSelectElement;

      select.value = 'genero';
      select.dispatchEvent(new Event('change'));
      await esperar();

      expect(filas().map((f) => f.querySelector('td')?.childNodes[0]?.textContent?.trim())).toEqual(['Bachatera', 'Salsera', 'Sin']);
    });
  });

  describe('borrar una pista', () => {
    const confirmar = async () => {
      botonEn(filas()[0], 'Si, borrar').click();
      await esperar();
    };

    it('cada pista tiene un boton Borrar con una etiqueta accesible', async () => {
      crear();
      await responderLista([pista({ title: 'Tema uno' })]);

      expect(botonEn(filas()[0], 'Borrar').getAttribute('aria-label')).toBe('Borrar Tema uno');
    });

    it('al pulsarlo pide confirmacion y todavia no borra nada', async () => {
      crear();
      await responderLista([pista({ id: 7 })]);

      botonEn(filas()[0], 'Borrar').click();
      await esperar();

      expect(texto()).toContain('Borrar tambien su audio');
      http.expectNone(`${TRACKS}/7`);
    });

    it('si se responde que no, la pista se queda y vuelve el boton', async () => {
      crear();
      await responderLista([pista({ id: 7 })]);
      botonEn(filas()[0], 'Borrar').click();
      await esperar();

      botonEn(filas()[0], 'No').click();
      await esperar();

      expect(texto()).not.toContain('Borrar tambien su audio');
      expect(filas().length).toBe(1);
      expect(botonEn(filas()[0], 'Borrar')).toBeTruthy();
    });

    it('al confirmar borra la pista en el API, la quita de la lista y lo avisa', async () => {
      crear();
      await responderLista([pista({ id: 7, title: 'Tema siete' }), pista({ id: 8, title: 'Tema ocho' })]);
      botonEn(filas()[0], 'Borrar').click();
      await esperar();

      await confirmar();
      const peticion = http.expectOne(`${TRACKS}/7`);
      expect(peticion.request.method).toBe('DELETE');
      peticion.flush(null, { status: 204, statusText: 'No Content' });
      await esperar();

      expect(filas().length).toBe(1);
      expect(filas()[0].textContent).toContain('Tema ocho');
      expect(el().querySelector('.borrado-ok')?.textContent).toContain('"Tema siete" borrada.');
    });

    it('al borrar vuelve a leer la cola, porque el API quita la pista de ella', async () => {
      crear();
      await responderLista([pista({ id: 7 })]);
      botonEn(filas()[0], 'Borrar').click();
      await esperar();

      await confirmar();
      http.expectOne(`${TRACKS}/7`).flush(null, { status: 204, statusText: 'No Content' });
      await esperar();

      expect(colaDoble.refresh).toHaveBeenCalledTimes(1);
    });

    it('mientras borra muestra Borrando y bloquea los demas botones Borrar', async () => {
      crear();
      await responderLista([pista({ id: 7 }), pista({ id: 8, title: 'Tema ocho' })]);
      botonEn(filas()[0], 'Borrar').click();
      await esperar();

      await confirmar();

      expect(botonEn(filas()[0], 'Borrando').textContent).toContain('Borrando');
      expect(botonEn(filas()[1], 'Borrar').disabled).toBe(true);
      http.expectOne(`${TRACKS}/7`).flush(null, { status: 204, statusText: 'No Content' });
      await esperar();
    });

    it('si falla muestra el motivo y la pista se conserva', async () => {
      crear();
      await responderLista([pista({ id: 7, title: 'Tema siete' })]);
      botonEn(filas()[0], 'Borrar').click();
      await esperar();

      await confirmar();
      http.expectOne(`${TRACKS}/7`).flush({ error: 'El motor de IA no esta disponible' }, { status: 502, statusText: 'Bad Gateway' });
      await esperar();

      expect(el().querySelector('.borrado-error')?.textContent).toContain('El motor de IA no esta disponible');
      expect(filas().length).toBe(1);
      expect(colaDoble.refresh).not.toHaveBeenCalled();
    });

    it('una pista cargada en un deck no se puede borrar', async () => {
      crear();
      await responderLista([pista({ id: 7 })]);
      botonEn(filas()[0], 'Deck A').click();
      http.expectOne(`${TRACKS}/7/audio`).flush(new Uint8Array([1, 2, 3]).buffer);
      await esperar();

      const boton = botonEn(filas()[0], 'Borrar');

      expect(boton.disabled).toBe(true);
      expect(boton.getAttribute('title')).toContain('Descarga la pista del deck');
    });

    it('un aviso de borrado nuevo reemplaza al anterior', async () => {
      crear();
      await responderLista([pista({ id: 7, title: 'Uno' }), pista({ id: 8, title: 'Dos' })]);
      botonEn(filas()[0], 'Borrar').click();
      await esperar();
      await confirmar();
      http.expectOne(`${TRACKS}/7`).flush(null, { status: 204, statusText: 'No Content' });
      await esperar();

      botonEn(filas()[0], 'Borrar').click();
      await esperar();

      expect(el().querySelector('.borrado-ok')).toBeNull();
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

  describe('en que deck esta cada pista', () => {
    const etiqueta = (fila: Element) => fila.querySelector('.etiqueta-deck');

    it('una pista que no esta en ningun deck no lleva etiqueta', async () => {
      crear();
      await responderLista([pista({ id: 1 })]);

      expect(etiqueta(filas()[0])).toBeNull();
    });

    it('una pista cargada en el deck A y otra en el B llevan su etiqueta con el nombre del deck', async () => {
      crear();
      await responderLista([pista({ id: 1, title: 'Uno' }), pista({ id: 2, title: 'Dos' })]);

      botonEn(filas()[0], 'Deck A').click();
      http.expectOne(`${TRACKS}/1/audio`).flush(new Uint8Array([1, 2, 3]).buffer);
      await esperar();
      botonEn(filas()[1], 'Deck B').click();
      http.expectOne(`${TRACKS}/2/audio`).flush(new Uint8Array([1, 2, 3]).buffer);
      await esperar();

      expect(etiqueta(filas()[0])?.textContent?.trim()).toBe('Deck A');
      expect(etiqueta(filas()[0])?.getAttribute('data-deck')).toBe('A');
      expect(etiqueta(filas()[1])?.textContent?.trim()).toBe('Deck B');
      expect(etiqueta(filas()[1])?.getAttribute('data-deck')).toBe('B');
    });

    it('al expulsar la pista del deck la etiqueta desaparece', async () => {
      crear();
      await responderLista([pista({ id: 1 })]);
      botonEn(filas()[0], 'Deck A').click();
      http.expectOne(`${TRACKS}/1/audio`).flush(new Uint8Array([1, 2, 3]).buffer);
      await esperar();
      expect(etiqueta(filas()[0])).not.toBeNull();

      mixer.deck('A').eject();
      await esperar();

      expect(etiqueta(filas()[0])).toBeNull();
    });
  });

  describe('subir varias pistas', () => {
    const elegirVarios = (archivos: File[]) => {
      const input = el().querySelector('input[type="file"]') as HTMLInputElement;
      Object.defineProperty(input, 'files', { value: archivos, configurable: true });
      input.dispatchEvent(new Event('change'));
    };
    const archivo = (nombre: string) => new File(['x'], nombre, { type: 'audio/mpeg' });
    /** Responde a la subida en curso y deja que arranque la siguiente. */
    const responder = async (cuerpo: Track | { error: string }, status = 200) => {
      const req = http.expectOne(`${TRACKS}/analyze`);
      if (status === 200) {
        req.flush(cuerpo);
      } else {
        req.flush(cuerpo, { status, statusText: 'Error' });
      }
      await esperar();
    };

    it('un archivo de mas de 20 MB avisa de que el servidor gratuito puede no aguantarlo, pero lo intenta', async () => {
      crear();
      await responderLista([]);
      const grande = archivo('pesado.wav');
      Object.defineProperty(grande, 'size', { value: 30 * 1024 * 1024 });

      elegirVarios([grande]);
      fixture.detectChanges();

      expect(el().querySelector('.subida-avisos')?.textContent).toContain('pesado.wav pesa 30 MB');
      await responder(pista({ id: 1, title: 'pesado.wav' }));
      expect(el().querySelector('.subida-avisos')).toBeNull();
    });

    it('un archivo normal no genera avisos', async () => {
      crear();
      await responderLista([]);

      elegirVarios([archivo('normal.mp3')]);
      fixture.detectChanges();

      expect(el().querySelector('.subida-avisos')).toBeNull();
      await responder(pista({ id: 1 }));
    });

    it('el campo de archivo permite elegir varios', async () => {
      crear();
      await responderLista([]);

      expect((el().querySelector('input[type="file"]') as HTMLInputElement).multiple).toBe(true);
    });

    it('las sube de una en una: la siguiente no sale hasta que termina la anterior', async () => {
      crear();
      await responderLista([]);

      elegirVarios([archivo('uno.mp3'), archivo('dos.mp3'), archivo('tres.mp3')]);
      const primera = http.expectOne(`${TRACKS}/analyze`);
      expect(((primera.request.body as FormData).get('file') as File).name).toBe('uno.mp3');
      http.expectNone(`${TRACKS}/analyze`);

      primera.flush(pista({ id: 1, title: 'uno.mp3' }));
      await esperar();
      const segunda = http.expectOne(`${TRACKS}/analyze`);
      expect(((segunda.request.body as FormData).get('file') as File).name).toBe('dos.mp3');
      segunda.flush(pista({ id: 2, title: 'dos.mp3' }));
      await esperar();
      await responder(pista({ id: 3, title: 'tres.mp3' }));
    });

    it('muestra en cual va y deshabilita el campo mientras sube', async () => {
      crear();
      await responderLista([]);

      elegirVarios([archivo('uno.mp3'), archivo('dos.mp3')]);
      fixture.detectChanges();

      expect(el().querySelector('.progreso-subida')?.textContent).toContain('Analizando la pista 1 de 2 (uno.mp3)');
      expect((el().querySelector('input[type="file"]') as HTMLInputElement).disabled).toBe(true);
      expect(el().querySelector('progress')).not.toBeNull();
      await responder(pista({ id: 1 }));
      expect(el().querySelector('.progreso-subida')?.textContent).toContain('2 de 2 (dos.mp3)');
      await responder(pista({ id: 2 }));
    });

    it('al terminar resume cuantas se analizaron y agrega todas a la lista', async () => {
      crear();
      await responderLista([]);

      elegirVarios([archivo('uno.mp3'), archivo('dos.mp3'), archivo('tres.mp3')]);
      await responder(pista({ id: 1, title: 'uno.mp3' }));
      await responder(pista({ id: 2, title: 'dos.mp3' }));
      await responder(pista({ id: 3, title: 'tres.mp3' }));

      expect(el().querySelector('.subida-ok')?.textContent).toContain('3 pistas analizadas.');
      expect(el().querySelector('.subida-error')).toBeNull();
      expect(filas().length).toBe(3);
      expect(el().querySelector('.progreso-subida')).toBeNull();
      expect((el().querySelector('input[type="file"]') as HTMLInputElement).disabled).toBe(false);
    });

    it('un archivo que falla no detiene a los demas y se explica por que fallo', async () => {
      crear();
      await responderLista([]);

      elegirVarios([archivo('uno.mp3'), archivo('silencio.wav'), archivo('tres.mp3')]);
      await responder(pista({ id: 1, title: 'uno.mp3' }));
      await responder({ error: 'El audio es silencio; no hay nada que analizar.' }, 422);
      await responder(pista({ id: 3, title: 'tres.mp3' }));

      expect(el().querySelector('.subida-ok')?.textContent).toContain('2 de 3 pistas analizadas.');
      expect(el().querySelector('.subida-error')?.textContent).toContain('No se pudieron analizar 1 de 3 archivos');
      expect(el().querySelector('.subida-errores')?.textContent).toContain('silencio.wav: El audio es silencio');
      expect(filas().length).toBe(2);
    });

    it('si todas fallan no dice que se analizo alguna', async () => {
      crear();
      await responderLista([]);

      elegirVarios([archivo('a.wav'), archivo('b.wav')]);
      await responder({ error: 'mal' }, 400);
      await responder({ error: 'mal' }, 400);

      expect(el().querySelector('.subida-ok')).toBeNull();
      expect(el().querySelectorAll('.subida-errores li').length).toBe(2);
    });

    it('un archivo de mas de 50 MB no se envia y se avisa', async () => {
      crear();
      await responderLista([]);
      const grande = archivo('enorme.wav');
      Object.defineProperty(grande, 'size', { value: 60 * 1024 * 1024 });

      elegirVarios([grande, archivo('normal.mp3')]);
      await esperar();
      await responder(pista({ id: 1, title: 'normal.mp3' }));

      expect(el().querySelector('.subida-errores')?.textContent).toContain('enorme.wav: supera el maximo de 50 MB');
      expect(el().querySelector('.subida-ok')?.textContent).toContain('1 de 2 pistas analizadas.');
    });

    it('un solo archivo de mas de 50 MB tampoco se envia', async () => {
      crear();
      await responderLista([]);
      const grande = archivo('enorme.wav');
      Object.defineProperty(grande, 'size', { value: 60 * 1024 * 1024 });

      elegirVarios([grande]);
      await esperar();

      http.expectNone(`${TRACKS}/analyze`);
      expect(el().querySelector('.subida-error')?.textContent).toContain('supera el maximo de 50 MB');
    });
  });

  describe('analisis de voz en segundo plano', () => {
    const voz = (status: 'pending' | 'running' | 'done') => ({ status, lastEnd: status === 'done' ? 200 : null });

    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    const listar = async (tracks: Track[]) => {
      http.expectOne(TRACKS).flush({ tracks });
      await vi.advanceTimersByTimeAsync(0);
      fixture.detectChanges();
    };

    it('vuelve a pedir la lista mientras una pista analiza la voz y se detiene al terminar', async () => {
      crear();
      await listar([pista({ vocals: voz('running') })]);
      expect(texto()).toContain('analizando voz');

      await vi.advanceTimersByTimeAsync(REFRESCO_VOZ_MS);
      await listar([pista({ vocals: voz('running') })]);
      expect(texto()).toContain('analizando voz');

      await vi.advanceTimersByTimeAsync(REFRESCO_VOZ_MS);
      await listar([pista({ vocals: voz('done') })]);
      expect(texto()).not.toContain('analizando voz');

      await vi.advanceTimersByTimeAsync(REFRESCO_VOZ_MS * 3);
      http.expectNone(TRACKS);
    });

    it('no vuelve a pedir la lista si ninguna pista analiza la voz', async () => {
      crear();
      await listar([pista({ vocals: voz('done') }), pista({ id: 2 })]);

      await vi.advanceTimersByTimeAsync(REFRESCO_VOZ_MS * 3);

      http.expectNone(TRACKS);
    });

    it('no muestra el estado de carga en el refresco automatico', async () => {
      crear();
      await listar([pista({ vocals: voz('pending') })]);

      await vi.advanceTimersByTimeAsync(REFRESCO_VOZ_MS);

      expect(texto()).not.toContain('Cargando biblioteca');
      expect(filas().length).toBe(1);
      http.expectOne(TRACKS).flush({ tracks: [pista({ vocals: voz('pending') })] });
    });

    it('deja de pedir la lista al destruir el componente', async () => {
      crear();
      await listar([pista({ vocals: voz('running') })]);

      fixture.destroy();
      await vi.advanceTimersByTimeAsync(REFRESCO_VOZ_MS * 2);

      http.expectNone(TRACKS);
    });

    // El refresco es de fondo: un fallo del servidor no debe mostrar un error ni dejar un reintento en marcha.
    it('si el refresco falla conserva la lista y deja de insistir', async () => {
      crear();
      await listar([pista({ vocals: voz('running') })]);

      await vi.advanceTimersByTimeAsync(REFRESCO_VOZ_MS);
      http.expectOne(TRACKS).flush('error', { status: 500, statusText: 'Server Error' });
      await vi.advanceTimersByTimeAsync(REFRESCO_VOZ_MS * 3);

      http.expectNone(TRACKS);
      expect(filas().length).toBe(1);
    });
  });

  describe('pistas sin audio', () => {
    it('avisa cuantas pistas no tienen el audio guardado', async () => {
      crear();
      await responderLista([pista({ hasAudio: false }), pista({ id: 2, hasAudio: false }), pista({ id: 3 })]);

      expect(el().querySelector('.aviso-sin-audio')?.textContent).toContain('2 pistas no tienen el audio guardado');
    });

    it('usa el singular cuando es una sola pista', async () => {
      crear();
      await responderLista([pista({ hasAudio: false })]);
      expect(el().querySelector('.aviso-sin-audio')?.textContent).toContain('1 pista no tiene el audio guardado');
    });

    it('no avisa si todas las pistas tienen audio', async () => {
      crear();
      await responderLista([pista(), pista({ id: 2 })]);
      expect(el().querySelector('.aviso-sin-audio')).toBeNull();
    });
  });

  describe('cambios de una pista hechos en otra parte', () => {
    it('actualiza su fila cuando se corrige la pista (por ejemplo su primer tiempo desde un deck)', async () => {
      crear();
      await responderLista([pista({ id: 1, title: 'Tema uno' }), pista({ id: 2, title: 'Tema dos' })]);

      mixer.updateTrack(pista({ id: 2, title: 'Tema dos', bpm: 99, grid: { offset: 0, downbeat: 0.5, confidence: 1, manual: true } }));
      await esperar();

      expect(filas()[1].textContent).toContain('99.0');
      expect(filas()[0].textContent).toContain('128.0');
    });

    it('ignora una pista que no esta en la lista', async () => {
      crear();
      await responderLista([pista({ id: 1 })]);

      mixer.updateTrack(pista({ id: 99, title: 'Otra' }));
      await esperar();

      expect(filas().length).toBe(1);
      expect(texto()).not.toContain('Otra');
    });
  });
});
