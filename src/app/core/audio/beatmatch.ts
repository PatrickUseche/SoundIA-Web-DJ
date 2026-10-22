/**
 * Beatmatching en el navegador. Replica la semantica de `mixing/tempo.py` del motor de IA, para poder
 * sincronizar los decks al instante sin llamar al servidor; si cambia alli, hay que cambiarlo aqui.
 */

/** Rango habitual del pitch fader de un reproductor de DJ: +-8 %. */
export const MAX_PITCH_ADJUSTMENT = 0.08;

// Una pista a la mitad o al doble de tempo tambien se puede mezclar (los golpes coinciden cada dos pulsos).
const MULTIPLIERS = [1, 2, 0.5];

export interface TempoMatch {
  /** Factor de velocidad a aplicar a la pista para igualar el tempo de la referencia. */
  ratio: number;
  /** 1 = tal cual; 0.5 = la pista va al doble de rapido y se cuentan la mitad de sus pulsos; 2 = al reves. */
  multiplier: number;
  /** El ajuste cabe en el rango del pitch fader. */
  feasible: boolean;
}

/** Ajuste que necesita `bpmTrack` para sonar al tempo de `bpmReference`. */
export function matchTempo(bpmReference: number, bpmTrack: number): TempoMatch {
  if (!(bpmReference > 0) || !(bpmTrack > 0)) {
    throw new RangeError('El BPM debe ser positivo.');
  }

  const deviation = (multiplier: number) => Math.abs(bpmReference / (bpmTrack * multiplier) - 1);
  const multiplier = MULTIPLIERS.reduce((best, candidate) =>
    deviation(candidate) < deviation(best) ? candidate : best,
  );
  const ratio = bpmReference / (bpmTrack * multiplier);
  return { ratio, multiplier, feasible: Math.abs(ratio - 1) <= MAX_PITCH_ADJUSTMENT + 1e-9 };
}

/** Limita un factor de velocidad al rango del pitch fader. */
export function clampPitch(ratio: number): number {
  return Math.min(1 + MAX_PITCH_ADJUSTMENT, Math.max(1 - MAX_PITCH_ADJUSTMENT, ratio));
}
