import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { RecordingRequest, SavedRecording } from '../models/recording';

/** Grabaciones de mezclas del API Gateway: lo que el DJ hace al pasar de una pista a otra, para aprender su estilo. */
@Injectable({ providedIn: 'root' })
export class RecordingApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiRootUrl}/recordings`;

  create(recording: RecordingRequest): Observable<SavedRecording> {
    return this.http.post<SavedRecording>(this.baseUrl, recording);
  }
}
