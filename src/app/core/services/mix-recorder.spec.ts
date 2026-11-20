import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { of, throwError } from 'rxjs';
import {
  MixRecorderService,
  RECORDER_CLOCK,
  RECORDER_DJ_ALIAS,
  RECORDER_MAX_PENDING,
  RECORDER_PENDING_KEY,
  RECORDER_RETRY_MS,
  RECORDER_SAMPLE_MS,
  RECORDER_STORAGE,
  RECORDER_STORAGE_KEY,
} from './mix-recorder';
import { MixerService } from './mixer';
import { RecordingApiService } from './recordings';
import { TransitionRunnerService } from './transition-runner';
import { SavedRecording } from '../models/recording';

/** Un deck falso con las senales que lee el grabador. */
function falsoDeck(trackId: number | null) {
  return {
    track: signal(trackId === null ? null : { id: trackId }),
    playing: signal(false),
    position: signal(0),
    pitch: signal(1),
    volume: signal(1),
    eq: signal({ low: 0.5, mid: 0.5, high: 0.5 }),
  };
}

const guardada: SavedRecording = {
  id: 1, quality: 'unreviewed', features: { overlapBars: 8, crossfaderShape: 'linear', bassSwapAt: 0.5 },
};

describe('MixRecorderService', () => {
  let ahora: number;
  let almacen: Record<string, string>;
  let deckA: ReturnType<typeof falsoDeck>;
  let deckB: ReturnType<typeof falsoDeck>;
  let crossfader: ReturnType<typeof signal<number>>;
  let corriendo: ReturnType<typeof signal<boolean>>;
  let create: ReturnType<typeof vi.fn>;
  let soportado: boolean;

  function crear(): MixRecorderService {
    return TestBed.inject(MixRecorderService);
  }

  /** Avanza el reloj y deja correr los muestreos del temporizador. */
  function avanzar(secondsValue: number) {
    const stepCount = Math.round((secondsValue * 1000) / RECORDER_SAMPLE_MS);
    for (let i = 0; i < stepCount; i++) {
      ahora += RECORDER_SAMPLE_MS / 1000;
      vi.advanceTimersByTime(RECORDER_SAMPLE_MS);
    }
  }

  /** Una mezcla manual completa: A suena sola, entra B con un fundido de `solape` s y A se apaga. */
  function mezclarAMano(solape = 8) {
    deckA.playing.set(true);
    deckA.position.set(120);
    crossfader.set(0);
    avanzar(3);
    deckB.playing.set(true);
    deckB.position.set(2);
    const stepCount = Math.round(solape / 0.5);
    for (let i = 1; i <= stepCount; i++) {
      crossfader.set(i / stepCount);
      avanzar(0.5);
    }
    deckA.playing.set(false);
    avanzar(2);
  }

  beforeEach(() => {
    vi.useFakeTimers();
    ahora = 100;
    almacen = {};
    soportado = true;
    deckA = falsoDeck(1);
    deckB = falsoDeck(2);
    crossfader = signal(0);
    corriendo = signal(false);
    create = vi.fn(() => of(guardada));

    TestBed.configureTestingModule({
      providers: [
        {
          provide: MixerService,
          useValue: {
            get supported() { return soportado; },
            crossfader,
            deck: (id: 'A' | 'B') => (id === 'A' ? deckA : deckB),
          },
        },
        { provide: TransitionRunnerService, useValue: { running: corriendo } },
        { provide: RecordingApiService, useValue: { create } },
        { provide: RECORDER_CLOCK, useValue: () => ahora },
        // Mas largas que lo que sigue corriendo el reloj al final de una mezcla (2 s), para controlar cuando reintenta.
        { provide: RECORDER_RETRY_MS, useValue: [5000, 10000] },
        {
          provide: RECORDER_STORAGE,
          useValue: {
            getItem: (k: string) => almacen[k] ?? null,
            setItem: (k: string, v: string) => { almacen[k] = v; },
          },
        },
      ],
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('empieza apagado y no guarda nada aunque haya mezclas', () => {
    const recorder = crear();

    mezclarAMano();

    expect(recorder.enabled()).toBe(false);
    expect(create).not.toHaveBeenCalled();
  });

  it('encendido, guarda una mezcla manual con lo que hizo el DJ', () => {
    const recorder = crear();
    recorder.setEnabled(true);

    mezclarAMano(8);

    expect(create).toHaveBeenCalledTimes(1);
    const cuerpo = create.mock.calls[0][0];
    expect(cuerpo.fromTrackId).toBe(1);
    expect(cuerpo.toTrackId).toBe(2);
    expect(cuerpo.source).toBe('manual');
    expect(cuerpo.dj).toBe(RECORDER_DJ_ALIAS);
    expect(cuerpo.mixOutAt).toBeGreaterThan(119);
    expect(cuerpo.overlapSeconds).toBeGreaterThan(6);
    expect(cuerpo.curves.crossfader.length).toBeGreaterThan(5);
    expect(recorder.saved()).toBe(1);
    expect(recorder.message()?.error).toBe(false);
    expect(recorder.message()?.text).toContain('8.0 compases');
  });

  it('indica que hay una mezcla en curso mientras se sigue', () => {
    const recorder = crear();
    recorder.setEnabled(true);
    deckA.playing.set(true);
    avanzar(3);
    expect(recorder.recording()).toBe(false);

    deckB.playing.set(true);
    crossfader.set(0.5);
    avanzar(1);

    expect(recorder.recording()).toBe(true);
  });

  it('un error de la propia mezcla se cuenta y se muestra, sin romper el grabador ni reintentarse', () => {
    create.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 400, error: { error: 'El solape no es valido.' } })));
    const recorder = crear();
    recorder.setEnabled(true);

    mezclarAMano();
    vi.advanceTimersByTime(60_000);

    expect(create).toHaveBeenCalledTimes(1);
    expect(recorder.failed()).toBe(1);
    expect(recorder.saved()).toBe(0);
    expect(recorder.pendingCount()).toBe(0);
    expect(recorder.message()?.error).toBe(true);
    expect(recorder.message()?.text).toContain('El solape no es valido');
  });

  describe('si el servidor no responde (dormido o reiniciandose)', () => {
    const caido = (status = 502) => throwError(() => new HttpErrorResponse({ status }));
    const mezclaVieja = (n: number) => ({
      fromTrackId: n, toTrackId: n + 1000, source: 'manual', dj: 'dj', mixOutAt: 100, mixInAt: 1, overlapSeconds: 16,
      pitchA: 1, pitchB: 1, curves: {},
    });

    it('la mezcla no se pierde: queda pendiente y se avisa', () => {
      create.mockReturnValue(caido());
      const recorder = crear();
      recorder.setEnabled(true);

      mezclarAMano();

      expect(recorder.pendingCount()).toBe(1);
      expect(recorder.failed()).toBe(0);
      expect(recorder.message()?.error).toBe(true);
      expect(recorder.message()?.text).toContain('esperan para guardarse');
    });

    it('se reintenta sola cuando el servidor vuelve y entonces se cuenta como guardada', () => {
      create.mockReturnValueOnce(caido()).mockReturnValue(of(guardada));
      const recorder = crear();
      recorder.setEnabled(true);

      mezclarAMano();
      expect(recorder.pendingCount()).toBe(1);
      vi.advanceTimersByTime(5000);

      expect(create).toHaveBeenCalledTimes(2);
      expect(recorder.pendingCount()).toBe(0);
      expect(recorder.saved()).toBe(1);
      expect(recorder.message()?.error).toBe(false);
    });

    it('la espera entre reintentos crece y la ultima se repite', () => {
      create.mockReturnValue(caido(503));
      almacen[RECORDER_PENDING_KEY] = JSON.stringify([mezclaVieja(1)]);
      const recorder = crear();

      vi.advanceTimersByTime(1000); // al abrir la pagina intenta enviarla
      expect(create).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(4999);
      expect(create).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(1); // primer reintento, 5 s despues
      expect(create).toHaveBeenCalledTimes(2);
      vi.advanceTimersByTime(9999);
      expect(create).toHaveBeenCalledTimes(2);
      vi.advanceTimersByTime(1); // segundo, 10 s despues
      expect(create).toHaveBeenCalledTimes(3);
      vi.advanceTimersByTime(10000); // la ultima espera (10 s) se repite
      expect(create).toHaveBeenCalledTimes(4);
      expect(recorder.pendingCount()).toBe(1);
    });

    it('un error de red (estado 0) tambien se reintenta', () => {
      create.mockReturnValueOnce(caido(0)).mockReturnValue(of(guardada));
      const recorder = crear();
      recorder.setEnabled(true);

      mezclarAMano();
      vi.advanceTimersByTime(5000);

      expect(recorder.saved()).toBe(1);
    });

    it('lo pendiente se guarda en el almacenamiento para sobrevivir a recargar la pagina', () => {
      create.mockReturnValue(caido());
      const recorder = crear();
      recorder.setEnabled(true);

      mezclarAMano();

      const guardado = JSON.parse(almacen[RECORDER_PENDING_KEY]);
      expect(guardado.length).toBe(1);
      expect(guardado[0].fromTrackId).toBe(1);
      expect(guardado[0].toTrackId).toBe(2);
    });

    it('al guardarse se quita del almacenamiento', () => {
      create.mockReturnValueOnce(caido()).mockReturnValue(of(guardada));
      const recorder = crear();
      recorder.setEnabled(true);
      mezclarAMano();

      vi.advanceTimersByTime(5000);

      expect(JSON.parse(almacen[RECORDER_PENDING_KEY])).toEqual([]);
    });

    it('al abrir la pagina reintenta lo que quedo pendiente de la sesion anterior', () => {
      const vieja = mezclaVieja(5);
      almacen[RECORDER_PENDING_KEY] = JSON.stringify([vieja]);

      const recorder = crear();
      expect(recorder.pendingCount()).toBe(1);
      vi.advanceTimersByTime(1000);

      expect(create).toHaveBeenCalledWith(vieja);
      expect(recorder.pendingCount()).toBe(0);
      expect(recorder.saved()).toBe(1);
    });

    it('un contenido danado del almacenamiento se ignora', () => {
      almacen[RECORDER_PENDING_KEY] = '{esto no es json';

      const recorder = crear();
      vi.advanceTimersByTime(5000);

      expect(recorder.pendingCount()).toBe(0);
      expect(create).not.toHaveBeenCalled();
    });

    it('envia las pendientes de una en una, de la mas antigua a la mas nueva', () => {
      almacen[RECORDER_PENDING_KEY] = JSON.stringify([mezclaVieja(1), mezclaVieja(2), mezclaVieja(3)]);

      const recorder = crear();
      vi.advanceTimersByTime(1000);

      expect(create.mock.calls.map((c) => c[0].fromTrackId)).toEqual([1, 2, 3]);
      expect(recorder.saved()).toBe(3);
      expect(recorder.pendingCount()).toBe(0);
    });

    it('no acumula mas de las permitidas: se queda con las mas nuevas', () => {
      const todas = Array.from({ length: RECORDER_MAX_PENDING + 10 }, (_, i) => mezclaVieja(i));
      almacen[RECORDER_PENDING_KEY] = JSON.stringify(todas);

      const recorder = crear();

      expect(recorder.pendingCount()).toBe(RECORDER_MAX_PENDING);
    });

    it('si la sesion caduco las conserva y no insiste hasta volver a entrar', () => {
      create.mockReturnValue(caido(401));
      const recorder = crear();
      recorder.setEnabled(true);

      mezclarAMano();
      vi.advanceTimersByTime(60_000);

      expect(create).toHaveBeenCalledTimes(1);
      expect(recorder.pendingCount()).toBe(1);
      expect(recorder.message()?.text).toContain('sesión caducó');
    });

    it('avisa antes de cerrar la pagina si hay mezclas sin guardar', () => {
      create.mockReturnValue(caido());
      const recorder = crear();
      recorder.setEnabled(true);
      mezclarAMano();
      expect(recorder.pendingCount()).toBe(1);

      const domEvent = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(domEvent);

      expect(domEvent.defaultPrevented).toBe(true);
    });

    it('no avisa al cerrar la pagina si no hay nada pendiente ni en curso', () => {
      const recorder = crear();
      recorder.setEnabled(true);

      const domEvent = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(domEvent);

      expect(domEvent.defaultPrevented).toBe(false);
    });
  });

  it('no graba mientras el Auto-DJ ejecuta una transicion', () => {
    const recorder = crear();
    recorder.setEnabled(true);
    corriendo.set(true);

    mezclarAMano();

    expect(create).not.toHaveBeenCalled();
    expect(recorder.recording()).toBe(false);
  });

  it('si el Auto-DJ empieza a mitad de una mezcla manual, la descarta', () => {
    const recorder = crear();
    recorder.setEnabled(true);
    deckA.playing.set(true);
    avanzar(3);
    deckB.playing.set(true);
    crossfader.set(0.5);
    avanzar(2);
    expect(recorder.recording()).toBe(true);

    corriendo.set(true);
    avanzar(0.2);
    corriendo.set(false);
    deckA.playing.set(false);
    avanzar(3);

    expect(recorder.recording()).toBe(false);
    expect(create).not.toHaveBeenCalled();
  });

  it('apagarlo deja de muestrear y olvida la mezcla en curso', () => {
    const recorder = crear();
    recorder.setEnabled(true);
    deckA.playing.set(true);
    avanzar(3);
    deckB.playing.set(true);
    crossfader.set(0.5);
    avanzar(1);

    recorder.setEnabled(false);
    deckA.playing.set(false);
    avanzar(5);

    expect(recorder.recording()).toBe(false);
    expect(create).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('recuerda si estaba encendido y lo restaura al arrancar', () => {
    crear().setEnabled(true);
    expect(almacen[RECORDER_STORAGE_KEY]).toBe('1');

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: MixerService, useValue: { supported: true, crossfader, deck: (id: 'A' | 'B') => (id === 'A' ? deckA : deckB) } },
        { provide: TransitionRunnerService, useValue: { running: corriendo } },
        { provide: RecordingApiService, useValue: { create } },
        { provide: RECORDER_CLOCK, useValue: () => ahora },
        { provide: RECORDER_STORAGE, useValue: { getItem: (k: string) => almacen[k] ?? null, setItem: () => undefined } },
      ],
    });

    expect(TestBed.inject(MixRecorderService).enabled()).toBe(true);
  });

  it('apagarlo tambien se recuerda', () => {
    const recorder = crear();
    recorder.setEnabled(true);
    recorder.setEnabled(false);

    expect(almacen[RECORDER_STORAGE_KEY]).toBe('0');
  });

  it('si el navegador no puede reproducir audio no se enciende', () => {
    soportado = false;
    const recorder = crear();

    recorder.setEnabled(true);

    expect(recorder.supported).toBe(false);
    expect(recorder.enabled()).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('un almacenamiento bloqueado no impide encenderlo', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: MixerService, useValue: { supported: true, crossfader, deck: (id: 'A' | 'B') => (id === 'A' ? deckA : deckB) } },
        { provide: TransitionRunnerService, useValue: { running: corriendo } },
        { provide: RecordingApiService, useValue: { create } },
        { provide: RECORDER_CLOCK, useValue: () => ahora },
        {
          provide: RECORDER_STORAGE,
          useValue: {
            getItem: () => { throw new Error('bloqueado'); },
            setItem: () => { throw new Error('bloqueado'); },
          },
        },
      ],
    });

    const recorder = TestBed.inject(MixRecorderService);
    recorder.setEnabled(true);

    expect(recorder.enabled()).toBe(true);
  });
});
