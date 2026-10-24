import { DeckId } from '../audio/deck';

/**
 * Detecta, a partir de muestras del mezclador, las transiciones que hace un DJ a mano: una pista suena sola, entra la
 * otra mientras la primera sigue sonando, y la primera acaba apagandose. De cada una devuelve lo que hizo (cuando
 * entro, cuanto solaparon, como movio crossfader, EQ y volumen). Es una maquina de estados pura, sin Angular ni
 * temporizadores: se alimenta con `push` y se prueba con muestras inventadas.
 */

/** Un deck "suena" si esta reproduciendo y su volumen por la ganancia del crossfader supera este nivel. */
export const AUDIBLE_LEVEL = 0.05;
/** La pista base debe sonar sola este tiempo antes de contar una entrada (evita arranques con las dos a la vez). */
export const SETTLE_SECONDS = 1;
/** La pista que sale debe seguir inaudible este tiempo para dar la mezcla por acabada. */
export const END_HOLD_SECONDS = 1;
/** Si la pista que entra deja de sonar este tiempo, la mezcla se descarta (el DJ se arrepintio). */
export const ABORT_HOLD_SECONDS = 3;
export const MAX_OVERLAP_SECONDS = 600;
/** Un corte seco apenas solapa: el solape registrado nunca es menor que esto (el servidor exige mayor que 0). */
export const MIN_OVERLAP_SECONDS = 0.2;
/** Cuanto despues del fin del solape se conservan puntos de las curvas. */
export const TAIL_SECONDS = 0.5;
export const MAX_CURVE_POINTS = 150;

export interface DeckSample {
  trackId: number | null;
  playing: boolean;
  /** Segundo de la pista en el que va. */
  position: number;
  pitch: number;
  volume: number;
  /** Ganancia que le deja el crossfader (0-1). */
  gain: number;
  eq: { low: number; mid: number; high: number };
}

export interface MixSample {
  /** Segundos de un reloj que solo avanza. */
  time: number;
  crossfader: number;
  decks: Record<DeckId, DeckSample>;
}

/**
 * Curva de pares [segundo desde la entrada de la pista que entra, valor 0-1]. La del crossfader va de 0 (solo suena la
 * pista que sale) a 1 (solo la que entra), sea cual sea el deck fisico que salga.
 */
export type Curve = [number, number][];

export interface DeckCurves {
  volume: Curve;
  low: Curve;
  mid: Curve;
  high: Curve;
}

/** `a` es la pista que sale y `b` la que entra, sean cuales sean sus decks. */
export interface RecordedTransition {
  fromDeck: DeckId;
  toDeck: DeckId;
  fromTrackId: number;
  toTrackId: number;
  mixOutAt: number;
  mixInAt: number;
  overlapSeconds: number;
  pitchA: number;
  pitchB: number;
  curves: { crossfader: Curve; a: DeckCurves; b: DeckCurves };
}

interface Point {
  t: number;
  crossfader: number;
  from: DeckSample;
  to: DeckSample;
}

interface ActiveMix {
  from: DeckId;
  to: DeckId;
  startTime: number;
  fromTrackId: number;
  toTrackId: number;
  mixOutAt: number;
  mixInAt: number;
  pitchA: number;
  pitchB: number;
  points: Point[];
  fromSilentSince: number | null;
  toSilentSince: number | null;
}

const other = (deck: DeckId): DeckId => (deck === 'A' ? 'B' : 'A');

export function isAudible(deck: DeckSample): boolean {
  return deck.playing && deck.trackId !== null && deck.volume * deck.gain > AUDIBLE_LEVEL;
}

/** A lo sumo `limit` puntos repartidos por igual, conservando siempre el primero y el ultimo. */
export function downsample(curve: Curve, limit: number = MAX_CURVE_POINTS): Curve {
  if (curve.length <= limit) {
    return curve;
  }
  const picked: Curve = [];
  for (let i = 0; i < limit; i++) {
    picked.push(curve[Math.round((i * (curve.length - 1)) / (limit - 1))]);
  }
  return picked;
}

export class TransitionDetector {
  private base: DeckId | null = null;
  private baseSince = 0;
  private active: ActiveMix | null = null;

  /** Hay una mezcla en curso. */
  get recording(): boolean {
    return this.active !== null;
  }

  /** Olvida lo que estaba viendo (por ejemplo, al apagar el grabador o mientras mezcla el Auto-DJ). */
  reset(): void {
    this.base = null;
    this.active = null;
  }

