import { Injectable, InjectionToken, PLATFORM_ID, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { EMPTY, Observable, Subscription } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ConnectionState, StreamEvent } from '../models/stream-messages';
import { AuthService } from './auth';

// Valor de EventSource.CLOSED; se usa el numero para no depender del global (no existe al renderizar en servidor).
const EVENT_SOURCE_CLOSED = 2;

/** Con login, espera esto antes de pedir un ticket nuevo y reabrir el stream si se corta (ms). */
export const STREAM_RECONNECT_MS = 3000;

/** Crea el EventSource; se puede reemplazar en las pruebas. */
export const EVENT_SOURCE_FACTORY = new InjectionToken<(url: string) => EventSource>(
  'EVENT_SOURCE_FACTORY',
  { providedIn: 'root', factory: () => (url: string) => new EventSource(url) },
);

@Injectable({ providedIn: 'root' })
export class TelemetryStreamService {
  private readonly createEventSource = inject(EVENT_SOURCE_FACTORY);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly auth = inject(AuthService);

  private readonly _state = signal<ConnectionState>('closed');
  /** Estado actual de la conexion. */
  readonly state = this._state.asReadonly();

  /**
   * Abre el flujo en vivo mientras haya un suscriptor y lo cierra al cancelar la suscripcion.
   * Sin login, EventSource reconecta solo si se corta la conexion; el estado lo refleja. Con login el API exige un
   * ticket de 30 s en la URL: la reconexion automatica reutilizaria uno vencido, asi que se cierra la conexion y se
   * pide un ticket nuevo para reabrirla.
   */
  connect(): Observable<StreamEvent> {
    // EventSource solo existe en el navegador.
    if (!this.isBrowser) {
      return EMPTY;
    }

    return new Observable<StreamEvent>((subscriber) => {
      this._state.set('connecting');
      const withTicket = this.auth.enabled() === true;
      let source: EventSource | null = null;
      let ticketRequest: Subscription | null = null;
      let retryTimer: ReturnType<typeof setTimeout> | null = null;

      const listen = (current: EventSource, type: StreamEvent['type']) =>
        current.addEventListener(type, (event) => {
          try {
            const data = JSON.parse((event as MessageEvent<string>).data);
            subscriber.next({ type, data } as StreamEvent);
          } catch (err) {
            // Un mensaje mal formado no debe cortar el flujo.
            console.warn(`[Stream] Mensaje "${type}" ignorado por no ser JSON valido:`, err);
          }
        });

      const scheduleReconnect = () => {
        this._state.set('reconnecting');
        retryTimer = setTimeout(open, STREAM_RECONNECT_MS);
      };

      const attach = (url: string) => {
        const current = this.createEventSource(url);
        source = current;
        current.onopen = () => this._state.set('open');
        current.onerror = () => {
          if (withTicket) {
            current.close();
            source = null;
            scheduleReconnect();
          } else {
            this._state.set(current.readyState === EVENT_SOURCE_CLOSED ? 'closed' : 'reconnecting');
          }
        };
        listen(current, 'midi');
        listen(current, 'decision');
      };

      const open = () => {
        retryTimer = null;
        if (!withTicket) {
          attach(`${environment.apiBaseUrl}/stream`);
          return;
        }
        ticketRequest = this.auth.streamTicket().subscribe({
          next: (ticket) => attach(`${environment.apiBaseUrl}/stream?ticket=${encodeURIComponent(ticket)}`),
          error: (err: unknown) => {
            // Un 401 ya cerro la sesion y llevo al login (interceptor): no tiene sentido reintentar.
            if (err instanceof HttpErrorResponse && err.status === 401) {
              this._state.set('closed');
            } else {
              scheduleReconnect();
            }
          },
        });
      };
      open();

      return () => {
        if (retryTimer !== null) {
          clearTimeout(retryTimer);
        }
        ticketRequest?.unsubscribe();
        source?.close();
        this._state.set('closed');
      };
    });
  }
}
