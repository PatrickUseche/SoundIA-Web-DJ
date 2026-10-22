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

/** Un desfase de fase menor que esto no vale la pena corregirlo (s): reposicionar la pista cuesta mas que el error. */
export const MIN_PHASE_SHIFT_SECONDS = 0.002;

export interface PhaseSyncInput {
  /** Pista guia (la que suena) y su posicion (s de la pista) y factor de pitch. */
  leader: Track;
  leaderPosition: number;
  leaderRate: number;
  /** Pista que se mueve para caer en fase con la guia, con su posicion y factor de pitch (tempos ya igualados). */
  follower: Track;
  followerPosition: number;
  followerRate: number;
}

/**
 * Segundos de pista que hay que mover la seguidora para que sus pulsos caigan sobre los de la guia, por el camino
 * mas corto (como mucho medio pulso hacia delante o hacia atras). Es la fase de pulso, no de compas: mover la pista
 * un compas entero se oiria como un salto. null si alguna de las dos pistas no tiene rejilla.
 */
export function phaseShift(input: PhaseSyncInput): number | null {
  const { leader, follower } = input;
  if (!leader.grid || !follower.grid) {
    return null;
  }
  const leaderBeat = 60 / leader.bpm;
  const followerBeat = 60 / follower.bpm;
  // Cuanto falta (en segundos de reloj) para el siguiente pulso de cada una.
  const leaderWait = (nextOnGrid(leader.grid.offset, leaderBeat, input.leaderPosition) - input.leaderPosition) / input.leaderRate;
  const followerWait =
    (nextOnGrid(follower.grid.offset, followerBeat, input.followerPosition) - input.followerPosition) / input.followerRate;
  const period = followerBeat / input.followerRate;
  // Si el pulso de la seguidora llega despues que el de la guia va retrasada: hay que adelantarla.
  const lag = followerWait - leaderWait;
  const wrapped = ((((lag + period / 2) % period) + period) % period) - period / 2;
  return wrapped * input.followerRate;
}

export interface AlignmentInput {
  outgoing: Track;
  incoming: Track;
  /** Posicion de la pista que suena (s de la pista) y factor de pitch al que suena. */
  outgoingPosition: number;
  outgoingRate: number;
  /**
   * Factor con el que el motor reinterpreta el tempo de la entrante (1 = tal cual; 2 = va a la mitad de pulsos y
   * sus golpes caen cada dos de la saliente; 0.5 = al doble de pulsos). Es el `multiplier` del ajuste de tempo.
   */
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
  /** Factor de pitch de la entrante para que suene al tempo al que suena la saliente (con el multiplicador). */
  ratio: number;
}

/**
 * Cuando y desde donde arrancar la pista entrante para que sus golpes caigan sobre los de la saliente:
 * se espera al proximo compas (o pulso) de la saliente, y la entrante arranca justo en su propio compas (o
 * pulso) con su tempo igualado. Si el motor mezcla a la mitad o al doble de tempo (multiplicador 2 o 0.5) tambien
 * se alinea: la entrante arranca en uno de sus pulsos sobre uno de la saliente y, como va al doble o a la mitad de
 * pulsos, los siguientes siguen cayendo sobre golpes de la saliente (todos, o uno de cada dos). Devuelve null si
 * no se puede alinear: sin rejilla en alguna de las pistas o con un tempo que no cabe en el pitch fader.
 */
export function planAlignment(input: AlignmentInput): Alignment | null {
  const { outgoing, incoming } = input;
  const level = alignmentLevel(outgoing, incoming);
  if (level === null || !outgoing.grid || !incoming.grid || !(input.multiplier > 0)) {
    return null;
  }
  const ratio = (outgoing.bpm * input.outgoingRate) / (incoming.bpm * input.multiplier);
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
