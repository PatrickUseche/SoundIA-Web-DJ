import { Component, DestroyRef, OnInit, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TelemetryService, DjSessionLog, MidiEvent } from '../../core/services/telemetry';
import { TelemetryStreamService } from '../../core/services/telemetry-stream';
import { ConnectionState, DecisionMessage, StreamEvent } from '../../core/models/stream-messages';
import { MidiPanelComponent } from '../midi-panel/midi-panel';

/** Decision de la IA tal como se muestra en el panel (la accion es null si la IA no respondio). */
export interface DecisionVista {
  status: string;
  action: string | null;
}

/** Linea del feed en vivo. */
export interface EntradaFeed {
  id: number;
  texto: string;
}

// El historial replica el limite del API (ultimos 50) y el feed muestra solo lo mas reciente.
const MAX_HISTORIAL = 50;
const MAX_FEED = 20;

const TEXTO_ESTADO: Record<ConnectionState, string> = {
  connecting: 'Conectando...',
  open: 'En vivo',
  reconnecting: 'Reconectando...',
  closed: 'Sin conexion en vivo',
};

@Component({
  selector: 'app-dashboard',
  imports: [MidiPanelComponent],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css'
})
export class DashboardComponent implements OnInit {
  // Patron de inyeccion de dependencias moderno.
  private telemetryService = inject(TelemetryService);
  private stream = inject(TelemetryStreamService);
  private destroyRef = inject(DestroyRef);

  // El estado de la vista vive en signals: la plantilla se actualiza sola al cambiarlos.
  readonly logs = signal<DjSessionLog[]>([]);
  readonly ultimaDecision = signal<DecisionVista | null>(null);
  readonly feed = signal<EntradaFeed[]>([]);

  // Estados de las dos llamadas al API Gateway.
  readonly cargandoHistorial = signal(false);
  readonly errorHistorial = signal<string | null>(null);
  readonly calculandoMezcla = signal(false);
  readonly errorMezcla = signal<string | null>(null);

  readonly estadoConexion = this.stream.state;
  readonly textoEstado = (estado: ConnectionState) => TEXTO_ESTADO[estado];

  private siguienteIdFeed = 0;
  private huboConexion = false;

  constructor() {
    // Al volver la conexion tras un corte se recarga el historial: se pudieron perder eventos.
    effect(() => {
      if (this.estadoConexion() !== 'open') {
        return;
      }
      if (this.huboConexion) {
        untracked(() => this.cargarHistorial());
      }
      this.huboConexion = true;
    });
  }

  ngOnInit(): void {
    this.cargarHistorial();
    this.conectarEnVivo();
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
          // Con la conexion en vivo abierta el evento ya llega por el stream; si no, se refresca a mano.
          if (this.estadoConexion() !== 'open') {
            this.cargarHistorial();
          }
        },
        error: (err) => {
          console.error('[API Gateway] Fallo de conexion:', err);
          this.errorMezcla.set('No se pudo calcular la mezcla. Intenta de nuevo.');
          this.calculandoMezcla.set(false);
        }
      });
  }

  private conectarEnVivo(): void {
    this.stream
      .connect()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((evento) => this.alRecibirEvento(evento));
  }

  private alRecibirEvento(evento: StreamEvent): void {
    if (evento.type === 'midi') {
      this.agregarAlFeed(`MIDI: Control ${evento.data.controlId} = ${evento.data.value}`);
      return;
    }
    this.alRecibirDecision(evento.data);
  }

  private alRecibirDecision(decision: DecisionMessage): void {
    const registro: DjSessionLog = {
      id: decision.id,
      controlId: decision.controlId,
      value: decision.value,
      action: decision.action,
      createdIn: decision.createdIn,
    };
    // Si el evento ya estaba en el historial (cargado por HTTP) se reemplaza en lugar de duplicarlo.
    this.logs.update((actuales) =>
      [registro, ...actuales.filter((log) => log.id !== registro.id)].slice(0, MAX_HISTORIAL),
    );
    this.ultimaDecision.set({ status: decision.status, action: decision.action });
    this.agregarAlFeed(`IA (${decision.status}): ${decision.action ?? 'Sin decision de la IA'}`);
  }

  private agregarAlFeed(texto: string): void {
    this.feed.update((actual) => [{ id: this.siguienteIdFeed++, texto }, ...actual].slice(0, MAX_FEED));
  }
}
