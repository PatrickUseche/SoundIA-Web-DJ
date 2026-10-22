import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { MixerService } from './mixer';
import { Track } from '../models/track';
import { AudioDecodeError, AudioUnsupportedError, TrackWithoutAudioError } from '../audio/errors';
import { FakeAudioBuffer, FakeAudioContext, provideFakeAudio } from '../testing/fake-audio';
import { environment } from '../../../environments/environment';

const pista = (cambios: Partial<Track> = {}): Track => ({
  id: 1, title: 'tema.wav', duration: 200, bpm: 128, key: 'C major', camelot: '8B', energy: 0.6,
  cuePoints: [0.5, 60], hasAudio: true, createdAt: '2026-10-21T18:30:00+00:00', ...cambios,
});

function crear(ctx: FakeAudioContext | null): { mixer: MixerService; http: HttpTestingController } {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting(), provideFakeAudio(ctx)],
  });
  return { mixer: TestBed.inject(MixerService), http: TestBed.inject(HttpTestingController) };
}

const buffer = (segundos = 10) => new FakeAudioBuffer(segundos) as unknown as AudioBuffer;

describe('MixerService', () => {
  describe('soporte de Web Audio', () => {
    it('sin Web Audio no esta soportado y pedir un deck falla con un error claro', () => {
      const { mixer } = crear(null);

      expect(mixer.supported).toBe(false);
      expect(() => mixer.deck('A')).toThrow(AudioUnsupportedError);
    });

    it('con Web Audio crea los dos decks', () => {
      const { mixer } = crear(new FakeAudioContext());

      expect(mixer.supported).toBe(true);
      expect(mixer.deck('A').id).toBe('A');
      expect(mixer.deck('B').id).toBe('B');
      expect(mixer.otherDeck('A').id).toBe('B');
      expect(mixer.otherDeck('B').id).toBe('A');
    });

    it('sin Web Audio, mover los controles no falla', () => {
      const { mixer } = crear(null);

      expect(() => mixer.setCrossfader(0.2)).not.toThrow();
      expect(() => mixer.setMasterVolume(0.5)).not.toThrow();
    });
  });

  describe('crossfader', () => {
    it('empieza en el centro con los dos decks a -3 dB', () => {
      const ctx = new FakeAudioContext();
      const { mixer } = crear(ctx);

      expect(mixer.crossfader()).toBe(0.5);
      // gains: [maestro, volumenA, crossfaderA, volumenB, crossfaderB]
      expect(ctx.gains[2].gain.value).toBeCloseTo(Math.SQRT1_2);
      expect(ctx.gains[4].gain.value).toBeCloseTo(Math.SQRT1_2);
    });

    it('a la izquierda solo suena el deck A', () => {
      const ctx = new FakeAudioContext();
      const { mixer } = crear(ctx);

      mixer.setCrossfader(0);

      expect(ctx.gains[2].gain.value).toBe(1);
      expect(ctx.gains[4].gain.value).toBeCloseTo(0);
    });

    it('a la derecha solo suena el deck B', () => {
      const ctx = new FakeAudioContext();
      const { mixer } = crear(ctx);

      mixer.setCrossfader(1);

      expect(ctx.gains[2].gain.value).toBeCloseTo(0);
      expect(ctx.gains[4].gain.value).toBe(1);
    });

    it('limita la posicion al rango 0-1', () => {
      const { mixer } = crear(new FakeAudioContext());

      mixer.setCrossfader(7);
      expect(mixer.crossfader()).toBe(1);
      mixer.setCrossfader(-7);
      expect(mixer.crossfader()).toBe(0);
    });
  });

  describe('volumen maestro', () => {
    it('ajusta la ganancia del nodo maestro, conectado a los altavoces', () => {
      const ctx = new FakeAudioContext();
      const { mixer } = crear(ctx);

      mixer.setMasterVolume(0.3);

      expect(mixer.masterVolume()).toBe(0.3);
      expect(ctx.gains[0].gain.value).toBe(0.3);
      expect(ctx.gains[0].connections).toEqual([ctx.destination]);
    });

    it('limita el volumen al rango 0-1', () => {
      const { mixer } = crear(new FakeAudioContext());

      mixer.setMasterVolume(5);
      expect(mixer.masterVolume()).toBe(1);
    });
  });

  describe('reanudar el contexto', () => {
    it('reanuda un contexto suspendido', async () => {
      const ctx = new FakeAudioContext();
      const { mixer } = crear(ctx);

      await mixer.resume();

      expect(ctx.resumeCalls).toBe(1);
      expect(ctx.state).toBe('running');
    });

    it('no vuelve a reanudar un contexto que ya corre', async () => {
      const ctx = new FakeAudioContext();
      ctx.state = 'running';
      const { mixer } = crear(ctx);

      await mixer.resume();

      expect(ctx.resumeCalls).toBe(0);
    });
  });

  describe('cargar audio', () => {
    it('loadBuffer carga un audio ya decodificado en el deck indicado', () => {
      const { mixer } = crear(new FakeAudioContext());

      mixer.loadBuffer('B', buffer(8), pista());

      expect(mixer.deck('B').loaded).toBe(true);
      expect(mixer.deck('B').duration).toBe(8);
      expect(mixer.deck('A').loaded).toBe(false);
    });

    it('loadArrayBuffer decodifica los bytes y los carga', async () => {
      const ctx = new FakeAudioContext();
      ctx.decodedSeconds = 42;
      const { mixer } = crear(ctx);

      await mixer.loadArrayBuffer('A', new Uint8Array([1, 2, 3]).buffer, pista());

      expect(mixer.deck('A').duration).toBe(42);
      expect(mixer.deck('A').track()?.id).toBe(1);
    });

    it('si no se puede decodificar lanza AudioDecodeError y no toca el deck', async () => {
      const { mixer } = crear(new FakeAudioContext());
      mixer.loadBuffer('A', buffer(5), pista({ id: 9 }));

      await expect(mixer.loadArrayBuffer('A', new ArrayBuffer(0))).rejects.toBeInstanceOf(AudioDecodeError);

      expect(mixer.deck('A').track()?.id).toBe(9);
    });

    it('loadFile lee un archivo del disco y lo carga sin pista asociada', async () => {
      const { mixer } = crear(new FakeAudioContext());
      const archivo = new File([new Uint8Array([1, 2, 3, 4])], 'tema.wav');

      await mixer.loadFile('A', archivo);

      expect(mixer.deck('A').loaded).toBe(true);
      expect(mixer.deck('A').track()).toBeNull();
    });
  });

  describe('cargar una pista de la biblioteca', () => {
    it('descarga el audio del servidor y lo carga con su pista', async () => {
      const { mixer, http } = crear(new FakeAudioContext());

      const carga = mixer.loadTrack('A', pista({ id: 7 }));
      http.expectOne(`${environment.apiRootUrl}/tracks/7/audio`).flush(new Uint8Array([1, 2, 3]).buffer);
      await carga;

      expect(mixer.deck('A').loaded).toBe(true);
      expect(mixer.deck('A').track()?.id).toBe(7);
      http.verify();
    });

    it('una pista sin audio guardado falla antes de pedir nada al servidor', async () => {
      const { mixer, http } = crear(new FakeAudioContext());

      await expect(mixer.loadTrack('A', pista({ hasAudio: false }))).rejects.toBeInstanceOf(TrackWithoutAudioError);

      http.expectNone(() => true);
    });

    it('si el servidor falla propaga el error y el deck queda como estaba', async () => {
      const { mixer, http } = crear(new FakeAudioContext());

      const carga = mixer.loadTrack('A', pista({ id: 7 }));
      http.expectOne(`${environment.apiRootUrl}/tracks/7/audio`).error(new ProgressEvent('error'), { status: 502 });

      await expect(carga).rejects.toBeTruthy();
      expect(mixer.deck('A').loaded).toBe(false);
    });
  });

  describe('sincronizar tempos', () => {
    it('lleva el deck al tempo del otro', () => {
      const { mixer } = crear(new FakeAudioContext());
      mixer.loadBuffer('A', buffer(), pista({ bpm: 128 }));
      mixer.loadBuffer('B', buffer(), pista({ id: 2, bpm: 124 }));

      const match = mixer.sync('B');

      expect(match?.feasible).toBe(true);
      expect(mixer.deck('B').effectiveBpm).toBeCloseTo(128);
    });

    it('tiene en cuenta el pitch actual del otro deck', () => {
      const { mixer } = crear(new FakeAudioContext());
      mixer.loadBuffer('A', buffer(), pista({ bpm: 120 }));
      mixer.loadBuffer('B', buffer(), pista({ id: 2, bpm: 120 }));
      mixer.deck('A').setPitch(1.05); // A suena a 126

      mixer.sync('B');

      expect(mixer.deck('B').effectiveBpm).toBeCloseTo(126);
    });

    it('si el ajuste no cabe en el fader queda al limite y lo avisa', () => {
      const { mixer } = crear(new FakeAudioContext());
      mixer.loadBuffer('A', buffer(), pista({ bpm: 128 }));
      mixer.loadBuffer('B', buffer(), pista({ id: 2, bpm: 115 })); // pide +11 %

      const match = mixer.sync('B');

      expect(match?.feasible).toBe(false);
      expect(mixer.deck('B').pitch()).toBeCloseTo(1.08);
    });

    it('devuelve null si el otro deck esta vacio', () => {
      const { mixer } = crear(new FakeAudioContext());
      mixer.loadBuffer('B', buffer(), pista());

      expect(mixer.sync('B')).toBeNull();
    });

    it('devuelve null si el deck no tiene una pista con BPM conocido (archivo local)', () => {
      const { mixer } = crear(new FakeAudioContext());
      mixer.loadBuffer('A', buffer(), pista());
      mixer.loadBuffer('B', buffer(), null);

      expect(mixer.sync('B')).toBeNull();
    });
  });
});
