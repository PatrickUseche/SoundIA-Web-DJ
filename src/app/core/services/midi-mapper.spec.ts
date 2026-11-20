import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { MIDI_MAPPING_STORAGE, MIDI_MAPPING_STORAGE_KEY, MidiMapperService } from './midi-mapper';
import { MidiService } from './midi';
import { MixerService } from './mixer';
import { Track } from '../models/track';
import { FakeAudioBuffer, FakeAudioContext, provideFakeAudio } from '../testing/fake-audio';
import { FakeMidiAccess, FakeMidiInput, provideFakeMidi } from '../testing/fake-midi';

const trackItem = (id: number, bpm = 128): Track => ({
  id, title: `pista ${id}`, duration: 100, bpm, key: 'C major', camelot: '8B', energy: 0.6,
  cuePoints: [10], hasAudio: true, createdAt: 'x',
});

/** Almacenamiento de mentira en memoria. */
class FakeStorage {
  datos = new Map<string, string>();
  fallar = false;
  getItem(clave: string): string | null {
    return this.datos.get(clave) ?? null;
  }
  setItem(clave: string, rawValue: string): void {
    if (this.fallar) {
      throw new DOMException('lleno', 'QuotaExceededError');
    }
    this.datos.set(clave, rawValue);
  }
}

