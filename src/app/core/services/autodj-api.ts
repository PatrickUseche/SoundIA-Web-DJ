import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { MixTimingInfo, NextTracksResponse, StyleModelInfo, TransitionPlan, WeightsInfo } from '../models/autodj';

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

  /** El DJ valora una transicion (me gusto / no me gusto); el motor reajusta sus pesos con ella. */
  sendFeedback(fromTrackId: number, toTrackId: number, liked: boolean): Observable<WeightsInfo> {
    return this.http.post<WeightsInfo>(`${this.baseUrl}/feedback`, { fromTrackId, toTrackId, liked });
  }

  /**
   * El DJ pidio mezclar en `actualMixOutAt` (segundos de la pista saliente) en vez del `plannedMixOutAt` del plan;
   * el motor aprende de ello cuando mezclar.
   */
  sendMixTiming(
    fromTrackId: number, toTrackId: number, plannedMixOutAt: number, actualMixOutAt: number,
  ): Observable<MixTimingInfo> {
    return this.http.post<MixTimingInfo>(`${this.baseUrl}/timing`, {
      fromTrackId, toTrackId, plannedMixOutAt, actualMixOutAt,
    });
  }

  /** Los pesos de la puntuacion que usa el motor ahora. */
  weights(): Observable<WeightsInfo> {
    return this.http.get<WeightsInfo>(`${this.baseUrl}/weights`);
  }

  /**
   * El DJ eligio `chosenTrackId` como siguiente pista tras `fromTrackId` y la IA habria propuesto `recommendedTrackId`
   * (o la misma, si la acepto): de la diferencia el motor aprende que pista sigue.
   */
  submitChoice(fromTrackId: number, chosenTrackId: number, recommendedTrackId: number | null): Observable<unknown> {
    const body: { fromTrackId: number; chosenTrackId: number; recommendedTrackId?: number } = { fromTrackId, chosenTrackId };
    if (recommendedTrackId !== null) {
      body.recommendedTrackId = recommendedTrackId;
    }
    return this.http.post(`${this.baseUrl}/choices`, body);
  }

  /** El modelo del estilo del DJ: mezclas buenas que hay y que faltan, su evaluacion y si esta encendido. */
  styleModel(): Observable<StyleModelInfo> {
    return this.http.get<StyleModelInfo>(`${this.baseUrl}/style-model`);
  }

  /** Enciende o apaga el modelo; apagado, el motor usa solo sus reglas. */
  setStyleModel(enabled: boolean): Observable<StyleModelInfo> {
    return this.http.post<StyleModelInfo>(`${this.baseUrl}/style-model`, { enabled });
  }

  /** Plan de transicion entre dos pistas: estilo, compases, puntos de mezcla y curvas de EQ. */
  transition(fromTrackId: number, toTrackId: number): Observable<TransitionPlan> {
    return this.http.post<TransitionPlan>(`${this.baseUrl}/transition`, { fromTrackId, toTrackId });
  }
}
