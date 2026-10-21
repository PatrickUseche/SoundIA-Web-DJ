import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Track, TrackList } from '../models/track';

/** Biblioteca de pistas del API Gateway: listar, analizar una nueva y descargar su audio. */
@Injectable({ providedIn: 'root' })
export class TrackApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiRootUrl}/tracks`;

  /** Pistas ya analizadas (las 50 mas recientes). */
  list(): Observable<Track[]> {
    return this.http.get<TrackList>(this.baseUrl).pipe(map((respuesta) => respuesta.tracks));
  }

  get(id: number): Observable<Track> {
    return this.http.get<Track>(`${this.baseUrl}/${id}`);
  }

  /**
   * Sube un archivo de audio para analizarlo (BPM, tonalidad, energia y puntos de mezcla) y guardarlo.
   * Tarda unos segundos: el servidor analiza la pista completa antes de responder.
   */
  analyze(file: File, title?: string): Observable<Track> {
    const body = new FormData();
    body.append('file', file, file.name);
    if (title && title.trim() !== '') {
      body.append('title', title.trim());
    }
    return this.http.post<Track>(`${this.baseUrl}/analyze`, body);
  }

  /** Audio original de la pista, listo para decodificarlo con la Web Audio API. */
  getAudio(id: number): Observable<ArrayBuffer> {
    return this.http.get(`${this.baseUrl}/${id}/audio`, { responseType: 'arraybuffer' });
  }
}
