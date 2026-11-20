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

/** Ancho de cada barra y hueco entre barras, en pixeles del lienzo. */
export const BAR_WIDTH = 3;
export const BAR_GAP = 3;

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
  // Barras separadas por un hueco: una por cada BAR_WIDTH + BAR_GAP pixeles, con el pico mas alto de su tramo.
  const step = BAR_WIDTH + BAR_GAP;
  const bars = Math.max(1, Math.floor(width / step));
  for (let i = 0; i < bars; i++) {
    const from = Math.floor((i / bars) * peaks.length);
    const to = Math.max(from + 1, Math.floor(((i + 1) / bars) * peaks.length));
    let peak = 0;
    for (let k = from; k < to && k < peaks.length; k++) {
      peak = Math.max(peak, peaks[k]);
    }
    const x = i * step;
    // Un minimo de 1 px para que el silencio siga viendose como una linea.
    const barHeight = Math.max(1, peak * height);
    ctx.fillStyle = x + BAR_WIDTH / 2 <= playedUntil ? colors.played : colors.remaining;
    ctx.fillRect(x, (height - barHeight) / 2, BAR_WIDTH, barHeight);
  }

  ctx.fillStyle = colors.cue;
  for (const cue of cues) {
    if (cue >= 0 && cue <= 1) {
      ctx.fillRect(Math.min(width - 2, Math.round(cue * width)), 0, 2, height);
    }
  }

  ctx.fillStyle = colors.playhead;
  ctx.fillRect(Math.min(width - 2, Math.round(playedUntil)), 0, 2, height);
}
