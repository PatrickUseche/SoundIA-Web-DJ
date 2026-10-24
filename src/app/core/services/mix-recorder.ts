import { isPlatformBrowser } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { DestroyRef, Injectable, InjectionToken, PLATFORM_ID, inject, signal } from '@angular/core';
import { DeckId } from '../audio/deck';
import { crossfaderGains } from '../audio/crossfader';
import { httpErrorMessage } from '../http-error-message';
import { DeckSample, MixSample, RecordedTransition, TransitionDetector } from '../learning/transition-detector';
import { RecordingRequest } from '../models/recording';
import { MixerService } from './mixer';
import { RecordingApiService } from './recordings';
import { TransitionRunnerService } from './transition-runner';

/** Cada cuanto se mira el mezclador (ms): 20 veces por segundo bastan para seguir un fader. */
export const RECORDER_SAMPLE_MS = 50;
export const RECORDER_STORAGE_KEY = 'soundia.recorder';
/** Donde se guardan las mezclas que aun no se pudieron enviar, para no perderlas si se cierra o recarga la pagina. */
export const RECORDER_PENDING_KEY = 'soundia.recorder.pendientes';
/** Mas de estas no se acumulan: se descartan las mas antiguas. */
export const RECORDER_MAX_PENDING = 50;

/** Esperas (ms) entre reintentos cuando el servidor no responde (dormido o reiniciandose); la ultima se repite. */
export const RECORDER_RETRY_MS = new InjectionToken<number[]>('RECORDER_RETRY_MS', {
  providedIn: 'root',
  factory: () => [5000, 10000, 20000, 30000],
});

/** Errores que se arreglan solos esperando: sin conexion o el servidor despertando, reiniciandose o saturado. */
const TRANSIENT_STATUSES = [0, 408, 429, 502, 503, 504];
/** Alias con el que se guardan las mezclas (nunca el nombre real del DJ). */
export const RECORDER_DJ_ALIAS = 'dj';

/** Reloj en segundos que solo avanza; se puede reemplazar en las pruebas. */
export const RECORDER_CLOCK = new InjectionToken<() => number>('RECORDER_CLOCK', {
  providedIn: 'root',
  factory: () => () => performance.now() / 1000,
});

/** Donde se recuerda si el grabador esta encendido (localStorage); null si no hay. */
export const RECORDER_STORAGE = new InjectionToken<Pick<Storage, 'getItem' | 'setItem'> | null>('RECORDER_STORAGE', {
  providedIn: 'root',
  factory: () => {
    try {
      return typeof localStorage !== 'undefined' ? localStorage : null;
    } catch {
      return null; // algunos navegadores lanzan al acceder al almacenamiento cuando esta bloqueado
    }
  },
});

/**
 * Modo aprendizaje: mientras esta encendido mira el mezclador y, cada vez que el DJ hace una transicion a mano entre
 * dos pistas de la biblioteca, la envia al API Gateway para que el sistema aprenda su estilo. Es opt-in (viene
 * apagado). Las transiciones del Auto-DJ no se graban: se aprende de lo que hace el DJ, no de lo que hace la maquina.
 */
@Injectable({ providedIn: 'root' })
export class MixRecorderService {
  private readonly mixer = inject(MixerService);
  private readonly runner = inject(TransitionRunnerService);
  private readonly api = inject(RecordingApiService);
  private readonly clock = inject(RECORDER_CLOCK);
  private readonly storage = inject(RECORDER_STORAGE);
  private readonly retryMs = inject(RECORDER_RETRY_MS);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly detector = new TransitionDetector();

  private timer: ReturnType<typeof setInterval> | null = null;

  /** Mezclas grabadas que aun no se han podido enviar, de la mas antigua a la mas nueva (tambien en el almacenamiento). */
  private pending: RecordingRequest[] = [];
  private sending = false;
  private attempts = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly _pendingCount = signal(0);

  private readonly _enabled = signal(false);
  private readonly _recording = signal(false);
  private readonly _saved = signal(0);
  private readonly _failed = signal(0);
  private readonly _message = signal<{ text: string; error: boolean } | null>(null);

  /** El modo aprendizaje esta encendido. */
  readonly enabled = this._enabled.asReadonly();
  /** Hay una mezcla en curso que se esta siguiendo. */
  readonly recording = this._recording.asReadonly();
  /** Mezclas guardadas en esta sesion de la pagina. */
  readonly saved = this._saved.asReadonly();
  readonly failed = this._failed.asReadonly();
  /** Mezclas grabadas que esperan a poder enviarse (el servidor esta dormido o no hay conexion). */
  readonly pendingCount = this._pendingCount.asReadonly();
  /** Resultado de la ultima mezcla, para mostrarlo. */
  readonly message = this._message.asReadonly();

  /** El navegador tiene Web Audio, que es lo que hace falta para mezclar y, por tanto, para grabar. */
  get supported(): boolean {
    return this.isBrowser && this.mixer.supported;
  }

  constructor() {
    try {
      if (this.storage?.getItem(RECORDER_STORAGE_KEY) === '1') {
        this.setEnabled(true, false);
      }
    } catch {
      // almacenamiento bloqueado: arranca apagado
    }
    this.loadPending();
    if (this.isBrowser) {
      const warn = (event: BeforeUnloadEvent) => {
        // Cerrar la pagina ahora perderia una mezcla a medias o grabaciones que aun no se enviaron.
        if (this._pendingCount() > 0 || this._recording()) {
          event.preventDefault();
          event.returnValue = '';
        }
      };
      window.addEventListener('beforeunload', warn);
      inject(DestroyRef).onDestroy(() => window.removeEventListener('beforeunload', warn));
    }
    inject(DestroyRef).onDestroy(() => {
      this.stop();
      this.clearRetry();
    });
    // Lo que quedo sin enviar en otra sesion se intenta de nuevo al abrir la pagina.
    if (this.pending.length > 0) {
      this.retryTimer = setTimeout(() => this.flush(), 1000);
    }
  }

