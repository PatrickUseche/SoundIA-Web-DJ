// Contratos del Auto-DJ, las sesiones y la cola (API Gateway de Spring Boot; el calculo lo hace el motor de IA).

/** Resumen de una pista tal como lo usa el motor de mezcla (no incluye `hasAudio`). */
export interface TrackSummary {
  id: number;
  title: string;
  bpm: number;
  camelot: string;
  energy: number;
  duration: number;
  cuePoints: number[];
}

/** Ajuste de velocidad necesario para igualar el tempo de dos pistas. */
export interface TempoMatchInfo {
  /** Factor a aplicar a la segunda pista. */
  ratio: number;
  /** 1 = tal cual; 0.5 / 2 = se mezcla a la mitad o al doble de tempo. */
  multiplier: number;
  /** El ajuste cabe en el rango del pitch fader (+-8 %). */
  feasible: boolean;
}

/** Que tan bien mezclan dos pistas (cada valor de 0 a 1). */
export interface CompatibilityInfo {
  score: number;
  tempo: number;
  harmonic: number;
  energy: number;
  tempoMatch: TempoMatchInfo;
}

export interface NextCandidate {
  track: TrackSummary;
  compatibility: CompatibilityInfo;
}

/** Respuesta de POST /autodj/next. */
export interface NextTracksResponse {
  current: TrackSummary;
  /** De mayor a menor compatibilidad. */
  candidates: NextCandidate[];
}

/** Un instante de la automatizacion de una transicion (todos los valores de 0 a 1). */
export interface AutomationPoint {
  /** 0 = solo suena la pista actual; 1 = solo la siguiente. */
  position: number;
  gainA: number;
  gainB: number;
  /** Graves, medios y agudos: 1 = abiertos, 0 = cortados. */
  lowA: number;
  lowB: number;
  midA: number;
  midB: number;
  highA: number;
  highB: number;
}

/** Respuesta de POST /autodj/transition. */
export interface TransitionPlan {
  fromTrackId: number;
  toTrackId: number;
  /**
   * "blend": las dos suenan a la vez con los tempos igualados; "fade": fundido corto porque los tempos no se
   * pueden igualar (la entrante suena a su ritmo); "cut": corte directo (sin duracion).
   */
  style: 'blend' | 'fade' | 'cut';
  bars: number;
  /** Duracion de la mezcla; 0 en un corte. */
  seconds: number;
  /** Segundo de la pista actual en que empieza la mezcla. */
  mixOutAt: number;
  /** Segundo de la pista siguiente desde el que se reproduce. */
  mixInAt: number;
  tempoMatch: TempoMatchInfo;
  compatibility: CompatibilityInfo;
  /** Una por pulso; vacia en un corte. */
  automation: AutomationPoint[];
  /** Segundos que el motor adelanto la salida porque el DJ suele pedir mezclar antes (0 si aun no aprendio). */
  mixOutAdvance?: number;
  /** De donde salen los compases y el cambio de graves: "model" si se uso el estilo aprendido del DJ, "rules" si no. */
  source?: 'model' | 'rules';
  /** Alguna de las dos pistas no tiene un tempo fijo: por eso la transicion es un fundido y no una mezcla igualada. */
  variableTempo?: boolean;
  learnedBars?: boolean;
  learnedBassSwap?: boolean;
}

/** Como le va al modelo del estilo del DJ frente a las reglas en un parametro (compases o cambio de graves). */
export interface StyleModelTarget {
  evaluated: number;
  rulesError: number | null;
  modelError: number | null;
  wins: boolean;
}

/** Respuesta de GET y POST /autodj/style-model. */
export interface StyleModelInfo {
  goodRecordings: number;
  required: number;
  ready: boolean;
  enabled: boolean;
  evaluation?: { bars: StyleModelTarget; bassSwap: StyleModelTarget };
  /** Que parametros se estan usando ahora (encendido y ganando a las reglas). */
  inUse?: { bars: boolean; bassSwap: boolean };
}

/** Respuesta de POST /autodj/timing: lo que el motor lleva aprendido de cuando mezclar. */
export interface MixTimingInfo {
  /** Veces que el DJ ha pedido mezclar antes de lo planeado. */
  samples: number;
  /** Segundos que se adelantan las mezclas ahora. */
  advanceSeconds: number;
  /** Si el motor ya adelanta sus mezclas por lo aprendido. */
  learned: boolean;
}

/** Sesion de DJ (POST/GET /sessions). */
export interface DjSession {
  id: number;
  name: string;
  startedAt: string;
  endedAt: string | null;
  active: boolean;
}

/** Pista en la cola de reproduccion de una sesion. */
export interface QueueItem {
  id: number;
  sessionId: number;
  trackId: number;
  addedAt: string;
}

/** Cuanto pesa cada criterio en la puntuacion de compatibilidad (valores de 0 a 1 que suman 1). */
export interface ScoringWeights {
  tempo: number;
  harmonic: number;
  energy: number;
}

/** Respuesta de GET /autodj/weights y de POST /autodj/feedback. */
export interface WeightsInfo {
  weights: ScoringWeights;
  /** true si los pesos se aprendieron de las valoraciones del DJ; false si son los de por defecto. */
  learned: boolean;
  /** Valoraciones acumuladas. */
  samples: number;
}
