import { MAX_PITCH_ADJUSTMENT } from '../audio/beatmatch';
import { DeckId } from '../audio/deck';
import { EqBand } from '../audio/eq';

/** Controles de pantalla a los que se puede asignar un control fisico del aparato MIDI. */
export type MixerControl =
  | 'crossfader'
  | 'masterVolume'
  | `${DeckId}.volume`
  | `${DeckId}.pitch`
  | `${DeckId}.eq.${EqBand}`
  | `${DeckId}.play`
  | `${DeckId}.cue`
  | `${DeckId}.sync`;

const DECKS: DeckId[] = ['A', 'B'];
const BANDS: EqBand[] = ['low', 'mid', 'high'];

/** Todos los controles asignables, en el orden en que se muestran. */
export const MIXER_CONTROLS: MixerControl[] = [
  'crossfader',
  'masterVolume',
  ...DECKS.flatMap((deck): MixerControl[] => [
    `${deck}.volume`,
    `${deck}.pitch`,
    ...BANDS.map((band): MixerControl => `${deck}.eq.${band}`),
    `${deck}.play`,
    `${deck}.cue`,
    `${deck}.sync`,
  ]),
];

/** Un control continuo (fader, perilla) usa el valor 0-127; un boton solo dispara una accion al pulsarse. */
export function isButton(control: MixerControl): boolean {
  return control.endsWith('.play') || control.endsWith('.cue') || control.endsWith('.sync');
}

export function isMixerControl(value: unknown): value is MixerControl {
  return typeof value === 'string' && (MIXER_CONTROLS as string[]).includes(value);
}

/**
 * Asignaciones: clave de control fisico -> control de pantalla. Una clave solo controla una cosa.
 * La clave es "canal:controlId" (canal 0-15) para un control de un canal concreto, o solo "controlId" para uno de
 * cualquier canal: asi siguen valiendo las asignaciones guardadas antes de distinguir el canal.
 */
export type MidiMapping = Record<string, MixerControl>;

/** Control fisico del aparato; `channel` es null cuando vale cualquier canal. */
export interface MidiAssignment {
  channel: number | null;
  controlId: number;
}

const MAX_CHANNEL = 15;
const MAX_CONTROL_ID = 255;

/** Clave de una asignacion: con canal para un control de ese canal, sin canal para uno de cualquier canal. */
export function mappingKey(controlId: number, channel: number | null = null): string {
  return channel === null ? String(controlId) : `${channel}:${controlId}`;
}

/** Lee una clave de asignacion; null si no es valida (el almacenamiento puede estar danado). */
export function parseMappingKey(key: string): MidiAssignment | null {
  const match = /^(?:(\d{1,2}):)?(\d{1,3})$/.exec(key);
  if (!match) {
    return null;
  }
  const channel = match[1] === undefined ? null : Number(match[1]);
  const controlId = Number(match[2]);
  if ((channel !== null && channel > MAX_CHANNEL) || controlId > MAX_CONTROL_ID) {
    return null;
  }
  return { channel, controlId };
}

const NOMBRE_BANDA: Record<EqBand, string> = { low: 'graves', mid: 'medios', high: 'agudos' };

/** Nombre legible de un control para la interfaz, por ejemplo "Deck A: graves". */
export function controlLabel(control: MixerControl): string {
  if (control === 'crossfader') {
    return 'Crossfader';
  }
  if (control === 'masterVolume') {
    return 'Volumen maestro';
  }
  const [deck, kind, band] = control.split('.');
  const nombreDeck = `Deck ${deck}`;
  switch (kind) {
    case 'volume':
      return `${nombreDeck}: volumen`;
    case 'pitch':
      return `${nombreDeck}: pitch`;
    case 'eq':
      return `${nombreDeck}: EQ ${NOMBRE_BANDA[band as EqBand]}`;
    case 'play':
      return `${nombreDeck}: play/pausa`;
    case 'cue':
      return `${nombreDeck}: cue`;
    default:
      return `${nombreDeck}: sync`;
  }
}

/**
 * Nombre legible de un control del aparato: los CC se muestran como "CC 14" y las notas (128+) como "Nota 36".
 * Con canal se antepone, contado desde 1 como lo muestran los aparatos: "Canal 2 · CC 7".
 */
export function midiControlLabel(controlId: number, channel: number | null = null): string {
  const nombre = controlId >= 128 ? `Nota ${controlId - 128}` : `CC ${controlId}`;
  return channel === null ? nombre : `Canal ${channel + 1} · ${nombre}`;
}

/** Valor MIDI (0-127) como fraccion de 0 a 1. */
export function valueToUnit(value: number): number {
  return Math.min(1, Math.max(0, value / 127));
}

/**
 * Valor MIDI (0-127) como factor de velocidad del pitch fader: 0 -> -8 %, 127 -> +8 %. Cerca del centro se
 * ajusta a exactamente 1 (sin cambio), porque un fader fisico rara vez cae justo en 63.5.
 */
export function valueToPitch(value: number): number {
  const ratio = 1 - MAX_PITCH_ADJUSTMENT + valueToUnit(value) * 2 * MAX_PITCH_ADJUSTMENT;
  return Math.abs(ratio - 1) < 0.003 ? 1 : ratio;
}
