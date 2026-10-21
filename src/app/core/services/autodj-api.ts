import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { NextTracksResponse, TransitionPlan } from '../models/autodj';

/** Recomendaciones de la IA: que pista sigue y como mezclarla. */
@Injectable({ providedIn: 'root' })
export class AutoDjApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiRootUrl}/autodj`;

  /** Las pistas que mejor siguen a `trackId`, de mayor a menor compatibilidad (`limit` de 1 a 20). */
  nextTracks(trackId: number, limit?: number): Observable<NextTracksResponse> {
    const body: { trackId: number; limit?: number } = { trackId };
    if (limit !== undefined) {
      body.limit = limit;
    }
    return this.http.post<NextTracksResponse>(`${this.baseUrl}/next`, body);
  }

  /** Plan de transicion entre dos pistas: estilo, compases, puntos de mezcla y curvas de EQ. */
  transition(fromTrackId: number, toTrackId: number): Observable<TransitionPlan> {
    return this.http.post<TransitionPlan>(`${this.baseUrl}/transition`, { fromTrackId, toTrackId });
  }
}