describe('MidiMapperService', () => {
  let ctx: FakeAudioContext;
  let controlador: FakeMidiInput;
  let storage: FakeStorage;
  let mapper: MidiMapperService;
  let mixer: MixerService;

  async function crear(opciones: { audio?: boolean; guardado?: unknown } = {}) {
    ctx = new FakeAudioContext();
    controlador = new FakeMidiInput('ddj');
    storage = new FakeStorage();
    if (opciones.guardado !== undefined) {
      storage.datos.set(MIDI_MAPPING_STORAGE_KEY, typeof opciones.guardado === 'string' ? opciones.guardado : JSON.stringify(opciones.guardado));
    }
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(), provideHttpClientTesting(),
        provideFakeAudio(opciones.audio === false ? null : ctx),
        provideFakeMidi(new FakeMidiAccess([controlador])),
        { provide: MIDI_MAPPING_STORAGE, useValue: storage },
      ],
    });
    mapper = TestBed.inject(MidiMapperService);
    mixer = TestBed.inject(MixerService);
    await TestBed.inject(MidiService).requestAccess();
    mapper.start();
  }

  const mover = (cc: number, rawValue: number) => controlador.send(0xb0, cc, rawValue);
  const pulsar = (nota: number) => controlador.send(0x90, nota, 100);
  const cargarEnA = () => mixer.loadBuffer('A', new FakeAudioBuffer(100) as unknown as AudioBuffer, trackItem(1));

  describe('aprender asignaciones', () => {
    beforeEach(() => crear());

    it('empieza sin asignaciones y sin aprender', () => {
      expect(mapper.mapping()).toEqual({});
      expect(mapper.learning()).toBeNull();
    });

    it('al mover un control del aparato en modo aprender lo asigna al control elegido', () => {
      mapper.startLearning('crossfader');

      mover(14, 64);

      expect(mapper.mapping()).toEqual({ '0:14': 'crossfader' });
      expect(mapper.assignedTo('crossfader')).toEqual({ channel: 0, controlId: 14 });
      expect(mapper.learning()).toBeNull();
    });

    it('el movimiento que sirve para asignar no se aplica al mezclador', () => {
      mapper.startLearning('crossfader');

      mover(14, 127);

      expect(mixer.crossfader()).toBe(0.5);
    });

    it('las notas (botones) tambien se pueden asignar', () => {
      mapper.startLearning('A.play');

      pulsar(36);

      expect(mapper.mapping()).toEqual({ '0:164': 'A.play' });
    });

    it('un boton no se asigna con la liberacion (valor 0) de la pulsacion anterior', () => {
      mapper.startLearning('A.play');

      mover(20, 0); // liberacion
      expect(mapper.learning()).toBe('A.play');
      mover(20, 127); // pulsacion de verdad

      expect(mapper.mapping()).toEqual({ '0:20': 'A.play' });
    });

    it('un fader si se puede asignar con el valor 0', () => {
      mapper.startLearning('A.volume');

      mover(7, 0);

      expect(mapper.mapping()).toEqual({ '0:7': 'A.volume' });
    });

    it('reasignar un control quita su asignacion anterior', () => {
      mapper.startLearning('crossfader');
      mover(14, 64);
      mapper.startLearning('crossfader');

      mover(15, 64);

      expect(mapper.mapping()).toEqual({ '0:15': 'crossfader' });
    });

    it('un mismo control del aparato solo controla una cosa: la ultima asignacion gana', () => {
      mapper.startLearning('crossfader');
      mover(14, 64);
      mapper.startLearning('masterVolume');

      mover(14, 64);

      expect(mapper.mapping()).toEqual({ '0:14': 'masterVolume' });
      expect(mapper.assignedTo('crossfader')).toBeNull();
    });

    it('cancelar el modo aprender no asigna nada', () => {
      mapper.startLearning('crossfader');

      mapper.cancelLearning();
      mover(14, 64);

      expect(mapper.mapping()).toEqual({});
    });

    it('un control sin asignar devuelve null', () => {
      expect(mapper.assignedTo('B.eq.low')).toBeNull();
    });
  });

  describe('quitar asignaciones', () => {
    beforeEach(() => crear({ guardado: { 14: 'crossfader', 7: 'A.volume' } }));

    it('clear quita solo la asignación de ese control', () => {
      mapper.clear('crossfader');

      expect(mapper.mapping()).toEqual({ 7: 'A.volume' });
    });

    it('clear de un control sin asignar no hace nada', () => {
      mapper.clear('B.pitch');

      expect(Object.keys(mapper.mapping()).length).toBe(2);
    });

    it('reset borra todo y cancela el modo aprender', () => {
      mapper.startLearning('masterVolume');

      mapper.reset();

      expect(mapper.mapping()).toEqual({});
      expect(mapper.learning()).toBeNull();
    });
  });

  describe('controlar el mezclador', () => {
    beforeEach(async () => {
      await crear({
        guardado: {
          1: 'crossfader', 2: 'masterVolume', 3: 'A.volume', 4: 'A.pitch', 5: 'A.eq.low', 6: 'B.eq.high',
          7: 'B.volume', 8: 'A.play', 9: 'A.cue', 10: 'B.sync',
        },
      });
    });

    it('un fader asignado al crossfader lo mueve de 0 a 1', () => {
      mover(1, 0);
      expect(mixer.crossfader()).toBe(0);
      mover(1, 127);
      expect(mixer.crossfader()).toBe(1);
      mover(1, 64);
      expect(mixer.crossfader()).toBeCloseTo(0.504, 2);
    });

    it('el volumen maestro sigue al fader', () => {
      mover(2, 127);
      expect(mixer.masterVolume()).toBe(1);
      mover(2, 0);
      expect(mixer.masterVolume()).toBe(0);
    });

    it('el volumen de un deck sigue al fader', () => {
      mover(3, 0);
      expect(mixer.deck('A').volume()).toBe(0);
      mover(7, 127);
      expect(mixer.deck('B').volume()).toBe(1);
    });

    it('el pitch recorre de -8 % a +8 % y el centro es 1', () => {
      mover(4, 0);
      expect(mixer.deck('A').pitch()).toBeCloseTo(0.92);
      mover(4, 127);
      expect(mixer.deck('A').pitch()).toBeCloseTo(1.08);
      mover(4, 64);
      expect(mixer.deck('A').pitch()).toBe(1);
    });

    it('el EQ de una banda solo cambia esa banda de ese deck', () => {
      mover(5, 0);

      expect(mixer.deck('A').eq()).toEqual({ low: 0, mid: 0.5, high: 0.5 });
      expect(mixer.deck('B').eq()).toEqual({ low: 0.5, mid: 0.5, high: 0.5 });
      mover(6, 127);
      expect(mixer.deck('B').eq().high).toBe(1);
    });

    it('un control sin asignar se ignora', () => {
      mover(99, 127);

      expect(mixer.crossfader()).toBe(0.5);
    });
  });

  describe('botones', () => {
    beforeEach(async () => {
      await crear({ guardado: { 8: 'A.play', 9: 'A.cue', 10: 'B.sync', 11: 'A.volume' } });
    });

    it('play reproduce y pulsarlo otra vez pausa', async () => {
      cargarEnA();

      mover(8, 127);
      await Promise.resolve();
      await Promise.resolve();
      expect(mixer.deck('A').playing()).toBe(true);

      mover(8, 127);
      expect(mixer.deck('A').playing()).toBe(false);
    });

    it('soltar el boton (valor 0) no hace nada', async () => {
      cargarEnA();

      mover(8, 0);
      await Promise.resolve();

      expect(mixer.deck('A').playing()).toBe(false);
    });

    it('play sin pista cargada no hace nada ni falla', async () => {
      expect(() => mover(8, 127)).not.toThrow();
      await Promise.resolve();

      expect(mixer.deck('A').playing()).toBe(false);
    });

    it('cue salta al punto cue de la pista', () => {
      cargarEnA();
      mixer.deck('A').seek(80);

      mover(9, 127);

      expect(mixer.deck('A').position()).toBe(10);
    });

    it('sync iguala el tempo con el otro deck', () => {
      mixer.loadBuffer('A', new FakeAudioBuffer(100) as unknown as AudioBuffer, trackItem(1, 128));
      mixer.loadBuffer('B', new FakeAudioBuffer(100) as unknown as AudioBuffer, trackItem(2, 124));

      mover(10, 127);

      expect(mixer.deck('B').effectiveBpm).toBeCloseTo(128);
    });

    it('las notas funcionan igual que los CC para los botones', async () => {
      TestBed.resetTestingModule();
      await crear({ guardado: { 164: 'A.play' } });
      cargarEnA();

      pulsar(36);
      await Promise.resolve();
      await Promise.resolve();

      expect(mixer.deck('A').playing()).toBe(true);
    });
  });

  describe('sin Web Audio', () => {
    it('los movimientos se ignoran sin fallar', async () => {
      await crear({ audio: false, guardado: { 1: 'crossfader', 8: 'A.play' } });

      expect(() => mover(1, 127)).not.toThrow();
      expect(() => mover(8, 127)).not.toThrow();
    });
  });

  describe('iniciar y detener', () => {
    it('start dos veces no aplica cada movimiento dos veces', async () => {
      await crear({ guardado: { 1: 'crossfader' } });
      mapper.start();
      const changes: number[] = [];
      const original = mixer.setCrossfader.bind(mixer);
      mixer.setCrossfader = (v: number) => {
        changes.push(v);
        original(v);
      };

      mover(1, 127);

      expect(changes.length).toBe(1);
    });

    it('tras detenerlo deja de reaccionar al aparato', async () => {
      await crear({ guardado: { 1: 'crossfader' } });

      mapper.stop();
      mover(1, 127);

      expect(mixer.crossfader()).toBe(0.5);
    });

    it('detenerlo cancela el modo aprender', async () => {
      await crear();
      mapper.startLearning('crossfader');

      mapper.stop();

      expect(mapper.learning()).toBeNull();
    });
  });

  describe('persistencia', () => {
    it('guarda la asignacion al aprenderla', async () => {
      await crear();

      mapper.startLearning('crossfader');
      mover(14, 64);

      expect(JSON.parse(storage.datos.get(MIDI_MAPPING_STORAGE_KEY) ?? 'null')).toEqual({ '0:14': 'crossfader' });
    });

    it('guarda tambien al quitar y al restablecer', async () => {
      await crear({ guardado: { 14: 'crossfader', 7: 'A.volume' } });

      mapper.clear('crossfader');
      expect(JSON.parse(storage.datos.get(MIDI_MAPPING_STORAGE_KEY)!)).toEqual({ 7: 'A.volume' });
      mapper.reset();
      expect(JSON.parse(storage.datos.get(MIDI_MAPPING_STORAGE_KEY)!)).toEqual({});
    });

    it('recupera la asignacion guardada al iniciar', async () => {
      await crear({ guardado: { 14: 'crossfader', 164: 'B.play' } });

      expect(mapper.mapping()).toEqual({ 14: 'crossfader', 164: 'B.play' });
    });

    it('descarta lo invalido del almacenamiento y conserva lo valido', async () => {
      await crear({ guardado: { 14: 'crossfader', 15: 'no-existe', 999: 'A.volume', '-3': 'A.volume', abc: 'A.volume' } });

      expect(mapper.mapping()).toEqual({ 14: 'crossfader' });
    });

    it('un almacenamiento corrupto no impide arrancar', async () => {
      await crear({ guardado: '{esto no es json' });

      expect(mapper.mapping()).toEqual({});
    });

    it('un almacenamiento que no es un objeto se ignora', async () => {
      await crear({ guardado: [1, 2, 3] });

      expect(mapper.mapping()).toEqual({});
    });

    it('si guardar falla la asignacion sigue funcionando en la sesion', async () => {
      await crear();
      storage.fallar = true;

      mapper.startLearning('crossfader');
      mover(14, 64);

      expect(mapper.mapping()).toEqual({ '0:14': 'crossfader' });
    });
  });

  describe('canal MIDI', () => {
    const moverEnCanal = (canal: number, cc: number, rawValue: number) => controlador.send(0xb0 | canal, cc, rawValue);

    it('el mismo CC en canales distintos se asigna a controles distintos', async () => {
      await crear();

      mapper.startLearning('A.volume');
      moverEnCanal(0, 7, 64);
      mapper.startLearning('B.volume');
      moverEnCanal(1, 7, 64);

      expect(mapper.mapping()).toEqual({ '0:7': 'A.volume', '1:7': 'B.volume' });
      expect(mapper.assignedTo('A.volume')).toEqual({ channel: 0, controlId: 7 });
      expect(mapper.assignedTo('B.volume')).toEqual({ channel: 1, controlId: 7 });
    });

    it('cada canal mueve solo su control', async () => {
      await crear({ guardado: { '0:7': 'A.volume', '1:7': 'B.volume' } });

      moverEnCanal(0, 7, 0);
      expect(mixer.deck('A').volume()).toBe(0);
      expect(mixer.deck('B').volume()).toBe(1);

      moverEnCanal(1, 7, 0);
      expect(mixer.deck('B').volume()).toBe(0);
    });

    it('un canal sin asignar no mueve nada', async () => {
      await crear({ guardado: { '0:7': 'A.volume' } });

      moverEnCanal(3, 7, 0);

      expect(mixer.deck('A').volume()).toBe(1);
    });

    it('una asignacion guardada sin canal vale para cualquier canal', async () => {
      await crear({ guardado: { 7: 'A.volume' } });

      moverEnCanal(5, 7, 0);

      expect(mixer.deck('A').volume()).toBe(0);
      expect(mapper.assignedTo('A.volume')).toEqual({ channel: null, controlId: 7 });
    });

    it('la asignación de un canal concreto gana sobre la de cualquier canal', async () => {
      await crear({ guardado: { 7: 'A.volume', '1:7': 'B.volume' } });

      moverEnCanal(1, 7, 0);
      expect(mixer.deck('B').volume()).toBe(0);
      expect(mixer.deck('A').volume()).toBe(1);

      moverEnCanal(0, 7, 0);
      expect(mixer.deck('A').volume()).toBe(0);
    });

    it('reasignar con otro canal reemplaza la asignacion anterior del control', async () => {
      await crear();

      mapper.startLearning('A.volume');
      moverEnCanal(0, 7, 64);
      mapper.startLearning('A.volume');
      moverEnCanal(2, 7, 64);

      expect(mapper.mapping()).toEqual({ '2:7': 'A.volume' });
    });

    it('guarda y recupera las asignaciones con su canal', async () => {
      await crear();
      mapper.startLearning('A.volume');
      moverEnCanal(4, 9, 64);

      expect(JSON.parse(storage.datos.get(MIDI_MAPPING_STORAGE_KEY) ?? 'null')).toEqual({ '4:9': 'A.volume' });
    });

    it('al cargar descarta los canales fuera de rango y normaliza las claves', async () => {
      await crear({ guardado: { '2:7': 'A.volume', '16:7': 'B.volume', 'x:7': 'B.pitch', '1:300': 'B.cue', '007': 'crossfader' } });

      expect(mapper.mapping()).toEqual({ '2:7': 'A.volume', 7: 'crossfader' });
    });
  });
});
