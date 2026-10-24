import { Injectable, InjectionToken, inject, signal } from '@angular/core';

/** Milisegundos que una peticion al API puede tardar antes de avisar al usuario de que algo va lento. */
export const WAKE_NOTICE_DELAY_MS = new InjectionToken<number>('WAKE_NOTICE_DELAY_MS', {
  providedIn: 'root',
  factory: () => 8000,
});

/**
 * Avisa de que el API esta tardando mas de lo normal. En la nube gratuita los servidores se duermen tras unos minutos
 * sin uso y tardan hasta uno o dos minutos en despertar: sin este aviso la pantalla parece colgada.
 *
 * Cuenta las peticiones en curso; si la primera lleva `WAKE_NOTICE_DELAY_MS` sin terminar, `slow` pasa a verdadero, y
 * vuelve a falso en cuanto no queda ninguna en curso.
 */
@Injectable({ providedIn: 'root' })
export class WakeNoticeService {
  private readonly delay = inject(WAKE_NOTICE_DELAY_MS);
  private pending = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;

  /** Hay peticiones que llevan demasiado esperando respuesta. */
  readonly slow = signal(false);

  /**
   * Si el servidor contesto la ultima vez que se le hablo: verdadero (contesto, aunque fuera con un error de la
   * aplicacion), falso (sin conexion o el proxy respondio 502, 503 o 504) o null si aun no se ha hablado con el.
   */
  readonly reachable = signal<boolean | null>(null);

  begin(): void {
    this.pending++;
    if (this.pending === 1) {
      this.timer = setTimeout(() => {
        this.timer = null;
        if (this.pending > 0) {
          this.slow.set(true);
        }
      }, this.delay);
    }
  }

  end(): void {
    this.pending = Math.max(0, this.pending - 1);
    if (this.pending === 0) {
      if (this.timer !== null) {
        clearTimeout(this.timer);
        this.timer = null;
      }
      this.slow.set(false);
    }
  }
}
