import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { Observable, of, throwError } from 'rxjs';
import { AUTODJ_RETRY_MS, AUTODJ_TICK_MS, AutoDjService } from './autodj';
import { AutoDjApiService } from './autodj-api';
import { MixerService } from './mixer';
import { SessionsApiService } from './sessions-api';
import { TrackApiService } from './tracks';
import { DjSession, NextTracksResponse, QueueItem, TransitionPlan, WeightsInfo } from '../models/autodj';
import { Track } from '../models/track';
import { FakeAudioBuffer, FakeAudioContext, provideFakeAudio } from '../testing/fake-audio';

const pista = (id: number, cambios: Partial<Track> = {}): Track => ({
  id, title: `pista ${id}`, duration: 200, bpm: 128, key: 'C major', camelot: '8B', energy: 0.6,
  cuePoints: [0], hasAudio: true, createdAt: '2026-10-21T18:30:00+00:00', ...cambios,
});

const sesion = (id = 5): DjSession => ({ id, name: 'Auto-DJ', startedAt: 'x', endedAt: null, active: true });

/** Plan de corte: se ejecuta al instante, sin temporizadores. */
const corte = (desde: number, hasta: number, mixOutAt = 100): TransitionPlan => ({
  fromTrackId: desde, toTrackId: hasta, style: 'cut', bars: 0, seconds: 0, mixOutAt, mixInAt: 0,
  tempoMatch: { ratio: 1, multiplier: 1, feasible: true },
  compatibility: { score: 0.9, tempo: 1, harmonic: 1, energy: 1, tempoMatch: { ratio: 1, multiplier: 1, feasible: true } },
  automation: [],
});

const sugerencias = (...ids: number[]): NextTracksResponse => ({
  current: { id: 1, title: 'a', bpm: 128, camelot: '8B', energy: 0.6, duration: 200, cuePoints: [0] },
  candidates: ids.map((id) => ({
    track: { id, title: `pista ${id}`, bpm: 128, camelot: '8B', energy: 0.6, duration: 200, cuePoints: [0] },
    compatibility: { score: 0.9, tempo: 1, harmonic: 1, energy: 1, tempoMatch: { ratio: 1, multiplier: 1, feasible: true } },
  })),
});

const pesos = (samples: number, learned: boolean, harmonic = 0.4): WeightsInfo => ({
  weights: { tempo: 0.45, harmonic, energy: 0.15 }, learned, samples,
});

const error404 = () => new HttpErrorResponse({ status: 404, statusText: 'Not Found', error: { error: 'La cola esta vacia.' } });
const elemento = (trackId: number): QueueItem => ({ id: 1, sessionId: 5, trackId, addedAt: 'x' });

