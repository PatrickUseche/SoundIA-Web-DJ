import { Injectable, InjectionToken, inject, signal } from '@angular/core';
import { Subscription } from 'rxjs';
import { DeckId } from '../audio/deck';
import { EqBand } from '../audio/eq';
import {
  MidiAssignment,
  MidiMapping,
  MixerControl,
  isButton,
  isMixerControl,
  mappingKey,
  parseMappingKey,
  valueToPitch,
  valueToUnit,
} from '../midi/midi-mapping';
import { ControllerEvent } from '../midi/midi-parser';
import { MidiService } from './midi';
import { MixerService } from './mixer';

/** Almacenamiento donde se guarda la asignacion (localStorage); null si no hay (servidor, navegador privado). */
export const MIDI_MAPPING_STORAGE = new InjectionToken<Pick<Storage, 'getItem' | 'setItem'> | null>(
  'MIDI_MAPPING_STORAGE',
  {
    providedIn: 'root',
    factory: () => {
      try {
        return typeof localStorage !== 'undefined' ? localStorage : null;
      } catch {
        return null; // algunos navegadores lanzan al acceder a localStorage con el almacenamiento bloqueado
      }
    },
  },
);

export const MIDI_MAPPING_STORAGE_KEY = 'soundia.midi-mapping';

/**
 * Conecta el controlador MIDI con el mezclador: cada control fisico (fader, perilla, boton) se asigna a un
 * control de pantalla. La asignacion se aprende moviendo el control del aparato y se guarda en el navegador.
 */
@Injectable({ providedIn: 'root' })
export class MidiMapperService {
  private readonly midi = inject(MidiService);
  private readonly mixer = inject(MixerService);
  private readonly storage = inject(MIDI_MAPPING_STORAGE);

  private subscription: Subscription | null = null;

  /** Asignaciones actuales: control fisico del aparato (canal y controlId) -> control de pantalla. */
  readonly mapping = signal<MidiMapping>(this.load());
  /** Control de pantalla que espera que muevas un control del aparato para asignarlo (modo aprender). */
  readonly learning = signal<MixerControl | null>(null);

  /** Empieza a aplicar los eventos del controlador al mezclador. Llamarlo varias veces no duplica nada. */
  start(): void {
    if (this.subscription) {
      return;
    }
    this.subscription = this.midi.events$.subscribe((event) => this.handle(event));
  }

  stop(): void {
    this.subscription?.unsubscribe();
    this.subscription = null;
    this.learning.set(null);
  }

  /** Espera el siguiente movimiento del aparato para asignarlo a `control`. */
  startLearning(control: MixerControl): void {
    this.learning.set(control);
  }

  cancelLearning(): void {
    this.learning.set(null);
  }

  /** Control fisico asignado a un control de pantalla (con su canal, o null si vale cualquiera), o null si no tiene. */
  assignedTo(control: MixerControl): MidiAssignment | null {
    const entry = Object.entries(this.mapping()).find(([, assigned]) => assigned === control);
    return entry ? parseMappingKey(entry[0]) : null;
  }

  /** Quita la asignación de un control de pantalla. */
  clear(control: MixerControl): void {
    const next = { ...this.mapping() };
    for (const [key, assigned] of Object.entries(next)) {
      if (assigned === control) {
        delete next[key];
      }
    }
    this.setMapping(next);
  }

  /** Borra todas las asignaciones. */
  reset(): void {
    this.learning.set(null);
    this.setMapping({});
  }

  private handle(event: ControllerEvent): void {
    const learning = this.learning();
    if (learning !== null) {
      // Un boton de aparato envia 127 al pulsar y 0 al soltar: asignar solo con el primer movimiento
      // que tenga valor evita tomar la liberacion de la pulsacion anterior.
      if (event.value > 0 || !isButton(learning)) {
        this.assign(mappingKey(event.controlId, event.channel), learning);
      }
      return;
    }

    // Primero la asignación de ese canal y, si no la hay, la de cualquier canal (las guardadas antes del canal).
    const mapping = this.mapping();
    const control = mapping[mappingKey(event.controlId, event.channel)] ?? mapping[mappingKey(event.controlId)];
    if (control !== undefined && this.mixer.supported) {
      this.apply(control, event.value);
    }
  }

  /** Asigna la clave al control: una clave solo controla una cosa y un control solo tiene una clave. */
  private assign(key: string, control: MixerControl): void {
    const next = { ...this.mapping() };
    for (const [existing, assigned] of Object.entries(next)) {
      if (assigned === control) {
        delete next[existing];
      }
    }
    next[key] = control;
    this.learning.set(null);
    this.setMapping(next);
  }

  private apply(control: MixerControl, value: number): void {
    if (control === 'crossfader') {
      this.mixer.setCrossfader(valueToUnit(value));
      return;
    }
    if (control === 'masterVolume') {
      this.mixer.setMasterVolume(valueToUnit(value));
      return;
    }

    const [deckId, kind, band] = control.split('.') as [DeckId, string, EqBand?];
    const deck = this.mixer.deck(deckId);
    switch (kind) {
      case 'volume':
        deck.setVolume(valueToUnit(value));
        break;
      case 'pitch':
        deck.setPitch(valueToPitch(value));
        break;
      case 'eq':
        deck.setEq(band as EqBand, valueToUnit(value));
        break;
      default:
        // Los botones actuan al pulsarse (valor > 0), no al soltarse.
        if (value > 0) {
          this.press(deckId, kind);
        }
    }
  }

  private press(deckId: DeckId, button: string): void {
    const deck = this.mixer.deck(deckId);
    if (button === 'play') {
      if (deck.playing()) {
        deck.pause();
      } else {
        // El navegador exige un gesto del usuario para sonar; pulsar un boton del aparato cuenta.
        void this.mixer.resume().then(() => deck.play());
      }
    } else if (button === 'cue') {
      deck.goToCue();
    } else if (button === 'sync') {
      this.mixer.sync(deckId);
    }
  }

  private setMapping(mapping: MidiMapping): void {
    this.mapping.set(mapping);
    try {
      this.storage?.setItem(MIDI_MAPPING_STORAGE_KEY, JSON.stringify(mapping));
    } catch {
      // Sin espacio o bloqueado: la asignacion sigue funcionando en esta sesion, solo no se recordara.
    }
  }

  /** Lee la asignacion guardada, descartando todo lo que no sea valido (el almacenamiento puede estar danado). */
  private load(): MidiMapping {
    try {
      const raw = this.storage?.getItem(MIDI_MAPPING_STORAGE_KEY);
      const parsed: unknown = raw ? JSON.parse(raw) : null;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return {};
      }
      const mapping: MidiMapping = {};
      for (const [key, control] of Object.entries(parsed)) {
        const assignment = parseMappingKey(key);
        if (assignment && isMixerControl(control)) {
          // Se guarda la clave normalizada ("007" y "7" son el mismo control).
          mapping[mappingKey(assignment.controlId, assignment.channel)] = control;
        }
      }
      return mapping;
    } catch {
      return {};
    }
  }
}
