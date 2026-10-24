export interface WaveformColors {
  /** Parte ya reproducida. */
  played: string;
  /** Parte por reproducir. */
  remaining: string;
  /** Linea de la posicion actual. */
  playhead: string;
  /** Marcas de los puntos de mezcla. */
  cue: string;
}

export const DEFAULT_WAVEFORM_COLORS: WaveformColors = {
  played: '#4caf50',
  remaining: '#9e9e9e',
  playhead: '#ffffff',
  cue: '#ffb300',
};

/**
 * Colores de la onda de cada deck: la parte reproducida lleva el color del deck (el mismo que --deck-a y --deck-b de
 * styles.css, que un canvas no puede leer) para distinguir A de B de un vistazo con poca luz.
 */
export const DECK_WAVEFORM_COLORS: Record<'A' | 'B', WaveformColors> = {
  A: { played: '#22d3ee', remaining: '#4b5169', playhead: '#ffffff', cue: '#fbbf24' },
  B: { played: '#f472b6', remaining: '#4b5169', playhead: '#ffffff', cue: '#fbbf24' },
};

/** Parte del contexto 2D que usa el dibujo (permite probarlo con un contexto falso). */
export type Canvas2D = Pick<CanvasRenderingContext2D, 'clearRect' | 'fillRect' | 'fillStyle'>;

/**
 * Dibuja la forma de onda: una barra por columna de pixeles, centrada en vertical y coloreada segun
 * este antes o despues de la posicion actual; encima, la linea de reproduccion y los puntos de mezcla.
 *
 * `progress` y `cues` son fracciones de la duracion de la pista (0 a 1).
 */
export function drawWaveform(
  ctx: Canvas2D,
  peaks: Float32Array | null,
  width: number,
  height: number,
  progress: number,
  cues: number[] = [],
  colors: WaveformColors = DEFAULT_WAVEFORM_COLORS,
): void {
  ctx.clearRect(0, 0, width, height);
  if (!peaks || peaks.length === 0 || width <= 0 || height <= 0) {
    return;
  }

  const playedUntil = Math.min(1, Math.max(0, progress)) * width;
  for (let x = 0; x < width; x++) {
    const peak = peaks[Math.min(peaks.length - 1, Math.floor((x / width) * peaks.length))];
    // Un minimo de 1 px para que el silencio siga viendose como una linea.
    const barHeight = Math.max(1, peak * height);
    ctx.fillStyle = x < playedUntil ? colors.played : colors.remaining;
    ctx.fillRect(x, (height - barHeight) / 2, 1, barHeight);
  }

  ctx.fillStyle = colors.cue;
  for (const cue of cues) {
    if (cue >= 0 && cue <= 1) {
      ctx.fillRect(Math.min(width - 2, Math.round(cue * width)), 0, 2, height);
    }
  }

  ctx.fillStyle = colors.playhead;
  ctx.fillRect(Math.min(width - 1, Math.round(playedUntil)), 0, 1, height);
}
