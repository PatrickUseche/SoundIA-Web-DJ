/** Nivel mas bajo (dB) que muestra un medidor: por debajo se ve apagado. */
export const METER_FLOOR_DB = -60;

/** Hasta que fraccion del medidor los segmentos son verdes y desde cual son rojos. */
const GREEN_UP_TO = 0.7;
const AMBER_UP_TO = 0.9;

export type SegmentZone = 'verde' | 'ambar' | 'rojo';

const clamp01 = (valor: number): number => Math.min(1, Math.max(0, valor));

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
    const absoluto = Math.abs(samples[i]);
    if (absoluto > max) {
      max = absoluto;
    }
  }
  return max;
}

/** Cuantos segmentos de un medidor de `count` se encienden para un nivel 0-1. */
export function litSegments(level: number, count: number): number {
  return Math.round(clamp01(level) * count);
}

/** Color de un segmento (el 0 es el de abajo): verde, ambar y el tramo final en rojo. */
export function segmentZone(index: number, count: number): SegmentZone {
  const posicion = (index + 1) / count;
  if (posicion <= GREEN_UP_TO) {
    return 'verde';
  }
  return posicion <= AMBER_UP_TO ? 'ambar' : 'rojo';
}
