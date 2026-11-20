import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  RecordingList, RecordingQuality, RecordingRequest, RecordingReview, RecordingSummary, SavedRecording,
} from '../models/recording';

/** Grabaciones de mezclas del API Gateway: lo que el DJ hace al pasar de una pista a otra, para aprender su estilo. */
@Injectable({ providedIn: 'root' })
export class RecordingApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiRootUrl}/recordings`;

  create(recording: RecordingRequest): Observable<SavedRecording> {
    return this.http.post<SavedRecording>(this.baseUrl, recording);
  }

  /** Las grabaciones mas recientes, con el conteo por calidad; `quality` filtra por una de ellas. */
  list(quality?: RecordingQuality): Observable<RecordingList> {
    const params = quality ? new HttpParams().set('quality', quality) : undefined;
    return this.http.get<RecordingList>(this.baseUrl, { params });
  }

  /** La revision del DJ: calidad y notas. Devuelve la grabacion actualizada. */
  review(id: number, changes: RecordingReview): Observable<RecordingSummary> {
    return this.http.put<RecordingSummary>(`${this.baseUrl}/${id}`, changes);
  }

  remove(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`);
  }

  /** Copia de seguridad: todas las grabaciones en un archivo JSON. */
  exportAll(): Observable<Blob> {
    return this.http.get(`${this.baseUrl}/export`, { responseType: 'blob' });
  }

  /** Restaura una copia exportada; devuelve cuantas se restauraron y cuantas ya estaban. */
  importAll(backup: unknown): Observable<{ created: number; skipped: number }> {
    return this.http.post<{ created: number; skipped: number }>(`${this.baseUrl}/import`, backup);
  }
}
