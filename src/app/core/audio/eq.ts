/** Bandas del ecualizador de cada deck. */
export type EqBand = 'low' | 'mid' | 'high';

export const EQ_BANDS: readonly EqBand[] = ['low', 'mid', 'high'];

/** Ganancia (dB) con la perilla al minimo: la banda queda cortada, como en un mixer de DJ. */
export const EQ_KILL_DB = -40;
/** Ganancia (dB) con la perilla al maximo. */
export const EQ_BOOST_DB = 6;

/**
 * Convierte la posicion de una perilla (0 a 1) en decibelios: 0 corta la banda (-40 dB), 0.5 la deja
 * plana (0 dB, posicion central) y 1 la realza (+6 dB). Los valores fuera de rango se limitan.
 */
export function eqValueToDb(value: number): number {
  const v = Math.min(1, Math.max(0, value));
  return v <= 0.5 ? EQ_KILL_DB + (v / 0.5) * -EQ_KILL_DB : ((v - 0.5) / 0.5) * EQ_BOOST_DB;
}

/** Inversa de eqValueToDb, para volver de decibelios a la posicion de la perilla. */
export function dbToEqValue(db: number): number {
  if (db <= EQ_KILL_DB) {
    return 0;
  }
  if (db >= EQ_BOOST_DB) {
    return 1;
  }
  return db <= 0 ? ((db - EQ_KILL_DB) / -EQ_KILL_DB) * 0.5 : 0.5 + (db / EQ_BOOST_DB) * 0.5;
}
