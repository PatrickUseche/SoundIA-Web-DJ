import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TRANSITION_TICK_MS, TransitionRunnerService } from './transition-runner';
import { MixerService } from './mixer';
import { AutomationPoint, TransitionPlan } from '../models/autodj';
import { Track } from '../models/track';
import { FakeAudioBuffer, FakeAudioContext, provideFakeAudio } from '../testing/fake-audio';

const pista = (id: number, bpm = 128): Track => ({
  id, title: `pista ${id}`, duration: 200, bpm, key: 'C major', camelot: '8B', energy: 0.6,
  cuePoints: [0], hasAudio: true, createdAt: '2026-10-21T18:30:00+00:00',
});

function automatizacion(pasos: number): AutomationPoint[] {
  return Array.from({ length: pasos + 1 }, (_, i) => {
    const p = i / pasos;
    const cambiado = p >= 0.5;
    return {
      position: p, gainA: Math.cos((p * Math.PI) / 2), gainB: Math.sin((p * Math.PI) / 2),
      lowA: cambiado ? 0 : 1, lowB: cambiado ? 1 : 0, midA: 1 - p, midB: p, highA: 1 - p, highB: p,
    };
  });
}

function plan(cambios: Partial<TransitionPlan> = {}): TransitionPlan {
  return {
    fromTrackId: 1, toTrackId: 2, style: 'blend', bars: 4, seconds: 10, mixOutAt: 100, mixInAt: 8,
    tempoMatch: { ratio: 1.03, multiplier: 1, feasible: true },
    compatibility: { score: 0.9, tempo: 0.9, harmonic: 0.9, energy: 0.9, tempoMatch: { ratio: 1.03, multiplier: 1, feasible: true } },
    automation: automatizacion(16),
    ...cambios,
  };
}

