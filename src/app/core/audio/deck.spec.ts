import { Deck, WAVEFORM_PEAKS } from './deck';
import { Track } from '../models/track';
import { EQ_KILL_DB } from './eq';
import { FakeAudioBuffer, FakeAudioContext, FakeAudioNode, FakeBiquadFilterNode } from '../testing/fake-audio';

const pista = (cambios: Partial<Track> = {}): Track => ({
  id: 1, title: 'tema.wav', duration: 10, bpm: 128, key: 'C major', camelot: '8B', energy: 0.6,
  cuePoints: [2, 30], hasAudio: true, createdAt: '2026-10-21T18:30:00+00:00', ...cambios,
});

describe('Deck', () => {
  let ctx: FakeAudioContext;
  let destino: FakeAudioNode;
  let deck: Deck;

  const buffer = (segundos = 10) => new FakeAudioBuffer(segundos) as unknown as AudioBuffer;
  const cargar = (segundos = 10, track: Track | null = pista()) => deck.load(buffer(segundos), track);

  beforeEach(() => {
    ctx = new FakeAudioContext();
    destino = new FakeAudioNode();
    deck = new Deck('A', ctx as unknown as AudioContext, destino as unknown as AudioNode);
  });

  describe('estado inicial', () => {
    it('empieza vacio y detenido', () => {
      expect(deck.loaded).toBe(false);
      expect(deck.playing()).toBe(false);
      expect(deck.duration).toBe(0);
      expect(deck.position()).toBe(0);
      expect(deck.track()).toBeNull();
      expect(deck.effectiveBpm).toBeNull();
    });

    it('arranca con pitch normal, volumen al maximo y EQ plano', () => {
      expect(deck.pitch()).toBe(1);
      expect(deck.volume()).toBe(1);
      expect(deck.eq()).toEqual({ low: 0.5, mid: 0.5, high: 0.5 });
    });

    it('conecta EQ grave, medio y agudo, volumen y crossfader hacia el destino', () => {
      // 3 filtros + 2 ganancias creados por el deck.
      expect(ctx.filters.length).toBe(3);
      expect(ctx.gains.length).toBe(2);
      const [grave, medio, agudo] = ctx.filters;
      const [volumen, crossfader] = ctx.gains;
      expect(grave.connections).toEqual([medio]);
      expect(medio.connections).toEqual([agudo]);
      expect(agudo.connections).toEqual([volumen]);
      expect(volumen.connections).toEqual([crossfader]);
      expect(crossfader.connections).toEqual([destino]);
    });

    it('configura los filtros del EQ como un mixer de DJ', () => {
      const [grave, medio, agudo] = ctx.filters;

      expect([grave.type, medio.type, agudo.type]).toEqual(['lowshelf', 'peaking', 'highshelf']);
      expect([grave.frequency.value, medio.frequency.value, agudo.frequency.value]).toEqual([320, 1000, 3200]);
    });
  });

  describe('cargar', () => {
    it('carga una pista y deja el deck detenido al principio', () => {
      cargar(10);

      expect(deck.loaded).toBe(true);
      expect(deck.duration).toBe(10);
      expect(deck.position()).toBe(0);
      expect(deck.playing()).toBe(false);
      expect(deck.track()?.title).toBe('tema.wav');
    });

    it('el punto cue inicial es el primer punto de mezcla de la pista', () => {
      cargar(10, pista({ cuePoints: [2, 30] }));

      expect(deck.cuePoint()).toBe(2);
    });

    it('sin puntos de mezcla el cue inicial es el principio', () => {
      cargar(10, pista({ cuePoints: [] }));

      expect(deck.cuePoint()).toBe(0);
    });

    it('al cargar otra pista detiene la que sonaba', () => {
      cargar();
      deck.play();
      const primera = ctx.lastSource;

      cargar();

      expect(primera.stopped).toBe(true);
      expect(deck.playing()).toBe(false);
      expect(deck.position()).toBe(0);
    });

    it('expulsar vacia el deck', () => {
      cargar();
      deck.play();

      deck.eject();

      expect(deck.loaded).toBe(false);
      expect(deck.playing()).toBe(false);
      expect(deck.track()).toBeNull();
    });
  });

  describe('forma de onda', () => {
    it('sin pista no hay picos', () => {
      expect(deck.peaks()).toBeNull();
    });

    it('al cargar una pista calcula los picos normalizados', () => {
      const audio = new FakeAudioBuffer(2);
      audio.getChannelData(0).fill(0.25);
      deck.load(audio as unknown as AudioBuffer, pista());

      const picos = deck.peaks();

      expect(picos?.length).toBe(WAVEFORM_PEAKS);
      expect(Math.max(...(picos ?? []))).toBe(1);
    });

    it('un audio en silencio da picos en cero', () => {
      cargar();

      expect(Math.max(...(deck.peaks() ?? [1]))).toBe(0);
    });

    it('expulsar la pista borra los picos', () => {
      cargar();

      deck.eject();

      expect(deck.peaks()).toBeNull();
    });
  });

  describe('reproducir y pausar', () => {
    it('play sin pista cargada no hace nada', () => {
      deck.play();

      expect(deck.playing()).toBe(false);
      expect(ctx.sources.length).toBe(0);
    });

    it('play inicia una fuente desde el principio conectada al EQ', () => {
      cargar();

      deck.play();

      expect(deck.playing()).toBe(true);
      expect(ctx.lastSource.startedWith).toEqual([0, 0]);
      expect(ctx.lastSource.connections).toEqual([ctx.filters[0]]);
    });

    it('play reanuda el contexto suspendido (hace falta un gesto del usuario)', () => {
      cargar();

      deck.play();

      expect(ctx.resumeCalls).toBe(1);
    });

    it('play dos veces seguidas no crea una segunda fuente', () => {
      cargar();

      deck.play();
      deck.play();

      expect(ctx.sources.length).toBe(1);
    });

    it('la posicion avanza con el reloj del contexto', () => {
      cargar();
      deck.play();

      ctx.currentTime = 3.5;

      expect(deck.position()).toBeCloseTo(3.5);
    });

    it('pause guarda la posicion y detiene la fuente', () => {
      cargar();
      deck.play();
      ctx.currentTime = 4;

      deck.pause();

      expect(deck.playing()).toBe(false);
      expect(deck.position()).toBeCloseTo(4);
      expect(ctx.lastSource.stopped).toBe(true);
      // Aunque pase el tiempo, la posicion pausada no cambia.
      ctx.currentTime = 9;
      expect(deck.position()).toBeCloseTo(4);
    });

    it('al reanudar tras una pausa continua desde donde se quedo', () => {
      cargar();
      deck.play();
      ctx.currentTime = 4;
      deck.pause();

      ctx.currentTime = 20;
      deck.play();

      expect(ctx.lastSource.startedWith).toEqual([0, 4]);
      ctx.currentTime = 22;
      expect(deck.position()).toBeCloseTo(6);
    });

    it('pause con el deck detenido no hace nada', () => {
      cargar();

      deck.pause();

      expect(ctx.sources.length).toBe(0);
    });

    it('la posicion no supera la duracion', () => {
      cargar(10);
      deck.play();

      ctx.currentTime = 100;

      expect(deck.position()).toBe(10);
    });

    it('al llegar la fuente al final el deck se detiene en el final', () => {
      cargar(10);
      deck.play();
      ctx.currentTime = 10;

      ctx.lastSource.finish();

      expect(deck.playing()).toBe(false);
      expect(deck.position()).toBe(10);
    });

    it('play desde el final vuelve a empezar la pista', () => {
      cargar(10);
      deck.play();
      ctx.lastSource.finish();

      deck.play();

      expect(deck.playing()).toBe(true);
      expect(ctx.lastSource.startedWith).toEqual([0, 0]);
    });

    it('detener una fuente al pausar no se interpreta como el fin de la pista', () => {
      cargar();
      deck.play();
      ctx.currentTime = 4;

      deck.pause();

      // stop() de la fuente real dispara "ended"; el deck debe conservar la posicion de la pausa.
      expect(deck.position()).toBeCloseTo(4);
    });
  });

  describe('buscar (seek)', () => {
    it('con el deck detenido mueve la posicion sin sonar', () => {
      cargar(10);

      deck.seek(6);

      expect(deck.position()).toBe(6);
      expect(deck.playing()).toBe(false);
      expect(ctx.sources.length).toBe(0);
    });

    it('con el deck sonando reinicia la fuente desde el nuevo punto', () => {
      cargar(10);
      deck.play();
      const primera = ctx.lastSource;
      ctx.currentTime = 2;

      deck.seek(7);

      expect(primera.stopped).toBe(true);
      expect(ctx.lastSource).not.toBe(primera);
      expect(ctx.lastSource.startedWith).toEqual([0, 7]);
      expect(deck.playing()).toBe(true);
      expect(deck.position()).toBeCloseTo(7);
    });

    it('limita el salto al rango de la pista', () => {
      cargar(10);

      deck.seek(-5);
      expect(deck.position()).toBe(0);
      deck.seek(99);
      expect(deck.position()).toBe(10);
    });

    it('sin pista cargada no hace nada', () => {
      deck.seek(5);

      expect(deck.position()).toBe(0);
    });

    it('el fin de la fuente reemplazada al saltar no detiene el deck', () => {
      cargar(10);
      deck.play();
      const vieja = ctx.lastSource;

      deck.seek(5);
      vieja.finish(); // evento tardio de una fuente que ya no es la vigente

      expect(deck.playing()).toBe(true);
    });
  });

  describe('punto cue', () => {
    it('setCue guarda la posicion actual', () => {
      cargar(10);
      deck.seek(4.5);

      deck.setCue();

      expect(deck.cuePoint()).toBe(4.5);
    });

    it('goToCue vuelve al punto guardado sin cambiar si sonaba', () => {
      cargar(10);
      deck.seek(3);
      deck.setCue();
      deck.play();
      ctx.currentTime = 5;

      deck.goToCue();

      expect(deck.position()).toBeCloseTo(3);
      expect(deck.playing()).toBe(true);
    });
  });

  describe('pitch', () => {
    it('cambia la velocidad de la fuente que suena', () => {
      cargar();
      deck.play();

      deck.setPitch(1.05);

      expect(deck.pitch()).toBe(1.05);
      expect(ctx.lastSource.playbackRate.value).toBe(1.05);
    });

    it('limita el pitch al rango del fader (+-8 %)', () => {
      deck.setPitch(2);
      expect(deck.pitch()).toBeCloseTo(1.08);

      deck.setPitch(0.1);
      expect(deck.pitch()).toBeCloseTo(0.92);
    });

    it('la posicion avanza mas rapido con mas pitch', () => {
      cargar(100);
      deck.setPitch(1.08);
      deck.play();

      ctx.currentTime = 10;

      expect(deck.position()).toBeCloseTo(10.8);
    });

    it('cambiar el pitch mientras suena no provoca un salto de posicion', () => {
      cargar(100);
      deck.play();
      ctx.currentTime = 10;
      const antes = deck.position();

      deck.setPitch(1.08);

      expect(deck.position()).toBeCloseTo(antes);
      ctx.currentTime = 20;
      expect(deck.position()).toBeCloseTo(10 + 10 * 1.08);
    });

    it('la nueva reproduccion usa el pitch actual', () => {
      cargar();
      deck.setPitch(0.95);

      deck.play();

      expect(ctx.lastSource.playbackRate.value).toBe(0.95);
    });

    it('el BPM efectivo es el de la pista por el pitch', () => {
      cargar(10, pista({ bpm: 120 }));
      deck.setPitch(1.05);

      expect(deck.effectiveBpm).toBeCloseTo(126);
    });
  });

  describe('volumen y crossfader', () => {
    const [indiceVolumen, indiceCrossfader] = [0, 1];

    it('setVolume ajusta la ganancia del deck', () => {
      deck.setVolume(0.4);

      expect(deck.volume()).toBe(0.4);
      expect(ctx.gains[indiceVolumen].gain.value).toBe(0.4);
    });

    it('limita el volumen entre 0 y 1', () => {
      deck.setVolume(3);
      expect(deck.volume()).toBe(1);
      deck.setVolume(-1);
      expect(deck.volume()).toBe(0);
    });

    it('setCrossfaderGain fija la ganancia del nodo de crossfader, limitada entre 0 y 1', () => {
      deck.setCrossfaderGain(0.7);
      expect(ctx.gains[indiceCrossfader].gain.value).toBe(0.7);

      deck.setCrossfaderGain(5);
      expect(ctx.gains[indiceCrossfader].gain.value).toBe(1);
    });
  });

  describe('ecualizador', () => {
    const filtro = (banda: 'low' | 'mid' | 'high'): FakeBiquadFilterNode =>
      ctx.filters[{ low: 0, mid: 1, high: 2 }[banda]];

    it('al minimo corta la banda', () => {
      deck.setEq('low', 0);

      expect(filtro('low').gain.value).toBe(EQ_KILL_DB);
      expect(deck.eq().low).toBe(0);
    });

    it('en el centro deja la banda plana y al maximo la realza', () => {
      deck.setEq('mid', 0.5);
      expect(filtro('mid').gain.value).toBe(0);

      deck.setEq('mid', 1);
      expect(filtro('mid').gain.value).toBe(6);
    });

    it('cada banda es independiente de las demas', () => {
      deck.setEq('low', 0);

      expect(filtro('mid').gain.value).toBe(0);
      expect(filtro('high').gain.value).toBe(0);
      expect(deck.eq()).toEqual({ low: 0, mid: 0.5, high: 0.5 });
    });

    it('limita los valores fuera de rango', () => {
      deck.setEq('high', 9);

      expect(deck.eq().high).toBe(1);
    });
  });
});
