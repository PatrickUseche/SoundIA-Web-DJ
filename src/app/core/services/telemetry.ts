import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

// DTOs estrictos en TypeScript
export interface MidiEvent {
    controlId: number;
    value: number;
}

export interface AiDecision{
    status: string;
    action: string;
}

// Registro devuelto por GET /logs; refleja la entidad DjSessionLog de Spring Boot.
export interface DjSessionLog {
    id: number;
    controlId: number;
    value: number;
    createdIn: string;
}

@Injectable({ providedIn: 'root'})
export class TelemetryService{
    // Conexion exclusiva al API Gateway (Spring Boot), nunca a Django directamente.
    private readonly baseUrl = 'http://localhost:8080/api/v1/midi';

    constructor(private http: HttpClient){}

    getLogs() : Observable<DjSessionLog[]> {
        return this.http.get<DjSessionLog[]>(`${this.baseUrl}/logs`);
    }

    predictMix(event: MidiEvent) : Observable<AiDecision> {
        return this.http.post<AiDecision>(`${this.baseUrl}/ai/predict`, event);
    }
}