  /** Procesa una muestra. Devuelve la transicion cuando acaba una; si no, null. */
  push(sample: MixSample): RecordedTransition | null {
    return this.active ? this.followMix(this.active, sample) : this.lookForEntry(sample);
  }

  private lookForEntry(sample: MixSample): null {
    const audibleA = isAudible(sample.decks.A);
    const audibleB = isAudible(sample.decks.B);

    if (audibleA !== audibleB) {
      const only: DeckId = audibleA ? 'A' : 'B';
      if (this.base !== only) {
        this.base = only;
        this.baseSince = sample.time;
      }
      return null;
    }
    if (!audibleA) {
      this.base = null;
      return null;
    }

    // Suenan las dos. Solo es una entrada si una de ellas llevaba un rato sonando sola.
    const base = this.base;
    this.base = null;
    if (base === null || sample.time - this.baseSince < SETTLE_SECONDS) {
      return null;
    }
    const from = sample.decks[base];
    const to = sample.decks[other(base)];
    if (from.trackId === null || to.trackId === null || from.trackId === to.trackId) {
      return null;
    }
    this.active = {
      from: base,
      to: other(base),
      startTime: sample.time,
      fromTrackId: from.trackId,
      toTrackId: to.trackId,
      mixOutAt: from.position,
      mixInAt: to.position,
      pitchA: from.pitch,
      pitchB: to.pitch,
      points: [],
      fromSilentSince: null,
      toSilentSince: null,
    };
    this.addPoint(this.active, sample);
    return null;
  }

  private followMix(mix: ActiveMix, sample: MixSample): RecordedTransition | null {
    const from = sample.decks[mix.from];
    const to = sample.decks[mix.to];

    // Si cambia alguna de las pistas, o se alarga sin fin, no es la mezcla que se estaba siguiendo.
    if (from.trackId !== mix.fromTrackId || to.trackId !== mix.toTrackId
        || sample.time - mix.startTime > MAX_OVERLAP_SECONDS) {
      this.reset();
      return null;
    }

    this.addPoint(mix, sample);
    mix.fromSilentSince = isAudible(from) ? null : (mix.fromSilentSince ?? sample.time);
    mix.toSilentSince = isAudible(to) ? null : (mix.toSilentSince ?? sample.time);

    if (mix.toSilentSince !== null && sample.time - mix.toSilentSince >= ABORT_HOLD_SECONDS) {
      this.reset();
      return null;
    }
    if (mix.fromSilentSince !== null && sample.time - mix.fromSilentSince >= END_HOLD_SECONDS) {
      if (mix.toSilentSince !== null) {
        this.reset();
        return null;
      }
      const result = this.finish(mix, mix.fromSilentSince);
      this.active = null;
      // La pista que entro queda como base, sonando sola desde que la otra se apago.
      this.base = mix.to;
      this.baseSince = mix.fromSilentSince;
      return result;
    }
    return null;
  }

  private addPoint(mix: ActiveMix, sample: MixSample): void {
    mix.points.push({
      t: sample.time - mix.startTime,
      crossfader: mix.from === 'A' ? sample.crossfader : 1 - sample.crossfader,
      from: sample.decks[mix.from],
      to: sample.decks[mix.to],
    });
  }

  private finish(mix: ActiveMix, endTime: number): RecordedTransition {
    const overlap = Math.max(endTime - mix.startTime, MIN_OVERLAP_SECONDS);
    const points = mix.points.filter((p) => p.t <= overlap + TAIL_SECONDS);
    const curve = (pick: (p: Point) => number): Curve =>
      downsample(points.map((p) => [round(p.t, 3), round(clamp(pick(p)), 4)] as [number, number]));
    const deckCurves = (side: 'from' | 'to'): DeckCurves => ({
      volume: curve((p) => p[side].volume),
      low: curve((p) => p[side].eq.low),
      mid: curve((p) => p[side].eq.mid),
      high: curve((p) => p[side].eq.high),
    });
    return {
      fromDeck: mix.from,
      toDeck: mix.to,
      fromTrackId: mix.fromTrackId,
      toTrackId: mix.toTrackId,
      mixOutAt: round(mix.mixOutAt, 3),
      mixInAt: round(mix.mixInAt, 3),
      overlapSeconds: round(overlap, 3),
      pitchA: mix.pitchA,
      pitchB: mix.pitchB,
      curves: { crossfader: curve((p) => p.crossfader), a: deckCurves('from'), b: deckCurves('to') },
    };
  }
}

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
