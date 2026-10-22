import { Track } from '../models/track';
import { MAX_PITCH_ADJUSTMENT } from './beatmatch';

/** Pulsos de un compas. */
export const BEATS_PER_BAR = 4;
/**
 * Seguridad minima (0-1) de que el "primer tiempo" de una pista sea el correcto para alinear por compases. Es el
 * mismo umbral con el que el motor ancla los puntos de mezcla a el.
 */
export const MIN_DOWNBEAT_CONFIDENCE = 0.2;
/** Margen para programar el arranque de la pista entrante antes de que llegue su momento (s). */
export const MIN_ALIGNMENT_LEAD_SECONDS = 0.15;

/** Hasta donde se alinea: por compases (el "1" de una pista con el "1" de la otra) o solo por pulsos. */
export type AlignmentLevel = 'bar' | 'beat';

/**
 * Primer punto de la rejilla `origin + k * step` (k entero, tambien negativo) que no es anterior a `from`.
 * La tolerancia evita saltar un compas por un error de redondeo cuando `from` ya cae en la rejilla.
 */
export function nextOnGrid(origin: number, step: number, from: number): number {
  return origin + Math.ceil((from - origin) / step - 1e-9) * step;
}

/** Punto de la rejilla `origin + k * step` mas cercano a `target`. */
export function nearestOnGrid(origin: number, step: number, target: number): number {
  return origin + Math.round((target - origin) / step) * step;
}

/** Nivel hasta el que se pueden alinear dos pistas; null si alguna no tiene rejilla de pulsos. */
export function alignmentLevel(a: Track, b: Track): AlignmentLevel | null {
  if (!a.grid || !b.grid) {
    return null;
  }
  return a.grid.confidence >= MIN_DOWNBEAT_CONFIDENCE && b.grid.confidence >= MIN_DOWNBEAT_CONFIDENCE ? 'bar' : 'beat';
}

export interface AlignmentInput {
  outgoing: Track;
  incoming: Track;
  /** Posicion de la pista que suena (s de la pista) y factor de pitch al que suena. */
  outgoingPosition: number;
  outgoingRate: number;
  /** Factor con el que el motor reinterpreta el tempo de la entrante (1 = tal cual; 0.5 o 2 = mitad o doble). */
  multiplier: number;
  /** Punto de entrada que propone el plan, en segundos de la entrante. */
  mixInAt: number;
  /** No arrancar antes de este punto de la saliente (el punto de salida del plan), si se indica. */
  notBefore?: number;
  minLeadSeconds?: number;
}

export interface Alignment {
  level: AlignmentLevel;
  /** Segundos (de reloj) hasta el momento de arrancar la entrante. */
  delaySeconds: number;
  /** Punto de la saliente (s de la pista) en el que arranca la entrante: un compas o pulso suyo. */
  outgoingTarget: number;
  /** Posicion de la entrante desde la que arranca, sobre su rejilla. */
  incomingStart: number;
  /** Factor de pitch de la entrante para que suene al tempo al que suena la saliente. */
  ratio: number;
}

/**
 * Cuando y desde donde arrancar la pista entrante para que sus golpes caigan sobre los de la saliente:
 * se espera al proximo compas (o pulso) de la saliente, y la entrante arranca justo en su propio compas (o
 * pulso) con su tempo igualado. Devuelve null si no se puede alinear: sin rejilla en alguna de las pistas,
 * con un tempo que no cabe en el pitch fader o con el motor mezclando a la mitad o al doble de tempo.
 */
export function planAlignment(input: AlignmentInput): Alignment | null {
  const { outgoing, incoming } = input;
  const level = alignmentLevel(outgoing, incoming);
  if (level === null || !outgoing.grid || !incoming.grid || input.multiplier !== 1) {
    return null;
  }
  const ratio = (outgoing.bpm * input.outgoingRate) / incoming.bpm;
  if (Math.abs(ratio - 1) > MAX_PITCH_ADJUSTMENT + 1e-9) {
    return null;
  }

  const unit = level === 'bar' ? BEATS_PER_BAR : 1;
  const outgoingStep = (unit * 60) / outgoing.bpm;
  const outgoingOrigin = level === 'bar' ? outgoing.grid.downbeat : outgoing.grid.offset;
  const lead = (input.minLeadSeconds ?? MIN_ALIGNMENT_LEAD_SECONDS) * input.outgoingRate;
  const earliest = Math.max(input.outgoingPosition + lead, input.notBefore ?? -Infinity);
  const target = nextOnGrid(outgoingOrigin, outgoingStep, earliest);

  const incomingStep = (unit * 60) / incoming.bpm;
  const incomingOrigin = level === 'bar' ? incoming.grid.downbeat : incoming.grid.offset;
  let incomingStart = nearestOnGrid(incomingOrigin, incomingStep, input.mixInAt);
  if (incomingStart < 0) {
    incomingStart = nextOnGrid(incomingOrigin, incomingStep, 0);
  }

  return {
    level,
    delaySeconds: (target - input.outgoingPosition) / input.outgoingRate,
    outgoingTarget: target,
    incomingStart,
    ratio,
  };
}
