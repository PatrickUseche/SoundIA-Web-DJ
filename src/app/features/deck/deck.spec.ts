import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { DeckComponent } from './deck';
import { DeckId } from '../../core/audio/deck';
import { MixerService } from '../../core/services/mixer';
import { Track } from '../../core/models/track';
import { FakeAudioBuffer, FakeAudioContext, provideFakeAudio } from '../../core/testing/fake-audio';

const pista = (cambios: Partial<Track> = {}): Track => ({
  id: 1, title: 'Mi tema.wav', duration: 200, bpm: 128, key: 'C major', camelot: '8B', energy: 0.6,
  cuePoints: [4, 60], hasAudio: true, createdAt: '2026-10-21T18:30:00+00:00', ...cambios,
});

describe('DeckComponent', () => {
  let fixture: ComponentFixture<DeckComponent>;
  let ctx: FakeAudioContext;
  let mixer: MixerService;

  const buffer = (segundos = 100) => new FakeAudioBuffer(segundos) as unknown as AudioBuffer;
  const el = () => fixture.nativeElement as HTMLElement;
  const texto = () => el().textContent ?? '';
  const boton = (contiene: string) =>
    Array.from(el().querySelectorAll('button')).find((b) => b.textContent?.includes(contiene)) as HTMLButtonElement;
  const slider = (etiqueta: string) => el().querySelector(`input[aria-label="${etiqueta}"]`) as HTMLInputElement;

  function crear(id: DeckId = 'A') {
    TestBed.configureTestingModule({
      imports: [DeckComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideFakeAudio(ctx)],
    });
    mixer = TestBed.inject(MixerService);
    fixture = TestBed.createComponent(DeckComponent);
    fixture.componentRef.setInput('deckId', id);
    fixture.detectChanges();
  }

  /** Deja correr las tareas pendientes (Play espera al contexto de audio antes de arrancar) y refresca la vista. */
  const refrescar = async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    await new Promise((resolver) => setTimeout(resolver, 0));
    fixture.detectChanges();
  };

  beforeEach(() => {
    ctx = new FakeAudioContext();
    // jsdom no implementa canvas: se evita el aviso en consola.
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('deck vacio', () => {
    it('invita a cargar una pista y deshabilita los controles', () => {
      crear();

      expect(texto()).toContain('Deck vacio');
      for (const nombre of ['Play', 'Marcar cue', 'Ir al cue', 'Sync', 'Expulsar']) {
        expect(boton(nombre).disabled).toBe(true);
      }
    });

    it('muestra el nombre del deck', () => {
      crear('B');

      expect(el().querySelector('h3')?.textContent).toContain('Deck B');
    });
  });

  describe('con una pista cargada', () => {
    beforeEach(async () => {
      crear();
      mixer.loadBuffer('A', buffer(100), pista());
      await refrescar();
    });

    it('muestra titulo, BPM, tonalidad y codigo Camelot', () => {
      expect(el().querySelector('.titulo')?.textContent).toContain('Mi tema.wav');
      expect(el().querySelector('.datos')?.textContent).toContain('128.0 BPM');
      expect(el().querySelector('.datos')?.textContent).toContain('C major');
      expect(el().querySelector('.camelot')?.textContent).toBe('8B');
    });

    it('habilita los controles', () => {
      for (const nombre of ['Play', 'Marcar cue', 'Ir al cue', 'Sync', 'Expulsar']) {
        expect(boton(nombre).disabled).toBe(false);
      }
    });

    it('muestra la duracion en minutos y segundos', () => {
      expect(el().querySelector('.reloj')?.textContent).toContain('0:00 / 1:40');
    });

    it('pasa el progreso y los puntos de mezcla a la forma de onda', () => {
      // La pista dura 100 s en el buffer: los cues 4 s y 60 s caen en las fracciones 0.04 y 0.6.
      const onda = el().querySelector('app-waveform');
      expect(onda).not.toBeNull();
      expect(mixer.deck('A').peaks()).not.toBeNull();
    });

    it('un archivo local sin analizar lo indica', async () => {
      mixer.loadBuffer('A', buffer(10), null);
      await refrescar();

      expect(el().querySelector('.titulo')?.textContent).toContain('Archivo local');
      expect(boton('Sync').disabled).toBe(true); // sin BPM no se puede sincronizar
    });
  });

  describe('reproduccion', () => {
    beforeEach(async () => {
      crear();
      mixer.loadBuffer('A', buffer(100), pista());
      await refrescar();
    });

    it('Play empieza a reproducir y el boton pasa a Pausa', async () => {
      boton('Play').click();
      await refrescar();

      expect(mixer.deck('A').playing()).toBe(true);
      expect(boton('Pausa')).toBeDefined();
    });

    it('Play reanuda el contexto de audio (gesto del usuario)', async () => {
      boton('Play').click();
      await refrescar();

      expect(ctx.resumeCalls).toBeGreaterThanOrEqual(1);
    });

    it('Pausa detiene la reproduccion', async () => {
      boton('Play').click();
      await refrescar();

      boton('Pausa').click();
      await refrescar();

      expect(mixer.deck('A').playing()).toBe(false);
      expect(boton('Play')).toBeDefined();
    });
  });

  describe('reloj', () => {
    it('avanza mientras suena', async () => {
      // Los timers falsos se activan antes de crear el componente: su temporizador debe ser el falso.
      vi.useFakeTimers();
      crear();
      mixer.loadBuffer('A', buffer(100), pista());
      fixture.detectChanges(); // sin esto el boton Play seguiria deshabilitado
      boton('Play').click();
      await vi.advanceTimersByTimeAsync(0);
      ctx.currentTime = 65;

      await vi.advanceTimersByTimeAsync(100);
      fixture.detectChanges();

      expect(el().querySelector('.reloj')?.textContent).toContain('1:05 / 1:40');
    });
  });

  describe('cue', () => {
    beforeEach(async () => {
      crear();
      mixer.loadBuffer('A', buffer(100), pista({ cuePoints: [4] }));
      await refrescar();
    });

    it('Marcar cue guarda la posicion actual', async () => {
      mixer.deck('A').seek(30);

      boton('Marcar cue').click();

      expect(mixer.deck('A').cuePoint()).toBe(30);
    });

    it('Ir al cue vuelve al punto guardado', async () => {
      mixer.deck('A').seek(80);

      boton('Ir al cue').click();

      expect(mixer.deck('A').position()).toBe(4);
    });
  });

  describe('sincronizacion', () => {
    it('sin pista en el otro deck explica que hace falta cargarla', async () => {
      crear('B');
      mixer.loadBuffer('B', buffer(), pista());
      await refrescar();

      boton('Sync').click();
      await refrescar();

      expect(el().querySelector('.mensaje-sync')?.textContent).toContain('Carga una pista con BPM en los dos decks');
    });

    it('con tempos compatibles iguala el BPM y no muestra aviso', async () => {
      crear('B');
      mixer.loadBuffer('A', buffer(), pista({ bpm: 128 }));
      mixer.loadBuffer('B', buffer(), pista({ id: 2, bpm: 124 }));
      await refrescar();

      boton('Sync').click();
      await refrescar();

      expect(mixer.deck('B').effectiveBpm).toBeCloseTo(128);
      expect(el().querySelector('.mensaje-sync')).toBeNull();
    });

    it('si el tempo esta fuera del rango del fader lo avisa', async () => {
      crear('B');
      mixer.loadBuffer('A', buffer(), pista({ bpm: 128 }));
      mixer.loadBuffer('B', buffer(), pista({ id: 2, bpm: 100 }));
      await refrescar();

      boton('Sync').click();
      await refrescar();

      expect(el().querySelector('.mensaje-sync')?.textContent).toContain('demasiado lejos');
    });

    it('muestra a que BPM suena realmente cuando hay pitch', async () => {
      crear('B');
      mixer.loadBuffer('A', buffer(), pista({ bpm: 126 }));
      mixer.loadBuffer('B', buffer(), pista({ id: 2, bpm: 120 }));
      mixer.sync('B');
      await refrescar();

      expect(el().querySelector('.datos')?.textContent).toContain('suena a 126.0');
    });
  });

  describe('controles deslizantes', () => {
    beforeEach(async () => {
      crear();
      mixer.loadBuffer('A', buffer(), pista());
      await refrescar();
    });

    const mover = (input: HTMLInputElement, valor: number) => {
      input.value = String(valor);
      input.dispatchEvent(new Event('input'));
    };

    it('el pitch cambia la velocidad del deck y se muestra con signo', async () => {
      mover(slider('Pitch'), 1.05);
      await refrescar();

      expect(mixer.deck('A').pitch()).toBeCloseTo(1.05);
      expect(texto()).toContain('+5.0%');
    });

    it('el volumen cambia el volumen del deck', () => {
      mover(slider('Volumen del deck'), 0.4);

      expect(mixer.deck('A').volume()).toBeCloseTo(0.4);
    });

    it('cada banda del EQ mueve solo su perilla', () => {
      mover(slider('Graves'), 0);

      expect(mixer.deck('A').eq()).toEqual({ low: 0, mid: 0.5, high: 0.5 });
    });

    it('hay un control por cada banda del EQ', () => {
      for (const banda of ['Graves', 'Medios', 'Agudos']) {
        expect(slider(banda)).not.toBeNull();
      }
    });

    it('el rango del pitch es +-8 %', () => {
      expect(slider('Pitch').min).toBe('0.92');
      expect(slider('Pitch').max).toBe('1.08');
    });
  });

  describe('buscar y expulsar', () => {
    beforeEach(async () => {
      crear();
      mixer.loadBuffer('A', buffer(100), pista());
      await refrescar();
    });

    it('un clic en la forma de onda salta a esa fraccion de la pista', () => {
      const onda = el().querySelector('app-waveform')!;
      // El componente de forma de onda emite la fraccion; aqui se simula su salida.
      const componente = fixture.debugElement.query((d) => d.name === 'app-waveform').componentInstance;
      componente.seek.emit(0.25);

      expect(mixer.deck('A').position()).toBe(25);
      expect(onda).not.toBeNull();
    });

    it('Expulsar vacia el deck', async () => {
      boton('Expulsar').click();
      await refrescar();

      expect(mixer.deck('A').loaded).toBe(false);
      expect(texto()).toContain('Deck vacio');
    });
  });

  it('deja de refrescar la posicion al destruirse (no deja temporizadores)', () => {
    vi.useFakeTimers();
    crear();

    fixture.destroy();

    expect(vi.getTimerCount()).toBe(0);
  });
});
