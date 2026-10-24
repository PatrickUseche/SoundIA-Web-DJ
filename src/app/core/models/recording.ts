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

/** Revision del DJ de una grabacion: solo las `good` deberian usarse para entrenar. */
export type RecordingQuality = 'unreviewed' | 'good' | 'discard';

/** Rasgos que el motor calcula de cada grabacion (los que se muestran al revisarla). */
export interface RecordingFeatures {
  /** Compases que suenan las dos pistas a la vez. */
  overlapBars: number;
  /** Como movio el crossfader: corte, gradual o lento; null si no hay curva. */
  crossfaderShape: 'corte' | 'gradual' | 'lento' | null;
  /** En que fraccion (0-1) del solape bajo el grave de la pista que sale; null si no se pudo ver. */
  bassSwapAt: number | null;
  /** Desfase de los pulsos al entrar la segunda pista, en milisegundos; null si no hay rejilla. */
  phaseErrorMs: number | null;
}

/** Una grabacion tal como la lista el API (sin curvas ni fotos de las pistas). */
export interface RecordingSummary {
  id: number;
  fromTrackId: number | null;
  toTrackId: number | null;
  source: 'manual' | 'autodj';
  dj: string;
  mixOutAt: number;
  mixInAt: number;
  overlapSeconds: number;
  genreA: string;
  genreB: string;
  quality: RecordingQuality;
  notes: string;
  createdAt: string;
  features: RecordingFeatures;
}

export interface RecordingCounts {
  unreviewed: number;
  good: number;
  discard: number;
  total: number;
}

export interface RecordingList {
  recordings: RecordingSummary[];
  counts: RecordingCounts;
}

/** Cambios de la revision de una grabacion (al menos uno). */
export interface RecordingReview {
  quality?: RecordingQuality;
  notes?: string;
}
