import { Injectable, InjectionToken, PLATFORM_ID, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { EMPTY, Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ConnectionState, StreamEvent } from '../models/stream-messages';

// Valor de EventSource.CLOSED; se usa el numero para no depender del global (no existe al renderizar en servidor).
const EVENT_SOURCE_CLOSED = 2;

/** Crea el EventSource; se puede reemplazar en las pruebas. */
export const EVENT_SOURCE_FACTORY = new InjectionToken<(url: string) => EventSource>(
  'EVENT_SOURCE_FACTORY',
  { providedIn: 'root', factory: () => (url: string) => new EventSource(url) },
);

@Injectable({ providedIn: 'root' })
export class TelemetryStreamService {
  private readonly createEventSource = inject(EVENT_SOURCE_FACTORY);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  private readonly _state = signal<ConnectionState>('closed');
  /** Estado actual de la conexion. */
  readonly state = this._state.asReadonly();

  /**
   * Abre el flujo en vivo mientras haya un suscriptor y lo cierra al cancelar la suscripcion.
   * EventSource reconecta solo si se corta la conexion; el estado lo refleja.
   */
  connect(): Observable<StreamEvent> {
    // EventSource solo existe en el navegador.
    if (!this.isBrowser) {
      return EMPTY;
    }

    return new Observable<StreamEvent>((subscriber) => {
      this._state.set('connecting');
      const source = this.createEventSource(`${environment.apiBaseUrl}/stream`);

      source.onopen = () => this._state.set('open');
      source.onerror = () =>
        this._state.set(source.readyState === EVENT_SOURCE_CLOSED ? 'closed' : 'reconnecting');

      const listen = (type: StreamEvent['type']) =>
        source.addEventListener(type, (event) => {
          try {
            const data = JSON.parse((event as MessageEvent<string>).data);
            subscriber.next({ type, data } as StreamEvent);
          } catch (err) {
            // Un mensaje mal formado no debe cortar el flujo.
            console.warn(`[Stream] Mensaje "${type}" ignorado por no ser JSON valido:`, err);
          }
        });
      listen('midi');
      listen('decision');

      return () => {
        source.close();
        this._state.set('closed');
      };
    });
  }
}
