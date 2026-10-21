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

  // Estados de las dos llamadas al API Gateway.
  readonly cargandoHistorial = signal(false);
  readonly errorHistorial = signal<string | null>(null);
  readonly calculandoMezcla = signal(false);
  readonly errorMezcla = signal<string | null>(null);

  ngOnInit(): void {
    this.cargarHistorial();
  }

  cargarHistorial(): void {
    this.cargandoHistorial.set(true);
    this.errorHistorial.set(null);
    // takeUntilDestroyed cancela la suscripcion si el componente se destruye antes de la respuesta.
    this.telemetryService
      .getLogs()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (logs) => {
          this.logs.set(logs);
          this.cargandoHistorial.set(false);
        },
        error: (err) => {
          console.error('[API Gateway] No se pudo cargar el historial:', err);
          this.errorHistorial.set('No se pudo cargar el historial. Verifica que el API este activo.');
          this.cargandoHistorial.set(false);
        }
      });
  }

  simularMezclaAutomatica(): void {
    const eventoPrueba: MidiEvent = { controlId: 14, value: 127 };
    this.calculandoMezcla.set(true);
    this.errorMezcla.set(null);

    this.telemetryService
      .predictMix(eventoPrueba)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (decision) => {
          this.ultimaDecision.set(decision);
          this.calculandoMezcla.set(false);
          // Refrescar la tabla de PostgreSQL con el nuevo evento.
          this.cargarHistorial();
        },
        error: (err) => {
          console.error('[API Gateway] Fallo de conexion:', err);
          this.errorMezcla.set('No se pudo calcular la mezcla. Intenta de nuevo.');
          this.calculandoMezcla.set(false);
        }
      });
  }
}