  setEnabled(enabled: boolean, remember = true): void {
    if (enabled && !this.supported) {
      return;
    }
    this._enabled.set(enabled);
    if (enabled) {
      this.flush();
    }
    if (remember) {
      try {
        this.storage?.setItem(RECORDER_STORAGE_KEY, enabled ? '1' : '0');
      } catch {
        // sin espacio o bloqueado: solo no se recordara tras recargar la pagina
      }
    }
    if (enabled) {
      this.start();
    } else {
      this.stop();
    }
  }

  private start(): void {
    if (this.timer !== null) {
      return;
    }
    this.detector.reset();
    this.timer = setInterval(() => this.tick(), RECORDER_SAMPLE_MS);
  }

  private stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.detector.reset();
    this._recording.set(false);
  }

  private tick(): void {
    // Las transiciones que hace el Auto-DJ no son del DJ: ni se graban ni se mezclan con las suyas.
    if (this.runner.running()) {
      this.detector.reset();
      this._recording.set(false);
      return;
    }
    const finished = this.detector.push(this.sample());
    this._recording.set(this.detector.recording);
    if (finished) {
      this.save(finished);
    }
  }

  private sample(): MixSample {
    const crossfader = this.mixer.crossfader();
    const gains = crossfaderGains(crossfader);
    const read = (id: DeckId, gain: number): DeckSample => {
      const deck = this.mixer.deck(id);
      return {
        trackId: deck.track()?.id ?? null,
        playing: deck.playing(),
        position: deck.position(),
        pitch: deck.pitch(),
        volume: deck.volume(),
        gain,
        eq: deck.eq(),
      };
    };
    return { time: this.clock(), crossfader, decks: { A: read('A', gains.a), B: read('B', gains.b) } };
  }

  private save(mix: RecordedTransition): void {
    const body: RecordingRequest = {
      fromTrackId: mix.fromTrackId,
      toTrackId: mix.toTrackId,
      source: 'manual',
      dj: RECORDER_DJ_ALIAS,
      mixOutAt: mix.mixOutAt,
      mixInAt: mix.mixInAt,
      overlapSeconds: mix.overlapSeconds,
      pitchA: mix.pitchA,
      pitchB: mix.pitchB,
      curves: mix.curves,
    };
    this.pending.push(body);
    if (this.pending.length > RECORDER_MAX_PENDING) {
      this.pending.splice(0, this.pending.length - RECORDER_MAX_PENDING);
    }
    this.persistPending();
    this.flush();
  }

  /** Envia las mezclas pendientes de una en una, de la mas antigua a la mas nueva. */
  private flush(): void {
    if (this.sending || this.pending.length === 0) {
      return;
    }
    this.clearRetry();
    this.sending = true;
    this.api.create(this.pending[0]).subscribe({
      next: (saved) => {
        this.sending = false;
        this.attempts = 0;
        this.pending.shift();
        this.persistPending();
        this._saved.update((n) => n + 1);
        this._message.set({
          text: `Mezcla grabada: ${saved.features.overlapBars.toFixed(1)} compases de solape.`,
          error: false,
        });
        this.flush();
      },
      error: (err: unknown) => {
        this.sending = false;
        const status = err instanceof HttpErrorResponse ? err.status : -1;
        if (TRANSIENT_STATUSES.includes(status)) {
          // El servidor esta dormido o reiniciandose: la mezcla se conserva y se reintenta sola.
          const wait = this.retryMs[Math.min(this.attempts, this.retryMs.length - 1)];
          this.attempts++;
          this._message.set({
            text: `El servidor no responde: ${this.pending.length} mezcla(s) esperan para guardarse. Se reintenta solo; no cierres la pagina.`,
            error: true,
          });
          this.retryTimer = setTimeout(() => this.flush(), wait);
        } else if (status === 401) {
          // La sesion caduco: se conservan las mezclas y se guardaran al volver a iniciar sesion.
          this._message.set({
            text: 'La sesion caduco: inicia sesion de nuevo y las mezclas pendientes se guardaran.',
            error: true,
          });
        } else {
          // Un error de la propia mezcla (invalida, una pista ya borrada...): reintentar no lo arreglaria.
          this.pending.shift();
          this.persistPending();
          this._failed.update((n) => n + 1);
          this._message.set({ text: httpErrorMessage(err, 'No se pudo guardar la mezcla.'), error: true });
          this.flush();
        }
      },
    });
  }

  private clearRetry(): void {
    if (this.retryTimer !== null) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
  }

  private persistPending(): void {
    this._pendingCount.set(this.pending.length);
    try {
      this.storage?.setItem(RECORDER_PENDING_KEY, JSON.stringify(this.pending));
    } catch {
      // sin espacio o bloqueado: las pendientes siguen en memoria, solo no sobreviven a recargar
    }
  }

  private loadPending(): void {
    try {
      const raw = this.storage?.getItem(RECORDER_PENDING_KEY);
      const data: unknown = raw ? JSON.parse(raw) : [];
      if (Array.isArray(data)) {
        this.pending = data
          .filter((x): x is RecordingRequest => !!x && typeof x === 'object' && 'fromTrackId' in x && 'toTrackId' in x)
          .slice(-RECORDER_MAX_PENDING);
      }
    } catch {
      this.pending = []; // contenido danado: se ignora
    }
    this._pendingCount.set(this.pending.length);
  }
}
