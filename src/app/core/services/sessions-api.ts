import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, of, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { DjSession, QueueItem } from '../models/autodj';

/** Sesiones de DJ y su cola de reproduccion. */
@Injectable({ providedIn: 'root' })
export class SessionsApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiRootUrl}/sessions`;

  /** Inicia una sesion; el API responde 409 si ya hay una abierta. */
  start(name: string): Observable<DjSession> {
    return this.http.post<DjSession>(this.baseUrl, { name });
  }

  /** Cierra una sesion; el API responde 409 si ya estaba cerrada. */
  end(id: number): Observable<DjSession> {
    return this.http.post<DjSession>(`${this.baseUrl}/${id}/end`, null);
  }

  /** La sesion abierta, o null si no hay ninguna (el API responde 404 en ese caso). */
  active(): Observable<DjSession | null> {
    return this.http.get<DjSession>(`${this.baseUrl}/active`).pipe(
      catchError((error: unknown) =>
        error instanceof HttpErrorResponse && error.status === 404 ? of(null) : throwError(() => error),
      ),
    );
  }

  /** Las 20 sesiones mas recientes. */
  list(): Observable<DjSession[]> {
    return this.http.get<DjSession[]>(this.baseUrl);
  }

  /** La cola de la sesion en orden de reproduccion. */
  queue(sessionId: number): Observable<QueueItem[]> {
    return this.http.get<QueueItem[]>(`${this.baseUrl}/${sessionId}/queue`);
  }

  /** Agrega una pista al final de la cola. */
  enqueue(sessionId: number, trackId: number): Observable<QueueItem> {
    return this.http.post<QueueItem>(`${this.baseUrl}/${sessionId}/queue`, { trackId });
  }

  /** Saca de la cola la pista que toca reproducir; 404 si la cola esta vacia. */
  pollNext(sessionId: number): Observable<QueueItem> {
    return this.http.post<QueueItem>(`${this.baseUrl}/${sessionId}/queue/next`, null);
  }

  /** Quita un elemento de la cola. */
  removeFromQueue(sessionId: number, itemId: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${sessionId}/queue/${itemId}`);
  }
}
