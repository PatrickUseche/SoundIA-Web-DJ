import { TestBed } from '@angular/core/testing';
import { MidiService } from './midi';
import { FakeMidiAccess, FakeMidiInput, provideFakeMidi } from '../testing/fake-midi';
import { MidiEvent } from './telemetry';

function crear(access: FakeMidiAccess | null, error?: Error): MidiService {
  TestBed.configureTestingModule({ providers: [provideFakeMidi(access, error)] });
  return TestBed.inject(MidiService);
}

describe('MidiService', () => {
  describe('acceso al navegador', () => {
    it('empieza en idle cuando el navegador soporta Web MIDI', () => {
      expect(crear(new FakeMidiAccess()).state()).toBe('idle');
    });

    it('se marca como unsupported si el navegador no tiene Web MIDI', async () => {
      const service = crear(null);

      expect(service.state()).toBe('unsupported');
      await service.requestAccess();
      expect(service.state()).toBe('unsupported');
    });

    it('pasa a ready cuando el usuario concede el permiso', async () => {
      const service = crear(new FakeMidiAccess());

      await service.requestAccess();

      expect(service.state()).toBe('ready');
    });

    it('indica requesting mientras espera el permiso', async () => {
      const service = crear(new FakeMidiAccess());

      const promesa = service.requestAccess();
      expect(service.state()).toBe('requesting');
      await promesa;
    });

    it('pasa a denied si el permiso se niega', async () => {
      const service = crear(null, new DOMException('denegado', 'SecurityError'));

      await service.requestAccess();

      expect(service.state()).toBe('denied');
    });

    it('pasa a error ante un fallo inesperado', async () => {
      const service = crear(null, new Error('algo raro'));

      await service.requestAccess();

      expect(service.state()).toBe('error');
    });
  });

  describe('dispositivos', () => {
    it('lista los controladores conectados', async () => {
      const service = crear(
        new FakeMidiAccess([new FakeMidiInput('a', 'DDJ-400'), new FakeMidiInput('b', 'Launchpad')]),
      );

      await service.requestAccess();

      expect(service.inputs()).toEqual([
        { id: 'a', name: 'DDJ-400' },
        { id: 'b', name: 'Launchpad' },
      ]);
    });

    it('usa un nombre generico si el dispositivo no informa el suyo', async () => {
      const service = crear(new FakeMidiAccess([new FakeMidiInput('a', null)]));

      await service.requestAccess();

      expect(service.inputs()[0].name).toBe('Controlador MIDI');
    });

    it('no lista los dispositivos desconectados', async () => {
      const apagado = new FakeMidiInput('b');
      apagado.state = 'disconnected';
      const service = crear(new FakeMidiAccess([new FakeMidiInput('a'), apagado]));

      await service.requestAccess();

      expect(service.inputs().map((i) => i.id)).toEqual(['a']);
    });

    it('con un unico controlador lo selecciona automaticamente', async () => {
      const service = crear(new FakeMidiAccess([new FakeMidiInput('a')]));

      await service.requestAccess();

      expect(service.selectedInputId()).toBe('a');
    });

    it('con varios controladores no elige ninguno hasta que el usuario lo haga', async () => {
      const service = crear(new FakeMidiAccess([new FakeMidiInput('a'), new FakeMidiInput('b')]));

      await service.requestAccess();

      expect(service.selectedInputId()).toBeNull();
    });

    it('detecta un controlador enchufado con la pagina abierta', async () => {
      const access = new FakeMidiAccess();
      const service = crear(access);
      await service.requestAccess();
      expect(service.inputs().length).toBe(0);

      access.plug(new FakeMidiInput('nuevo', 'DDJ-400'));

      expect(service.inputs()).toEqual([{ id: 'nuevo', name: 'DDJ-400' }]);
      expect(service.selectedInputId()).toBe('nuevo');
    });

    it('al desenchufar el controlador escuchado deja de haber seleccion si quedan varios', async () => {
      const access = new FakeMidiAccess([
        new FakeMidiInput('a'),
        new FakeMidiInput('b'),
        new FakeMidiInput('c'),
      ]);
      const service = crear(access);
      await service.requestAccess();
      service.selectInput('a');

      access.unplug('a');

      expect(service.selectedInputId()).toBeNull();
      expect(service.inputs().map((i) => i.id)).toEqual(['b', 'c']);
    });

    it('si tras desenchufar queda un unico controlador, pasa a escucharlo', async () => {
      const access = new FakeMidiAccess([new FakeMidiInput('a'), new FakeMidiInput('b')]);
      const service = crear(access);
      await service.requestAccess();
      service.selectInput('a');

      access.unplug('a');

      expect(service.selectedInputId()).toBe('b');
    });
  });

  describe('eventos', () => {
    async function conectado() {
      const input = new FakeMidiInput('a');
      const service = crear(new FakeMidiAccess([input]));
      const recibidos: MidiEvent[] = [];
      service.events$.subscribe((e) => recibidos.push(e));
      await service.requestAccess();
      return { service, input, recibidos };
    }

    it('emite los movimientos de control del controlador seleccionado', async () => {
      const { input, recibidos } = await conectado();

      input.send(0xb0, 14, 127);
      input.send(0xb0, 14, 64);

      expect(recibidos).toEqual([
        { controlId: 14, value: 127 },
        { controlId: 14, value: 64 },
      ]);
    });

    it('ignora los mensajes que no son de control', async () => {
      const { input, recibidos } = await conectado();

      input.send(0xf8); // reloj
      input.send(0x90, 36, 0); // nota soltada
      input.send(0xb0, 14);

      expect(recibidos).toEqual([]);
    });

    it('emite tambien las notas pulsadas con su desplazamiento', async () => {
      const { input, recibidos } = await conectado();

      input.send(0x90, 36, 100);

      expect(recibidos).toEqual([{ controlId: 164, value: 100 }]);
    });

    it('al cambiar de controlador deja de escuchar el anterior', async () => {
      const a = new FakeMidiInput('a');
      const b = new FakeMidiInput('b');
      const service = crear(new FakeMidiAccess([a, b]));
      const recibidos: MidiEvent[] = [];
      service.events$.subscribe((e) => recibidos.push(e));
      await service.requestAccess();

      service.selectInput('a');
      service.selectInput('b');
      a.send(0xb0, 1, 10);
      b.send(0xb0, 2, 20);

      expect(recibidos).toEqual([{ controlId: 2, value: 20 }]);
      expect(a.onmidimessage).toBeNull();
    });

    it('seleccionar null deja de escuchar', async () => {
      const { service, input, recibidos } = await conectado();

      service.selectInput(null);
      input.send(0xb0, 14, 127);

      expect(recibidos).toEqual([]);
      expect(service.selectedInputId()).toBeNull();
    });

    it('un id desconocido no selecciona nada', async () => {
      const { service } = await conectado();

      service.selectInput('no-existe');

      expect(service.selectedInputId()).toBeNull();
    });
  });
});
