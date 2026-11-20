import { isPlatformBrowser } from '@angular/common';
import { DestroyRef, Injectable, InjectionToken, PLATFORM_ID, inject } from '@angular/core';
import { AuthService } from './auth';
import { TrackApiService } from './tracks';

/** Cada cuanto se hace una consulta ligera para que los servidores no se duerman (ellos se duermen a los 15 minutos). */
export const KEEP_ALIVE_MS = new InjectionToken<number>('KEEP_ALIVE_MS', {
  providedIn: 'root',
  factory: () => 4 * 60 * 1000,
});

/** Si no hay actividad del usuario en tanto tiempo se deja de insistir, para no gastar las horas gratuitas del servidor. */
export const KEEP_ALIVE_IDLE_MS = new InjectionToken<number>('KEEP_ALIVE_IDLE_MS', {
  providedIn: 'root',
  factory: () => 2 * 60 * 60 * 1000,
});

/** Reloj en milisegundos; se puede reemplazar en las pruebas. */
export const KEEP_ALIVE_CLOCK = new InjectionToken<() => number>('KEEP_ALIVE_CLOCK', {
  providedIn: 'root',
  factory: () => () => Date.now(),
});

const ACTIVITY_EVENTS = ['pointerdown', 'keydown'] as const;

/**
 * Mantiene despiertos el API y el motor de IA mientras la aplicacion esta abierta y alguien la usa. En la nube gratuita
 * los servidores se duermen tras 15 minutos sin trafico y tardan hasta tres minutos en despertar: en plena sesion
 * eso significaria perder el acceso a la biblioteca o a guardar mezclas. Una consulta a la lista de pistas (que pasa
 * por el API hasta el motor) cada pocos minutos lo evita.
 *
 * Solo insiste mientras haya actividad reciente: si la pagina se queda abierta sin que nadie la toque durante horas,
 * deja que se duerman (los servidores gratuitos tienen un limite de horas al mes).
 */
@Injectable({ providedIn: 'root' })
export class KeepAliveService {
  private readonly tracks = inject(TrackApiService);
  private readonly auth = inject(AuthService);
  private readonly everyMs = inject(KEEP_ALIVE_MS);
  private readonly idleMs = inject(KEEP_ALIVE_IDLE_MS);
  private readonly now = inject(KEEP_ALIVE_CLOCK);
  private readonly destroyRef = inject(DestroyRef);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  private timer: ReturnType<typeof setInterval> | null = null;
  private lastActivity = this.now();
  private readonly onActivity = () => {
    this.lastActivity = this.now();
  };

  /** Empieza a vigilar. Es seguro llamarlo varias veces; fuera del navegador (render en servidor) no hace nada. */
  start(): void {
    if (this.timer !== null || !this.isBrowser) {
      return;
    }
    this.lastActivity = this.now();
    for (const domEvent of ACTIVITY_EVENTS) {
      window.addEventListener(domEvent, this.onActivity, { passive: true });
    }
    this.timer = setInterval(() => this.ping(), this.everyMs);
    this.destroyRef.onDestroy(() => this.stop());
  }

  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    for (const domEvent of ACTIVITY_EVENTS) {
      window.removeEventListener(domEvent, this.onActivity);
    }
  }

  private ping(): void {
    // Sin sesion iniciada (con login encendido) la consulta daria 401 y cerraria la sesion de nuevo: no se hace.
    const isAllowed = this.auth.enabled() === false || (this.auth.enabled() === true && this.auth.authenticated());
    const isActiveNow = this.now() - this.lastActivity < this.idleMs;
    if (!isAllowed || !isActiveNow) {
      return;
    }
    // Lo que responda da igual: basta con que la peticion llegue y despierte a los servidores.
    this.tracks.list().subscribe({ error: () => undefined });
  }
}
