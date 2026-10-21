import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TelemetryService, AiDecision, DjSessionLog, MidiEvent } from '../../core/services/telemetry';

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.html'
})
export class DashboardComponent implements OnInit {
  // Patron de inyeccion de dependencias moderno.
  private telemetryService = inject(TelemetryService);
  private destroyRef = inject(DestroyRef);

  // El estado de la vista vive en signals: la plantilla se actualiza sola al cambiarlos.
  readonly logs = signal<DjSessionLog[]>([]);
  readonly ultimaDecision = signal<AiDecision | null>(null);

  ngOnInit(): void {
    this.cargarHistorial();
  }

  cargarHistorial(): void {
    // takeUntilDestroyed cancela la suscripcion si el componente se destruye antes de la respuesta.
    this.telemetryService
      .getLogs()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (logs) => this.logs.set(logs),
        error: (err) => console.error('[API Gateway] No se pudo cargar el historial:', err)
      });
  }

  simularMezclaAutomatica(): void {
    const eventoPrueba: MidiEvent = { controlId: 14, value: 127 };

    this.telemetryService
      .predictMix(eventoPrueba)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (decision) => {
          this.ultimaDecision.set(decision);
          // Refrescar la tabla de PostgreSQL con el nuevo evento.
          this.cargarHistorial();
        },
        error: (err) => console.error('[API Gateway] Fallo de conexion:', err)
      });
  }
}
