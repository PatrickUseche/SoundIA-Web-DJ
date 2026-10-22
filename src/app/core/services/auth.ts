import { HttpClient } from '@angular/common/http';
import { Injectable, InjectionToken, computed, inject, signal } from '@angular/core';
import { Observable, catchError, map, of, tap } from 'rxjs';
import { environment } from '../../../environments/environment';

/** Donde se guarda la sesion (sessionStorage: se borra al cerrar la pestana); null si no hay (servidor, navegador privado). */
export const AUTH_STORAGE = new InjectionToken<Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null>(
  'AUTH_STORAGE',
  {
    providedIn: 'root',
    factory: () => {
      try {
        return typeof sessionStorage !== 'undefined' ? sessionStorage : null;
      } catch {
        return null; // algunos navegadores lanzan al acceder al almacenamiento cuando esta bloqueado
      }
    },
  },
);

export const AUTH_STORAGE_KEY = 'soundia.auth';

interface Session {
  token: string;
  /** ISO 8601. */
  expiresAt: string;
}

/**
 * Sesion del DJ con el API Gateway. La autenticacion del API es opcional (viene apagada por defecto): `status()`
 * dice si hay que pedir login. El token se guarda en sessionStorage y el interceptor lo envia en cada peticion.
 *
 * El token en el navegador es accesible a cualquier script de la pagina: no hay que cargar scripts de terceros.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly storage = inject(AUTH_STORAGE);
  private readonly baseUrl = `${environment.apiRootUrl}/auth`;

  private readonly _enabled = signal<boolean | null>(null);
  private readonly session = signal<Session | null>(this.load());

  /** Si el API exige login; null mientras no se sabe. */
  readonly enabled = this._enabled.asReadonly();
  /** El token vigente, o null si no hay sesion. */
  readonly token = computed(() => this.session()?.token ?? null);
  /** Hay una sesion y su token no ha caducado. */
  readonly authenticated = computed(() => {
    const session = this.session();
    return session !== null && Date.parse(session.expiresAt) > Date.now();
  });

  /**
   * Si el API exige login. Se pregunta una vez; si no se puede saber (el API no responde) se da por no exigido:
   * es solo la interfaz, el API es quien protege de verdad y, si lo exige, la primera peticion devolvera 401.
   */
  status(): Observable<boolean> {
    const known = this._enabled();
    if (known !== null) {
      return of(known);
    }
    return this.http.get<{ enabled: boolean }>(`${this.baseUrl}/status`).pipe(
      map((response) => response.enabled === true),
      tap((enabled) => this._enabled.set(enabled)),
      catchError(() => of(false)),
    );
  }

  login(username: string, password: string): Observable<void> {
    return this.http
      .post<{ token: string; expiresAt: string }>(`${this.baseUrl}/login`, { username, password })
      .pipe(
        tap((response) => {
          this._enabled.set(true);
          this.store({ token: response.token, expiresAt: response.expiresAt });
        }),
        map(() => undefined),
      );
  }

  logout(): void {
    this.session.set(null);
    try {
      this.storage?.removeItem(AUTH_STORAGE_KEY);
    } catch {
      // almacenamiento bloqueado: la sesion ya esta cerrada en memoria
    }
  }

  /** Ticket de vida muy corta para abrir el stream en vivo (EventSource no puede enviar el token en una cabecera). */
  streamTicket(): Observable<string> {
    return this.http
      .post<{ ticket: string }>(`${this.baseUrl}/stream-ticket`, {})
      .pipe(map((response) => response.ticket));
  }

  private store(session: Session): void {
    this.session.set(session);
    try {
      this.storage?.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
    } catch {
      // Sin espacio o bloqueado: la sesion sigue en memoria, solo no sobrevivira a recargar la pagina.
    }
  }

  /** Lee la sesion guardada, descartando todo lo que no sea valido o ya haya caducado. */
  private load(): Session | null {
    try {
      const raw = this.storage?.getItem(AUTH_STORAGE_KEY);
      const parsed: unknown = raw ? JSON.parse(raw) : null;
      if (!parsed || typeof parsed !== 'object') {
        return null;
      }
      const { token, expiresAt } = parsed as Partial<Session>;
      if (typeof token !== 'string' || token === '' || typeof expiresAt !== 'string') {
        return null;
      }
      return Date.parse(expiresAt) > Date.now() ? { token, expiresAt } : null;
    } catch {
      return null;
    }
  }
}
