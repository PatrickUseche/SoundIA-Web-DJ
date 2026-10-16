import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TelemetryService, AiDecision, MidiEvent } from '../../core/services/telemetry';
import { Observable } from 'rxjs';
import { threadId } from 'worker_threads';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './dashboard.html'
})

export class DashboradComponent implements OnInit{
  // Patron de inyeccion de dependencias moderno.
  private telemetryService = inject(TelemetryService);

  // El sufijo $ indica que es uin flujo reactivo (Observable).
  logs$!: Observable<any[]>;
  ultimaDecision: AiDecision | null = null;

  ngOnInit(): void {
    this.cargarHistorial();
  }

  cargarHistorial(): void {
    // Asignacion directa sin .subscribe() manual para evitar fugas de memoria.
    this.logs$ = this.telemetryService.getLogs();
  }

  simularMezclaAutomatica(): void {
    const eventoPrueba: MidiEvent = { controlId: 14, value: 127};

    this.telemetryService.predictMix(eventoPrueba).subscribe({
      next: (decision) => {
        this.ultimaDecision = decision;
        // Refrescar reactivamente la tabla de PostgreSQL.
        this.cargarHistorial();
      },
      error: (err) => console.error('[API Gateway] Fallo de conexion:', err)
    });
  }
}