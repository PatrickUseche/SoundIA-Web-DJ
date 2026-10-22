import { Injectable, InjectionToken, inject, signal } from '@angular/core';
import { Observable, Subject } from 'rxjs';
import { ControllerEvent, parseMidiMessage } from '../midi/midi-parser';

/** Acceso a la Web MIDI API; es null cuando el navegador no la soporta (o al renderizar en servidor). */
export interface MidiApi {
  requestAccess(): Promise<MIDIAccess>;
}

export const MIDI_API = new InjectionToken<MidiApi | null>('MIDI_API', {
  providedIn: 'root',
  factory: () =>
    typeof navigator !== 'undefined' && typeof navigator.requestMIDIAccess === 'function'
      ? { requestAccess: () => navigator.requestMIDIAccess() }
      : null,
});

export interface MidiInputInfo {
  id: string;
  name: string;
}

export type MidiState =
  | 'idle' // todavia no se pidio acceso
  | 'requesting' // esperando el permiso del usuario
  | 'ready' // acceso concedido
  | 'denied' // el usuario (o la politica del navegador) nego el permiso
  | 'unsupported' // el navegador no tiene Web MIDI API
  | 'error'; // fallo inesperado al pedir acceso

@Injectable({ providedIn: 'root' })
export class MidiService {
  private readonly api = inject(MIDI_API);

  private access: MIDIAccess | null = null;
  private attachedInput: MIDIInput | null = null;
  private readonly eventSubject = new Subject<ControllerEvent>();

  private readonly _state = signal<MidiState>(this.api ? 'idle' : 'unsupported');
  private readonly _inputs = signal<MidiInputInfo[]>([]);
  private readonly _selectedInputId = signal<string | null>(null);

  readonly state = this._state.asReadonly();
  /** Controladores conectados ahora mismo. */
  readonly inputs = this._inputs.asReadonly();
  readonly selectedInputId = this._selectedInputId.asReadonly();

  /** Eventos de control del controlador seleccionado, ya convertidos a {controlId, value, channel}. */
  readonly events$: Observable<ControllerEvent> = this.eventSubject.asObservable();

  /** Pide permiso al navegador y empieza a vigilar los controladores conectados. */
  async requestAccess(): Promise<void> {
    if (!this.api) {
      this._state.set('unsupported');
      return;
    }
    this._state.set('requesting');
    try {
      this.access = await this.api.requestAccess();
    } catch (err) {
      const nombre = err instanceof DOMException ? err.name : '';
      this._state.set(nombre === 'SecurityError' || nombre === 'NotAllowedError' ? 'denied' : 'error');
      return;
    }

    // Se refresca al conectar o desconectar un controlador con el navegador abierto.
    this.access.onstatechange = () => this.refreshInputs();
    this._state.set('ready');
    this.refreshInputs();
  }

  /** Escucha el controlador indicado (o ninguno con null). Un id desconocido se ignora. */
  selectInput(id: string | null): void {
    this.detachInput();
    if (id === null) {
      this._selectedInputId.set(null);
      return;
    }

    const input = this.findInput(id);
    if (!input) {
      this._selectedInputId.set(null);
      return;
    }
    input.onmidimessage = (message) => {
      const event = parseMidiMessage(message.data);
      if (event) {
        this.eventSubject.next(event);
      }
    };
    this.attachedInput = input;
    this._selectedInputId.set(id);
  }

  private refreshInputs(): void {
    const connected = this.connectedInputs();
    this._inputs.set(connected.map((input) => ({ id: input.id, name: input.name ?? 'Controlador MIDI' })));

    const selected = this._selectedInputId();
    if (selected !== null && !connected.some((input) => input.id === selected)) {
      // Se desenchufo el controlador que se estaba escuchando.
      this.attachedInput = null;
      this._selectedInputId.set(null);
    }
    // Comodidad: con un unico controlador conectado y ninguno elegido, se elige solo.
    if (this._selectedInputId() === null && connected.length === 1) {
      this.selectInput(connected[0].id);
    }
  }

  private connectedInputs(): MIDIInput[] {
    if (!this.access) {
      return [];
    }
    return Array.from(this.access.inputs.values()).filter((input) => input.state === 'connected');
  }

  private findInput(id: string): MIDIInput | undefined {
    return this.connectedInputs().find((input) => input.id === id);
  }

  private detachInput(): void {
    if (this.attachedInput) {
      this.attachedInput.onmidimessage = null;
      this.attachedInput = null;
    }
  }
}
