import { DeckCurves, Curve } from '../learning/transition-detector';

/** Cuerpo de POST /recordings: una transicion tal como la hizo el DJ (ver el README del motor de IA). */
export interface RecordingRequest {
  fromTrackId: number;
  toTrackId: number;
  source: 'manual' | 'autodj';
  /** Alias de quien mezclo; nunca su nombre real. */
  dj: string;
  /** Segundo de la pista que sale en que entra la otra. */
  mixOutAt: number;
  /** Segundo de la pista que entra desde el que suena. */
  mixInAt: number;
  overlapSeconds: number;
  pitchA: number;
  pitchB: number;
  curves: { crossfader: Curve; a: DeckCurves; b: DeckCurves };
}

/** Lo que devuelve el API al guardar una grabacion (solo lo que usa el front). */
export interface SavedRecording {
  id: number;
  quality: 'unreviewed' | 'good' | 'discard';
  features: { overlapBars: number; crossfaderShape: string | null; bassSwapAt: number | null };
}
