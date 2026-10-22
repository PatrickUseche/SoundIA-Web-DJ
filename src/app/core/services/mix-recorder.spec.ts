import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { of, throwError } from 'rxjs';
import {
  MixRecorderService,
  RECORDER_CLOCK,
  RECORDER_DJ_ALIAS,
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
  function avanzar(segundos: number) {
    const pasos = Math.round((segundos * 1000) / RECORDER_SAMPLE_MS);
    for (let i = 0; i < pasos; i++) {
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
    const pasos = Math.round(solape / 0.5);
    for (let i = 1; i <= pasos; i++) {
      crossfader.set(i / pasos);
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

  it('un error al guardar se cuenta y se muestra, sin romper el grabador', () => {
    create.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 502, error: { error: 'El motor de IA no responde.' } })));
    const recorder = crear();
    recorder.setEnabled(true);

    mezclarAMano();

    expect(recorder.failed()).toBe(1);
    expect(recorder.saved()).toBe(0);
    expect(recorder.message()?.error).toBe(true);
    expect(recorder.message()?.text).toBeTruthy();
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
