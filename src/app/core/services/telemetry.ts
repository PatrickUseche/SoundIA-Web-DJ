import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

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
    // Decision de la IA; null si el motor no estuvo disponible para ese evento.
    action: string | null;
    createdIn: string;
}

@Injectable({ providedIn: 'root'})
export class TelemetryService{
    // Conexion exclusiva al API Gateway (Spring Boot), nunca a Django directamente.
    private readonly baseUrl = environment.apiBaseUrl;

    constructor(private http: HttpClient){}

    getLogs() : Observable<DjSessionLog[]> {
        return this.http.get<DjSessionLog[]>(`${this.baseUrl}/logs`);
    }

    predictMix(event: MidiEvent) : Observable<AiDecision> {
        return this.http.post<AiDecision>(`${this.baseUrl}/ai/predict`, event);
    }

    /**
     * Envia un movimiento del controlador. El API responde al instante (texto plano) y procesa la IA
     * en segundo plano; el resultado llega despues por el stream en vivo.
     */
    sendEvent(event: MidiEvent) : Observable<string> {
        return this.http.post(`${this.baseUrl}/event`, event, { responseType: 'text' });
    }
}