describe('TransitionRunnerService', () => {
  let runner: TransitionRunnerService;
  let mixer: MixerService;
  let ctx: FakeAudioContext;

  const buffer = () => new FakeAudioBuffer(200) as unknown as AudioBuffer;

  /** Deja correr las tareas de microtareas pendientes (resume() es async) con los timers falsos. */
  const flush = () => vi.advanceTimersByTimeAsync(0);
  const avanzar = (ms: number) => vi.advanceTimersByTimeAsync(ms);

  beforeEach(() => {
    vi.useFakeTimers();
    ctx = new FakeAudioContext();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideFakeAudio(ctx)],
    });
    mixer = TestBed.inject(MixerService);
    runner = TestBed.inject(TransitionRunnerService);
    mixer.loadBuffer('A', buffer(), pista(1));
    mixer.loadBuffer('B', buffer(), pista(2));
    mixer.deck('A').play();
  });

  afterEach(() => {
    runner.cancel();
    vi.useRealTimers();
  });

  describe('precondiciones', () => {
    it('falla si algun deck no tiene pista', async () => {
      mixer.deck('B').eject();

      await expect(runner.run(plan(), 'A', 'B')).rejects.toThrow('necesitan una pista');
    });
  });

  describe('fundido sin igualar el tempo', () => {
    const fundido = () => plan({
      style: 'fade', bars: 2, seconds: 4, automation: automatizacion(8),
      tempoMatch: { ratio: 0.87, multiplier: 1, feasible: false },
    });

    it('la pista entrante suena a su tempo natural: no se fuerza un pitch que no encaja', async () => {
      const mezcla = runner.run(fundido(), 'A', 'B');
      await flush();

      expect(mixer.deck('B').pitch()).toBe(1);
      await avanzar(5000);
      await mezcla;
    });

    it('cruza las dos pistas durante los segundos del plan en vez de cortar', async () => {
      const mezcla = runner.run(fundido(), 'A', 'B');
      await flush();
      await avanzar(2000);

      expect(runner.running()).toBe(true);
      expect(mixer.deck('A').playing()).toBe(true);
      expect(mixer.deck('B').playing()).toBe(true);
      expect(mixer.crossfader()).toBeGreaterThan(0.3);
      expect(mixer.crossfader()).toBeLessThan(0.7);

      await avanzar(3000);
      expect(await mezcla).toBe('completed');
      expect(mixer.deck('A').playing()).toBe(false);
      expect(mixer.crossfader()).toBe(1);
    });
  });

  describe('corte', () => {
    const corte = () => plan({ style: 'cut', bars: 0, seconds: 0, automation: [] });

    it('cambia de deck al instante: entra la nueva, sale la anterior y el crossfader pasa al otro lado', async () => {
      const resultado = await runner.run(corte(), 'A', 'B');

      expect(resultado).toBe('completed');
      expect(mixer.deck('B').playing()).toBe(true);
      expect(mixer.deck('A').playing()).toBe(false);
      expect(mixer.crossfader()).toBe(1);
    });

    it('la pista entrante empieza en su punto de entrada y a su ritmo', async () => {
      await runner.run(corte(), 'A', 'B');

      expect(mixer.deck('B').position()).toBeCloseTo(8);
      expect(mixer.deck('B').pitch()).toBeCloseTo(1.03);
    });

    it('al cortar de B a A el crossfader va al lado izquierdo', async () => {
      mixer.deck('A').pause();
      mixer.deck('B').play();

      await runner.run(plan({ style: 'cut', bars: 0, seconds: 0, automation: [] }), 'B', 'A');

      expect(mixer.deck('A').playing()).toBe(true);
      expect(mixer.crossfader()).toBe(0);
    });

    it('no deja la transicion marcada como en curso', async () => {
      await runner.run(corte(), 'A', 'B');

      expect(runner.running()).toBe(false);
    });
  });

  describe('mezcla gradual', () => {
    it('arranca la pista entrante y deja el mezclador en la posicion inicial', async () => {
      const ejecucion = runner.run(plan(), 'A', 'B');
      await flush();

      expect(mixer.deck('B').playing()).toBe(true);
      expect(mixer.deck('A').playing()).toBe(true); // la saliente sigue sonando
      expect(mixer.crossfader()).toBe(0);
      expect(runner.running()).toBe(true);
      expect(mixer.deck('B').eq().low).toBe(0); // los graves de la entrante empiezan cortados
      expect(mixer.deck('A').eq().low).toBe(0.5);
      runner.cancel();
      await ejecucion;
    });

    it('a mitad de la mezcla el crossfader esta en el centro y los graves ya se intercambiaron', async () => {
      const ejecucion = runner.run(plan({ seconds: 10 }), 'A', 'B');
      await flush();

      await avanzar(5000);

      expect(mixer.crossfader()).toBeCloseTo(0.5, 1);
      expect(runner.progress()).toBeCloseTo(0.5, 1);
      expect(mixer.deck('A').eq().low).toBe(0); // la saliente ya sin graves
      expect(mixer.deck('B').eq().low).toBe(0.5); // la entrante con graves abiertos
      runner.cancel();
      await ejecucion;
    });

    it('nunca estan los graves de las dos pistas abiertos a la vez durante toda la mezcla', async () => {
      const ejecucion = runner.run(plan({ seconds: 10 }), 'A', 'B');
      await flush();

      for (let t = 0; t < 10000; t += TRANSITION_TICK_MS) {
        await avanzar(TRANSITION_TICK_MS);
        // Al terminar, los EQ vuelven a quedar planos, pero la saliente ya esta detenida: no suena.
        if (mixer.deck('A').playing()) {
          const abiertas = Number(mixer.deck('A').eq().low > 0.25) + Number(mixer.deck('B').eq().low > 0.25);
          expect(abiertas).toBeLessThanOrEqual(1);
        }
      }
      await ejecucion;
    });

    it('al terminar detiene la saliente, deja solo la entrante y los EQ planos', async () => {
      const ejecucion = runner.run(plan({ seconds: 10 }), 'A', 'B');
      await flush();

      await avanzar(10100);

      expect(await ejecucion).toBe('completed');
      expect(mixer.deck('A').playing()).toBe(false);
      expect(mixer.deck('B').playing()).toBe(true);
      expect(mixer.crossfader()).toBe(1);
      expect(mixer.deck('A').eq()).toEqual({ low: 0.5, mid: 0.5, high: 0.5 });
      expect(mixer.deck('B').eq()).toEqual({ low: 0.5, mid: 0.5, high: 0.5 });
      expect(runner.running()).toBe(false);
      expect(runner.progress()).toBe(1);
    });

    it('si sale el deck B el crossfader recorre el camino inverso', async () => {
      mixer.deck('A').pause();
      mixer.deck('B').play();
      const ejecucion = runner.run(plan({ seconds: 10 }), 'B', 'A');
      await flush();
      expect(mixer.crossfader()).toBe(1);

      await avanzar(5000);
      expect(mixer.crossfader()).toBeCloseTo(0.5, 1);

      await avanzar(5100);
      expect(await ejecucion).toBe('completed');
      expect(mixer.crossfader()).toBe(0);
      expect(mixer.deck('A').playing()).toBe(true);
      expect(mixer.deck('B').playing()).toBe(false);
    });

    it('el avance es monotono', async () => {
      const ejecucion = runner.run(plan({ seconds: 10 }), 'A', 'B');
      await flush();
      let anterior = 0;

      for (let t = 0; t < 10000; t += 500) {
        await avanzar(500);
        expect(runner.progress()).toBeGreaterThanOrEqual(anterior);
        anterior = runner.progress();
      }
      await ejecucion;
    });

    it('la pista entrante usa el ajuste de tempo del plan', async () => {
      const ejecucion = runner.run(plan({ tempoMatch: { ratio: 0.97, multiplier: 1, feasible: true } }), 'A', 'B');
      await flush();

      expect(mixer.deck('B').pitch()).toBeCloseTo(0.97);
      runner.cancel();
      await ejecucion;
    });
  });

  describe('cancelar', () => {
    it('detiene la mezcla dejando el mezclador como esta y resuelve con cancelled', async () => {
      const ejecucion = runner.run(plan({ seconds: 10 }), 'A', 'B');
      await flush();
      await avanzar(3000);
      const posicion = mixer.crossfader();

      runner.cancel();

      expect(await ejecucion).toBe('cancelled');
      expect(runner.running()).toBe(false);
      await avanzar(5000); // ya no avanza
      expect(mixer.crossfader()).toBe(posicion);
      expect(mixer.deck('A').playing()).toBe(true);
    });

    it('cancelar sin transicion en curso no hace nada', () => {
      expect(() => runner.cancel()).not.toThrow();
      expect(runner.running()).toBe(false);
    });

    it('iniciar otra transicion cancela la anterior', async () => {
      const primera = runner.run(plan({ seconds: 10 }), 'A', 'B');
      await flush();

      const segunda = runner.run(plan({ style: 'cut', bars: 0, seconds: 0, automation: [] }), 'A', 'B');

      expect(await primera).toBe('cancelled');
      expect(await segunda).toBe('completed');
    });
  });
});
