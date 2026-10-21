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
  /** Si el backend guardo el audio original (las pistas analizadas antes de guardarlo no lo tienen). */
  hasAudio: boolean;
  createdAt: string;
}

export interface TrackList {
  tracks: Track[];
}