describe('AutoDjService', () => {
  let service: AutoDjService;
  let mixer: MixerService;
  let ctx: FakeAudioContext;

  let autodjApi: {
    transition: ReturnType<typeof vi.fn>;
    nextTracks: ReturnType<typeof vi.fn>;
    sendFeedback: ReturnType<typeof vi.fn>;
    sendMixTiming: ReturnType<typeof vi.fn>;
    weights: ReturnType<typeof vi.fn>;
  };
  let sessionsApi: { active: ReturnType<typeof vi.fn>; start: ReturnType<typeof vi.fn>; pollNext: ReturnType<typeof vi.fn> };
  let tracksApi: { get: ReturnType<typeof vi.fn>; getAudio: ReturnType<typeof vi.fn> };

  const buffer = () => new FakeAudioBuffer(200) as unknown as AudioBuffer;

  function configurar(contexto: FakeAudioContext | null = new FakeAudioContext()) {
    ctx = contexto as FakeAudioContext;
    // Las pistas cargadas con loadTrack se decodifican con esta duracion: debe superar el punto de salida (100 s).
    if (ctx) {
      ctx.decodedSeconds = 200;
    }
    autodjApi = {
      transition: vi.fn((desde: number, hasta: number): Observable<TransitionPlan> => of(corte(desde, hasta))),
      nextTracks: vi.fn(() => of(sugerencias())),
      sendFeedback: vi.fn((): Observable<WeightsInfo> => of(pesos(1, false))),
      weights: vi.fn((): Observable<WeightsInfo> => of(pesos(0, false))),
      sendMixTiming: vi.fn(() => of({ samples: 1, advanceSeconds: 0, learned: false })),
    };
    sessionsApi = {
      active: vi.fn(() => of(sesion())),
      start: vi.fn(() => of(sesion(9))),
      pollNext: vi.fn(() => throwError(error404)),
    };
    tracksApi = {
      get: vi.fn((id: number) => of(pista(id))),
      getAudio: vi.fn(() => of(new Uint8Array([1, 2, 3]).buffer)),
    };
    TestBed.configureTestingModule({
      providers: [
        provideFakeAudio(contexto),
        { provide: AutoDjApiService, useValue: autodjApi },
        { provide: SessionsApiService, useValue: sessionsApi },
        { provide: TrackApiService, useValue: tracksApi },
      ],
    });
    service = TestBed.inject(AutoDjService);
    mixer = TestBed.inject(MixerService);
  }

  /** Deck A cargado con la pista 1 y sonando. */
  const sonandoEnA = () => {
    mixer.loadBuffer('A', buffer(), pista(1));
    mixer.deck('A').play();
  };

  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    service?.stop();
    vi.useRealTimers();
  });

  describe('activar', () => {
    it('sin Web Audio no se puede activar', async () => {
      configurar(null);

      await service.start();

      expect(service.enabled()).toBe(false);
      expect(service.status()).toBe('error');
      expect(service.message()).toContain('Web Audio');
    });

    it('necesita una pista sonando', async () => {
      configurar();

      await service.start();

      expect(service.enabled()).toBe(false);
      expect(service.status()).toBe('error');
      expect(service.message()).toContain('Pon a sonar una pista');
    });

    it('con una pista sonando se activa y queda esperando', async () => {
      configurar();
      sonandoEnA();

      await service.start();

      expect(service.enabled()).toBe(true);
      expect(service.status()).toBe('esperando');
      expect(service.message()).toBeNull();
    });

    it('usa la sesion abierta si ya la hay', async () => {
      configurar();
      sonandoEnA();

      await service.start();

      expect(service.sessionId()).toBe(5);
      expect(sessionsApi.start).not.toHaveBeenCalled();
    });

    it('abre una sesion llamada Auto-DJ si no habia ninguna', async () => {
      configurar();
      sessionsApi.active.mockReturnValue(of(null));
      sonandoEnA();

      await service.start();

      expect(sessionsApi.start).toHaveBeenCalledWith('Auto-DJ');
      expect(service.sessionId()).toBe(9);
    });

    it('si falla abrir la sesion no se activa y muestra el error del API', async () => {
      configurar();
      sessionsApi.active.mockReturnValue(throwError(() => new HttpErrorResponse({
        status: 500, statusText: 'x', error: { error: 'Error interno del servidor' },
      })));
      sonandoEnA();

      await service.start();

      expect(service.enabled()).toBe(false);
      expect(service.status()).toBe('error');
      expect(service.message()).toBe('Error interno del servidor');
    });

    it('activarlo dos veces no abre otra sesion ni otro temporizador', async () => {
      configurar();
      sonandoEnA();

      await service.start();
      await service.start();

      expect(sessionsApi.active).toHaveBeenCalledTimes(1);
      expect(vi.getTimerCount()).toBe(1);
    });
  });

  describe('preparar la siguiente pista', () => {
    beforeEach(async () => {
      configurar();
      sonandoEnA();
      await service.start();
    });

    it('toma primero la pista de la cola de la sesion', async () => {
      sessionsApi.pollNext.mockReturnValue(of(elemento(7)));

      await service.tick();

      expect(sessionsApi.pollNext).toHaveBeenCalledWith(5);
      expect(service.next()?.track.id).toBe(7);
      expect(autodjApi.nextTracks).not.toHaveBeenCalled();
    });

    it('pide el plan de transicion entre la pista actual y la elegida', async () => {
      sessionsApi.pollNext.mockReturnValue(of(elemento(7)));

      await service.tick();

      expect(autodjApi.transition).toHaveBeenCalledWith(1, 7);
      expect(service.next()?.plan.fromTrackId).toBe(1);
    });

    it('carga la siguiente pista en el deck libre, sin tocar el que suena', async () => {
      sessionsApi.pollNext.mockReturnValue(of(elemento(7)));

      await service.tick();

      expect(mixer.deck('B').track()?.id).toBe(7);
      expect(mixer.deck('B').playing()).toBe(false);
      expect(mixer.deck('A').playing()).toBe(true);
      expect(service.next()?.deck).toBe('B');
      expect(service.status()).toBe('esperando');
    });

    it('con la cola vacia usa la mejor recomendacion de la IA', async () => {
      autodjApi.nextTracks.mockReturnValue(of(sugerencias(4, 5)));

      await service.tick();

      expect(autodjApi.nextTracks).toHaveBeenCalledWith(1, 10);
      expect(service.next()?.track.id).toBe(4);
    });

    it('descarta las recomendaciones que ya sonaron y la pista actual', async () => {
      autodjApi.nextTracks.mockReturnValue(of(sugerencias(1, 4)));

      await service.tick();

      expect(service.next()?.track.id).toBe(4); // la 1 es la que suena
    });

    it('descarta las recomendaciones sin audio guardado', async () => {
      autodjApi.nextTracks.mockReturnValue(of(sugerencias(4, 5)));
      tracksApi.get.mockImplementation((id: number) => of(pista(id, { hasAudio: id !== 4 })));

      await service.tick();

      expect(service.next()?.track.id).toBe(5);
    });

    it('si no hay pistas para continuar lo explica y espera antes de reintentar', async () => {
      autodjApi.nextTracks.mockReturnValue(of(sugerencias()));

      await service.tick();

      expect(service.next()).toBeNull();
      expect(service.message()).toContain('No hay mas pistas');
      expect(service.status()).toBe('esperando');
    });

    it('no reintenta hasta que pasa la espera y luego vuelve a intentar', async () => {
      autodjApi.nextTracks.mockReturnValue(of(sugerencias()));
      await service.tick();
      expect(autodjApi.nextTracks).toHaveBeenCalledTimes(1);

      await service.tick(); // aun dentro de la espera
      expect(autodjApi.nextTracks).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(AUTODJ_RETRY_MS + 1);
      await service.tick();
      expect(autodjApi.nextTracks).toHaveBeenCalledTimes(2);
    });

    it('si falla el API muestra el error, queda en estado error y reintenta mas tarde', async () => {
      autodjApi.nextTracks.mockReturnValue(throwError(() => new HttpErrorResponse({
        status: 502, statusText: 'x', error: { error: 'El motor de IA no esta disponible' },
      })));

      await service.tick();

      expect(service.status()).toBe('error');
      expect(service.message()).toBe('El motor de IA no esta disponible');
      expect(service.enabled()).toBe(true); // sigue activo: reintentara
    });

    it('un fallo de la cola que no es 404 tambien se muestra', async () => {
      sessionsApi.pollNext.mockReturnValue(throwError(() => new HttpErrorResponse({
        status: 500, statusText: 'x', error: { error: 'Error interno del servidor' },
      })));

      await service.tick();

      expect(service.status()).toBe('error');
      expect(service.message()).toBe('Error interno del servidor');
    });

    it('dos ticks seguidos no preparan dos veces', async () => {
      sessionsApi.pollNext.mockReturnValue(of(elemento(7)));

      await Promise.all([service.tick(), service.tick()]);

      expect(autodjApi.transition).toHaveBeenCalledTimes(1);
    });

    it('si suena un archivo local sin analizar explica que necesita BPM y tonalidad', async () => {
      mixer.loadBuffer('A', buffer(), null);
      mixer.deck('A').play();

      await service.tick();

      expect(service.message()).toContain('no esta analizada');
      expect(autodjApi.nextTracks).not.toHaveBeenCalled();
    });
  });

  describe('hacer la transicion', () => {
    beforeEach(async () => {
      configurar();
      sonandoEnA();
      await service.start();
      sessionsApi.pollNext.mockReturnValueOnce(of(elemento(7)));
      await service.tick(); // prepara la 7 en el deck B con mixOutAt = 100
    });

    it('espera mientras la pista no llega al punto de salida', async () => {
      ctx.currentTime = 50;

      await service.tick();

      expect(mixer.deck('B').playing()).toBe(false);
      expect(service.next()).not.toBeNull();
    });

    it('al llegar al punto de salida hace la transicion y cambia de deck', async () => {
      ctx.currentTime = 100;

      await service.tick();

      expect(mixer.deck('B').playing()).toBe(true);
      expect(mixer.deck('A').playing()).toBe(false);
      expect(service.next()).toBeNull();
      expect(service.status()).toBe('esperando');
    });

    it('tras la transicion prepara la siguiente a partir del nuevo deck', async () => {
      ctx.currentTime = 100;
      await service.tick(); // transicion A -> B
      sessionsApi.pollNext.mockReturnValueOnce(of(elemento(8)));

      await service.tick();

      expect(autodjApi.transition).toHaveBeenLastCalledWith(7, 8);
      expect(service.next()?.deck).toBe('A'); // ahora la entrante va al deck A
      expect(mixer.deck('A').track()?.id).toBe(8);
    });

    it('no vuelve a recomendar una pista que ya sono', async () => {
      ctx.currentTime = 100;
      await service.tick(); // sono la 1 y ahora suena la 7
      autodjApi.nextTracks.mockReturnValue(of(sugerencias(1, 7, 9)));

      await service.tick();

      expect(service.next()?.track.id).toBe(9);
    });

    it('si la transicion falla muestra el error y sigue activo', async () => {
      ctx.currentTime = 100;
      mixer.deck('B').eject(); // el runner exige las dos pistas cargadas

      await service.tick();

      expect(service.status()).toBe('error');
      expect(service.message()).toContain('necesitan una pista');
      expect(service.next()).toBeNull();
      expect(service.enabled()).toBe(true);
    });
  });

  describe('cuenta atras y mezclar ahora', () => {
    beforeEach(async () => {
      configurar();
      sonandoEnA();
      await service.start();
    });

    const prepararLa7 = async () => {
      sessionsApi.pollNext.mockReturnValueOnce(of(elemento(7)));
      await service.tick(); // prepara la 7 en el deck B con mixOutAt = 100
    };

    it('sin siguiente preparada no hay cuenta atras', async () => {
      await service.tick();

      expect(service.secondsToMix()).toBeNull();
    });

    it('con la siguiente preparada cuenta los segundos que faltan para el punto de salida', async () => {
      await prepararLa7();
      ctx.currentTime = 40;

      await service.tick();

      expect(service.secondsToMix()).toBeCloseTo(60);
    });

    it('la cuenta atras no baja de cero', async () => {
      await prepararLa7();
      ctx.currentTime = 99;
      await service.tick();

      expect(service.secondsToMix()).toBeCloseTo(1);
    });

    it('mezclar ahora hace la transicion sin esperar al punto de salida', async () => {
      await prepararLa7();
      ctx.currentTime = 40;

      await service.mixNow();

      expect(mixer.deck('B').playing()).toBe(true);
      expect(mixer.deck('A').playing()).toBe(false);
      expect(service.next()).toBeNull();
      expect(service.secondsToMix()).toBeNull();
    });

    it('mezclar ahora antes de lo planeado le ensena a la IA cuando mezclar', async () => {
      await prepararLa7();
      ctx.currentTime = 40;

      await service.mixNow();

      expect(autodjApi.sendMixTiming).toHaveBeenCalledWith(1, 7, 100, 40);
    });

    it('si el envio del aprendizaje falla, la mezcla se hace igual y el Auto-DJ sigue activo', async () => {
      autodjApi.sendMixTiming.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 502 })));
      await prepararLa7();
      ctx.currentTime = 40;

      await service.mixNow();

      expect(mixer.deck('B').playing()).toBe(true);
      expect(service.enabled()).toBe(true);
      expect(service.message()).toBeNull();
    });

    it('sin siguiente preparada mezclar ahora no hace nada', async () => {
      await service.mixNow();

      expect(mixer.deck('A').playing()).toBe(true);
      expect(autodjApi.sendMixTiming).not.toHaveBeenCalled();
    });

    it('con el Auto-DJ apagado mezclar ahora no hace nada', async () => {
      await prepararLa7();
      service.stop();

      await service.mixNow();

      expect(mixer.deck('B').playing()).toBe(false);
      expect(autodjApi.sendMixTiming).not.toHaveBeenCalled();
    });

    it('una mezcla automatica en el punto planeado no se envia como aprendizaje', async () => {
      await prepararLa7();
      ctx.currentTime = 100;

      await service.tick();

      expect(mixer.deck('B').playing()).toBe(true);
      expect(autodjApi.sendMixTiming).not.toHaveBeenCalled();
    });

    it('si la transicion falla no se ensena nada', async () => {
      await prepararLa7();
      ctx.currentTime = 40;
      mixer.deck('B').eject();

      await service.mixNow();

      expect(service.status()).toBe('error');
      expect(autodjApi.sendMixTiming).not.toHaveBeenCalled();
    });

    it('desactivar el Auto-DJ borra la cuenta atras', async () => {
      await prepararLa7();
      await service.tick();

      service.stop();

      expect(service.secondsToMix()).toBeNull();
    });
  });

  describe('sin nada sonando', () => {
    it('el tick no hace nada', async () => {
      configurar();
      sonandoEnA();
      await service.start();
      mixer.deck('A').pause();

      await service.tick();

      expect(autodjApi.nextTracks).not.toHaveBeenCalled();
      expect(sessionsApi.pollNext).not.toHaveBeenCalled();
    });

    it('desactivado, el tick no hace nada aunque suene una pista', async () => {
      configurar();
      sonandoEnA();

      await service.tick();

      expect(sessionsApi.pollNext).not.toHaveBeenCalled();
    });
  });

  describe('temporizador', () => {
    it('revisa periodicamente sin que nadie llame a tick', async () => {
      configurar();
      sonandoEnA();
      sessionsApi.pollNext.mockReturnValue(of(elemento(7)));
      await service.start();

      await vi.advanceTimersByTimeAsync(AUTODJ_TICK_MS + 10);

      expect(service.next()?.track.id).toBe(7);
    });
  });

  describe('desactivar', () => {
    it('limpia el estado, detiene el temporizador y olvida lo preparado', async () => {
      configurar();
      sonandoEnA();
      await service.start();
      sessionsApi.pollNext.mockReturnValueOnce(of(elemento(7)));
      await service.tick();

      service.stop();

      expect(service.enabled()).toBe(false);
      expect(service.status()).toBe('off');
      expect(service.next()).toBeNull();
      expect(vi.getTimerCount()).toBe(0);
    });

    it('al desactivar deja de preparar pistas', async () => {
      configurar();
      sonandoEnA();
      await service.start();
      service.stop();

      await service.tick();

      expect(sessionsApi.pollNext).not.toHaveBeenCalled();
    });

    it('se puede volver a activar tras desactivarlo', async () => {
      configurar();
      sonandoEnA();
      await service.start();
      service.stop();

      await service.start();

      expect(service.enabled()).toBe(true);
    });
  });

  describe('valorar las transiciones', () => {
    /** Prepara y hace una transicion A -> B (corte instantaneo) para tener algo que valorar. */
    async function conTransicionHecha() {
      configurar();
      sonandoEnA();
      await service.start();
      sessionsApi.pollNext.mockReturnValueOnce(of(elemento(7)));
      await service.tick();
      ctx.currentTime = 100;
      await service.tick();
    }

    it('antes de cualquier transicion no hay nada que valorar', async () => {
      configurar();
      sonandoEnA();
      await service.start();

      expect(service.lastTransition()).toBeNull();
    });

    it('al terminar una transicion queda disponible para valorarla, con las dos pistas', async () => {
      await conTransicionHecha();

      expect(service.lastTransition()?.from.id).toBe(1);
      expect(service.lastTransition()?.to.id).toBe(7);
      expect(service.rating()).toBeNull();
    });

    it('valorar que gusto envia la valoracion al motor y guarda los pesos devueltos', async () => {
      await conTransicionHecha();
      autodjApi.sendFeedback.mockReturnValue(of(pesos(12, true, 0.6)));

      await service.rate(true);

      expect(autodjApi.sendFeedback).toHaveBeenCalledWith(1, 7, true);
      expect(service.rating()).toBe('liked');
      expect(service.weights()?.learned).toBe(true);
      expect(service.weights()?.weights.harmonic).toBe(0.6);
    });

    it('valorar que no gusto envia false', async () => {
      await conTransicionHecha();

      await service.rate(false);

      expect(autodjApi.sendFeedback).toHaveBeenCalledWith(1, 7, false);
      expect(service.rating()).toBe('disliked');
    });

    it('no se puede valorar dos veces la misma transicion', async () => {
      await conTransicionHecha();

      await service.rate(true);
      await service.rate(false);

      expect(autodjApi.sendFeedback).toHaveBeenCalledTimes(1);
      expect(service.rating()).toBe('liked');
    });

    it('sin transicion no se envia nada', async () => {
      configurar();

      await service.rate(true);

      expect(autodjApi.sendFeedback).not.toHaveBeenCalled();
    });

    it('si falla el envio muestra el error y permite volver a intentarlo', async () => {
      await conTransicionHecha();
      autodjApi.sendFeedback.mockReturnValueOnce(throwError(() => new HttpErrorResponse({
        status: 502, statusText: 'x', error: { error: 'El motor de IA no esta disponible' },
      })));

      await service.rate(true);

      expect(service.feedbackError()).toBe('El motor de IA no esta disponible');
      expect(service.rating()).toBeNull();

      await service.rate(true);
      expect(service.rating()).toBe('liked');
      expect(service.feedbackError()).toBeNull();
    });

    it('dos valoraciones simultaneas no duplican el envio', async () => {
      await conTransicionHecha();

      await Promise.all([service.rate(true), service.rate(true)]);

      expect(autodjApi.sendFeedback).toHaveBeenCalledTimes(1);
    });

    it('una transicion nueva se puede valorar aunque la anterior ya se valorara', async () => {
      await conTransicionHecha();
      await service.rate(true);
      sessionsApi.pollNext.mockReturnValueOnce(of(elemento(8)));
      await service.tick(); // prepara la 8 a partir de la 7
      ctx.currentTime = 200;
      await service.tick(); // transicion 7 -> 8

      expect(service.lastTransition()?.to.id).toBe(8);
      expect(service.rating()).toBeNull();
      await service.rate(false);
      expect(autodjApi.sendFeedback).toHaveBeenLastCalledWith(7, 8, false);
    });

    it('desactivar el Auto-DJ no impide valorar la ultima transicion', async () => {
      await conTransicionHecha();

      service.stop();
      await service.rate(true);

      expect(autodjApi.sendFeedback).toHaveBeenCalledWith(1, 7, true);
    });

    it('loadWeights consulta los pesos vigentes del motor', async () => {
      configurar();
      autodjApi.weights.mockReturnValue(of(pesos(30, true, 0.55)));

      await service.loadWeights();

      expect(service.weights()?.samples).toBe(30);
      expect(service.weights()?.weights.harmonic).toBe(0.55);
    });

    it('si loadWeights falla no molesta: los pesos quedan sin conocer', async () => {
      configurar();
      autodjApi.weights.mockReturnValue(throwError(() => new Error('sin red')));

      await service.loadWeights();

      expect(service.weights()).toBeNull();
    });
  });
});
