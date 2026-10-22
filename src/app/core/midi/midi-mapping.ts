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

/** Asignaciones: controlId MIDI -> control de pantalla. Un controlId solo controla una cosa. */
export type MidiMapping = Record<number, MixerControl>;

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

/** Nombre legible de un controlId MIDI: los CC se muestran como "CC 14" y las notas (128+) como "Nota 36". */
export function midiControlLabel(controlId: number): string {
  return controlId >= 128 ? `Nota ${controlId - 128}` : `CC ${controlId}`;
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
