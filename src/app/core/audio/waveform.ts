/**
 * Resume una senal de audio en `buckets` picos para dibujar su forma de onda: cada pico es la amplitud
 * maxima (en valor absoluto) del tramo que le corresponde. Si la senal es mas corta que `buckets`, los
 * ultimos picos quedan en cero.
 */
export function computePeaks(channelData: ArrayLike<number>, buckets: number): Float32Array {
  if (!Number.isInteger(buckets) || buckets < 1) {
    throw new RangeError('buckets debe ser un entero positivo.');
  }

  const peaks = new Float32Array(buckets);
  const samplesPerBucket = Math.max(1, Math.floor(channelData.length / buckets));
  for (let bucket = 0; bucket < buckets; bucket++) {
    const start = bucket * samplesPerBucket;
    // El ultimo pico absorbe las muestras sobrantes de la division entera.
    const end = bucket === buckets - 1 ? channelData.length : Math.min(start + samplesPerBucket, channelData.length);
    let max = 0;
    for (let i = start; i < end; i++) {
      const amplitude = Math.abs(channelData[i]);
      if (amplitude > max) {
        max = amplitude;
      }
    }
    peaks[bucket] = max;
  }
  return peaks;
}

/** Escala los picos para que el mayor valga 1 (una pista baja se ve igual de grande que una fuerte). */
export function normalizePeaks(peaks: Float32Array): Float32Array {
  let max = 0;
  for (const peak of peaks) {
    if (peak > max) {
      max = peak;
    }
  }
  if (max === 0) {
    return peaks.slice();
  }
  return peaks.map((peak) => peak / max);
}
