import { Injectable, InjectionToken, inject, signal } from '@angular/core';
import { EMPTY, Subscription, auditTime, catchError, concatMap, groupBy, mergeMap, tap } from 'rxjs';
import { MidiService } from './midi';
import { TelemetryService } from './telemetry';

/**
 * Un fader o una perilla puede emitir cientos de mensajes por segundo. Por cada control se envia como
 * mucho un evento por ventana de este tamano (en milisegundos), y siempre el valor mas reciente.
 */
export const MIDI_THROTTLE_MS = new InjectionToken<number>('MIDI_THROTTLE_MS', {
  providedIn: 'root',
  factory: () => 50,
});

/** Envia al API Gateway los eventos del controlador MIDI seleccionado. */
@Injectable({ providedIn: 'root' })
export class MidiBridgeService {
  private readonly midi = inject(MidiService);
  private readonly telemetry = inject(TelemetryService);
  private readonly throttleMs = inject(MIDI_THROTTLE_MS);

  private subscription: Subscription | null = null;

  private readonly _active = signal(false);
  private readonly _sent = signal(0);
  private readonly _failed = signal(0);

  readonly active = this._active.asReadonly();
  /** Eventos que el API acepto. */
  readonly sent = this._sent.asReadonly();
  /** Eventos que el API rechazo o no pudo recibir. */
  readonly failed = this._failed.asReadonly();

  /** Empieza a reenviar al API los eventos del controlador. Llamarlo dos veces no duplica el envio. */
  start(): void {
    if (this.subscription) {
      return;
    }
    this.subscription = this.midi.events$
      .pipe(
        groupBy((event) => event.controlId),
        mergeMap((porControl) =>
          porControl.pipe(
            // Conserva solo el ultimo valor de cada ventana, para que el fader no quede desfasado.
            auditTime(this.throttleMs),
            // Envio ordenado por control: un valor viejo nunca pisa a uno mas nuevo.
            concatMap((event) =>
              this.telemetry.sendEvent(event).pipe(
                tap(() => this._sent.update((n) => n + 1)),
                catchError((err) => {
                  console.error('[MIDI] No se pudo enviar el evento al API:', err);
                  this._failed.update((n) => n + 1);
                  // Un fallo no debe cortar el flujo de los eventos siguientes.
                  return EMPTY;
                }),
              ),
            ),
          ),
        ),
      )
      .subscribe();
    this._active.set(true);
  }

  stop(): void {
    this.subscription?.unsubscribe();
    this.subscription = null;
    this._active.set(false);
  }

  /** Pone en cero los contadores de enviados y fallidos. */
  resetCounters(): void {
    this._sent.set(0);
    this._failed.set(0);
  }
}
