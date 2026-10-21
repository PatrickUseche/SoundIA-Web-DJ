import { MIDI_API } from '../services/midi';

/** Entrada MIDI de mentira: permite "tocar" el controlador desde las pruebas. */
export class FakeMidiInput {
  onmidimessage: ((message: { data: Uint8Array }) => void) | null = null;
  state: 'connected' | 'disconnected' = 'connected';

  constructor(
    readonly id: string,
    readonly name: string | null = 'Controlador de prueba',
  ) {}

  /** Simula que el usuario movio un control: llega un mensaje con estos bytes. */
  send(...bytes: number[]): void {
    this.onmidimessage?.({ data: new Uint8Array(bytes) });
  }
}

/** MIDIAccess de mentira con control sobre los dispositivos conectados. */
export class FakeMidiAccess {
  readonly inputs = new Map<string, FakeMidiInput>();
  onstatechange: (() => void) | null = null;

  constructor(inputs: FakeMidiInput[] = []) {
    inputs.forEach((input) => this.inputs.set(input.id, input));
  }

  plug(input: FakeMidiInput): void {
    this.inputs.set(input.id, input);
    this.onstatechange?.();
  }

  unplug(id: string): void {
    this.inputs.delete(id);
    this.onstatechange?.();
  }
}

/** Provider para TestBed que entrega `access` (o rechaza con `error`) en lugar de la Web MIDI API real. */
export function provideFakeMidi(access: FakeMidiAccess | null, error?: Error) {
  return {
    provide: MIDI_API,
    useValue: access || error
      ? {
          requestAccess: () =>
            error ? Promise.reject(error) : Promise.resolve(access as unknown as MIDIAccess),
        }
      : null,
  };
}
