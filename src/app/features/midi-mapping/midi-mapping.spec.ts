import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { MidiMappingComponent } from './midi-mapping';
import { MIDI_MAPPING_STORAGE, MIDI_MAPPING_STORAGE_KEY, MidiMapperService } from '../../core/services/midi-mapper';
import { MidiService } from '../../core/services/midi';
import { MixerService } from '../../core/services/mixer';
import { FakeAudioContext, provideFakeAudio } from '../../core/testing/fake-audio';
import { FakeMidiAccess, FakeMidiInput, provideFakeMidi } from '../../core/testing/fake-midi';

describe('MidiMappingComponent', () => {
  let fixture: ComponentFixture<MidiMappingComponent>;
  let controlador: FakeMidiInput;
  let almacen: Map<string, string>;
  let mapper: MidiMapperService;
  let mixer: MixerService;

  const el = () => fixture.nativeElement as HTMLElement;
  const fila = (texto: string) =>
    Array.from(el().querySelectorAll('tbody tr')).find((tr) => tr.querySelector('td')?.textContent?.trim() === texto)!;
  const boton = (texto: string, clase: string) => fila(texto).querySelector(`button.${clase}`) as HTMLButtonElement | null;

  async function crear(opciones: { conectado?: boolean; guardado?: Record<number, string> } = {}) {
    controlador = new FakeMidiInput('ddj');
    almacen = new Map();
    if (opciones.guardado) {
      almacen.set(MIDI_MAPPING_STORAGE_KEY, JSON.stringify(opciones.guardado));
    }
    TestBed.configureTestingModule({
      imports: [MidiMappingComponent],
      providers: [
        provideHttpClient(), provideHttpClientTesting(), provideFakeAudio(new FakeAudioContext()),
        provideFakeMidi(new FakeMidiAccess(opciones.conectado === false ? [] : [controlador])),
        {
          provide: MIDI_MAPPING_STORAGE,
          useValue: { getItem: (k: string) => almacen.get(k) ?? null, setItem: (k: string, v: string) => almacen.set(k, v) },
        },
      ],
    });
    mapper = TestBed.inject(MidiMapperService);
    mixer = TestBed.inject(MixerService);
    await TestBed.inject(MidiService).requestAccess();
    fixture = TestBed.createComponent(MidiMappingComponent);
    fixture.detectChanges();
  }

  const refrescar = () => fixture.detectChanges();

  describe('lista de controles', () => {
    beforeEach(() => crear());

    it('muestra una fila por cada control del mezclador', () => {
      expect(el().querySelectorAll('tbody tr').length).toBe(18);
    });

    it('nombra los controles en espanol', () => {
      for (const nombre of ['Crossfader', 'Volumen maestro', 'Deck A: volumen', 'Deck B: EQ graves', 'Deck A: play/pausa']) {
        expect(fila(nombre)).toBeDefined();
      }
    });

    it('al principio todos estan sin asignar', () => {
      const asignaciones = Array.from(el().querySelectorAll('.asignacion')).map((c) => c.textContent?.trim());

      expect(asignaciones.every((a) => a === 'Sin asignar')).toBe(true);
    });

    it('muestra las asignaciones guardadas como CC o Nota', async () => {
      TestBed.resetTestingModule();
      await crear({ guardado: { 14: 'crossfader', 164: 'A.play' } });

      expect(fila('Crossfader').querySelector('.asignacion')?.textContent?.trim()).toBe('CC 14');
      expect(fila('Deck A: play/pausa').querySelector('.asignacion')?.textContent?.trim()).toBe('Nota 36');
    });

    it('solo los controles asignados ofrecen Quitar', async () => {
      TestBed.resetTestingModule();
      await crear({ guardado: { 14: 'crossfader' } });

      expect(boton('Crossfader', 'quitar')).not.toBeNull();
      expect(boton('Volumen maestro', 'quitar')).toBeNull();
    });
  });

  describe('aviso sobre el aparato', () => {
    it('sin controlador elegido explica que hay que conectarlo', async () => {
      await crear({ conectado: false });

      expect(el().querySelector('.sin-aparato')?.textContent).toContain('Conecta y elige un controlador');
    });

    it('con un controlador elegido explica como asignar', async () => {
      await crear();

      expect(el().querySelector('.sin-aparato')).toBeNull();
      expect(el().textContent).toContain('mueve el fader');
    });
  });

  describe('aprender una asignacion', () => {
    beforeEach(() => crear());

    it('Asignar pone el control a la espera y muestra el aviso', () => {
      boton('Crossfader', 'asignar')!.click();
      refrescar();

      expect(mapper.learning()).toBe('crossfader');
      expect(el().querySelector('.aprendiendo')?.textContent).toContain('«Crossfader»');
      expect(boton('Crossfader', 'asignar')!.textContent?.trim()).toBe('Cancelar');
      expect(boton('Crossfader', 'asignar')!.getAttribute('aria-pressed')).toBe('true');
    });

    it('al mover el aparato queda asignado y se ve en la fila', () => {
      boton('Crossfader', 'asignar')!.click();

      controlador.send(0xb0, 14, 64);
      refrescar();

      expect(fila('Crossfader').querySelector('.asignacion')?.textContent?.trim()).toBe('CC 14');
      expect(boton('Crossfader', 'quitar')).not.toBeNull();
      expect(el().querySelector('p.aprendiendo')).toBeNull();
    });

    it('una vez asignado, mover el aparato mueve el mezclador', () => {
      boton('Crossfader', 'asignar')!.click();
      controlador.send(0xb0, 14, 64);

      controlador.send(0xb0, 14, 127);

      expect(mixer.crossfader()).toBe(1);
    });

    it('pulsar Cancelar deja de esperar', () => {
      boton('Crossfader', 'asignar')!.click();
      refrescar();

      boton('Crossfader', 'asignar')!.click();
      refrescar();

      expect(mapper.learning()).toBeNull();
      expect(boton('Crossfader', 'asignar')!.textContent?.trim()).toBe('Asignar');
    });

    it('pulsar Asignar en otro control cambia la espera a ese control', () => {
      boton('Crossfader', 'asignar')!.click();

      boton('Volumen maestro', 'asignar')!.click();

      expect(mapper.learning()).toBe('masterVolume');
    });

    it('cada boton tiene una etiqueta accesible con el nombre del control', () => {
      expect(boton('Deck A: EQ agudos', 'asignar')!.getAttribute('aria-label')).toBe('Asignar Deck A: EQ agudos');
    });
  });

  describe('quitar y restablecer', () => {
    beforeEach(() => crear({ guardado: { 14: 'crossfader', 7: 'A.volume' } }));

    it('Quitar elimina la asignacion de esa fila', () => {
      boton('Crossfader', 'quitar')!.click();
      refrescar();

      expect(fila('Crossfader').querySelector('.asignacion')?.textContent?.trim()).toBe('Sin asignar');
      expect(fila('Deck A: volumen').querySelector('.asignacion')?.textContent?.trim()).toBe('CC 7');
    });

    it('Restablecer todo borra todas las asignaciones', () => {
      (el().querySelector('.restablecer') as HTMLButtonElement).click();
      refrescar();

      expect(mapper.mapping()).toEqual({});
      expect(el().querySelectorAll('.quitar').length).toBe(0);
    });

    it('Restablecer todo esta deshabilitado si no hay nada asignado', async () => {
      TestBed.resetTestingModule();
      await crear();

      expect((el().querySelector('.restablecer') as HTMLButtonElement).disabled).toBe(true);
    });
  });

  describe('ciclo de vida', () => {
    it('al aparecer empieza a aplicar el aparato al mezclador', async () => {
      await crear({ guardado: { 14: 'crossfader' } });

      controlador.send(0xb0, 14, 127);

      expect(mixer.crossfader()).toBe(1);
    });

    it('al destruirse deja de reaccionar al aparato', async () => {
      await crear({ guardado: { 14: 'crossfader' } });

      fixture.destroy();
      controlador.send(0xb0, 14, 127);

      expect(mixer.crossfader()).toBe(0.5);
    });
  });
});
