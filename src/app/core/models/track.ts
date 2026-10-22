/** Pista analizada por el motor de IA (GET /api/v1/tracks). */
export interface Track {
  id: number;
  title: string;
  /** Segundos de audio analizados. */
  duration: number;
  bpm: number;
  /** Tonalidad legible, por ejemplo "C major". */
  key: string;
  /** Codigo de la rueda de Camelot (1A-12B) para mezclar armonicamente. */
  camelot: string;
  /** Energia media entre 0 y 1. */
  energy: number;
  /** Puntos de mezcla en segundos, de menor a mayor. */
  cuePoints: number[];
  /** Analisis de la voz del final de la pista (se hace aparte, en segundo plano). Las pistas antiguas no lo traen. */
  vocals?: {
    status: 'none' | 'pending' | 'running' | 'done' | 'failed' | 'unavailable';
    /** Segundo en que acaba la ultima frase cantada; null si no se analizo o no hay voz al final. */
    lastEnd: number | null;
  };
  /**
   * Rejilla de pulsos: los golpes caen en `offset + k * 60 / bpm`, y los compases empiezan en `downbeat` cada
   * 4 pulsos. `confidence` (0-1) es la seguridad de que `downbeat` sea de verdad el primer tiempo. null si la
   * pista no tiene un ritmo claro; las pistas antiguas no la traen. `manual` es verdadero si el DJ fijo el primer
   * tiempo a mano (entonces `confidence` es 1).
   */
  grid?: { offset: number; downbeat: number; confidence: number; manual?: boolean } | null;
  /** Si el backend guardo el audio original (las pistas analizadas antes de guardarlo no lo tienen). */
  hasAudio: boolean;
  createdAt: string;
}

export interface TrackList {
  tracks: Track[];
}
