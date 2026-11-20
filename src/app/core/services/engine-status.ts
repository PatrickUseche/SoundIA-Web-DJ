import { HttpClient } from '@angular/common/http';
import { isPlatformBrowser } from '@angular/common';
import {
  DestroyRef, Injectable, InjectionToken, Injector, PLATFORM_ID, computed, effect, inject, signal, untracked,
} from '@angular/core';
import { environment } from '../../../environments/environment';
import { EngineState } from '../models/engine-status';
import { AuthService } from './auth';

/** Cada cuanto se consulta el estado del motor mientras la pagina esta a la vista. */
export const ENGINE_STATUS_POLL_MS = new InjectionToken<number>('ENGINE_STATUS_POLL_MS', {
  providedIn: 'root',
  factory: () => 30 * 1000,
});

/**
 * El estado del motor de IA para mostrarlo en la barra. Spring lo calcula con lo que pasa en sus llamadas a Django
 * (no despierta al motor al consultarlo), asi que sirve para saber si el Auto-DJ va a responder antes de pedirselo.
 *
 * `state` es null mientras no se sabe nada: sin respuesta del API, o sin sesion con el login encendido. Entonces la
 * barra no dice nada del motor, porque ya avisa de que el servidor no responde.
 */
@Injectable({ providedIn: 'root' })
export class EngineStatusService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly everyMs = inject(ENGINE_STATUS_POLL_MS);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly url = `${environment.apiRootUrl}/engine/status`;

  private readonly _state = signal<EngineState | null>(null);
  readonly state = this._state.asReadonly();
  /** Se puede consultar: sin login, o con el login encendido y la sesion iniciada. */
  private readonly allowed = computed(
    () => this.auth.enabled() === false || (this.auth.enabled() === true && this.auth.authenticated()),
  );

  private timer: ReturnType<typeof setInterval> | null = null;

  /** Empieza a consultar. Es seguro llamarlo varias veces; fuera del navegador (render en servidor) no hace nada. */
  start(): void {
    if (this.timer !== null || !this.isBrowser) {
      return;
    }
    this.timer = setInterval(() => this.refresh(), this.everyMs);
    // Consulta nada mas saber si se puede (al conocerse la configuracion del login o al iniciar sesion).
    const effectRef = effect(
      () => {
        if (this.allowed()) {
          untracked(() => this.refresh());
        } else {
          untracked(() => this._state.set(null));
        }
      },
      { injector: this.injector },
    );
    this.destroyRef.onDestroy(() => {
      effectRef.destroy();
      this.stop();
    });
  }

  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Consulta una vez; si el API no responde, se olvida el ultimo estado en vez de mostrar uno viejo. */
  refresh(): void {
    // Con la pestana oculta nadie lo ve: no se gastan peticiones.
    if (!this.allowed() || (typeof document !== 'undefined' && document.hidden)) {
      return;
    }
    this.http.get<{ state: EngineState }>(this.url).subscribe({
      next: (info) => this._state.set(info.state),
      error: () => this._state.set(null),
    });
  }
}
