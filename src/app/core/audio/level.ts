/** Nivel mas bajo (dB) que muestra un medidor: por debajo se ve apagado. */
export const METER_FLOOR_DB = -60;

/** Hasta que fraccion del medidor los segmentos son verdes y desde cual son rojos. */
const GREEN_UP_TO = 0.7;
const AMBER_UP_TO = 0.9;

export type SegmentZone = 'verde' | 'ambar' | 'rojo';

const clamp01 = (rawValue: number): number => Math.min(1, Math.max(0, rawValue));

/** Pasa una amplitud pico (0-1, escala lineal) a la posicion de un medidor en dB (0-1). */
export function peakToLevel(peak: number): number {
  if (!(peak > 0)) {
    return 0;
  }
  return clamp01((20 * Math.log10(peak) - METER_FLOOR_DB) / -METER_FLOOR_DB);
}

/** La mayor amplitud absoluta de un bloque de muestras. */
export function peakOf(samples: ArrayLike<number>): number {
  let max = 0;
  for (let i = 0; i < samples.length; i++) {
    const absoluteValue = Math.abs(samples[i]);
    if (absoluteValue > max) {
      max = absoluteValue;
    }
  }
  return max;
}

/** Cuanto conserva el medidor del nivel anterior en cada lectura: asi las barras caen suave y no parpadean. */
export const METER_DECAY = 0.8;
/** Por debajo de este nivel el medidor se apaga del todo. */
const METER_CUTOFF = 0.01;

/** Nivel que muestra el medidor: sube al instante y baja con una caida suave. */
export function smoothLevel(previous: number, current: number): number {
  const meterLevel = Math.max(current, previous * METER_DECAY);
  return meterLevel < METER_CUTOFF ? 0 : meterLevel;
}

/** Cuantos segmentos de un medidor de `count` se encienden para un nivel 0-1. */
export function litSegments(level: number, count: number): number {
  return Math.round(clamp01(level) * count);
}

/** Color de un segmento (el 0 es el de abajo): verde, ambar y el tramo final en rojo. */
export function segmentZone(index: number, count: number): SegmentZone {
  const currentPosition = (index + 1) / count;
  if (currentPosition <= GREEN_UP_TO) {
    return 'verde';
  }
  return currentPosition <= AMBER_UP_TO ? 'ambar' : 'rojo';
}
