import { Component, DestroyRef, OnInit, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TelemetryService, DjSessionLog, MidiEvent } from '../../core/services/telemetry';
import { TelemetryStreamService } from '../../core/services/telemetry-stream';
import { ConnectionState, DecisionMessage, StreamEvent } from '../../core/models/stream-messages';
import { MidiPanelComponent } from '../midi-panel/midi-panel';

/** Decision de la IA tal como se muestra en el panel (la accion es null si la IA no respondio). */
export interface DecisionView {
  status: string;
  action: string | null;
}

/** Linea del feed en vivo. */
export interface FeedEntry {
  id: number;
  bodyText: string;
}

// El historial replica el limite del API (ultimos 50) y el feed muestra solo lo mas reciente.
const MAX_HISTORY = 50;
const MAX_FEED = 20;

const STATUS_TEXT: Record<ConnectionState, string> = {
  connecting: 'Conectando...',
  open: 'En vivo',
  reconnecting: 'Reconectando...',
  closed: 'Sin conexión en vivo',
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
  readonly latestDecision = signal<DecisionView | null>(null);
  readonly feed = signal<FeedEntry[]>([]);

  // Estados de las dos llamadas al API Gateway.
  readonly loadingHistory = signal(false);
  readonly historyError = signal<string | null>(null);
  readonly calculatingMix = signal(false);
  readonly mixError = signal<string | null>(null);

  readonly connectionStatus = this.stream.state;
  readonly statusText = (currentStatus: ConnectionState) => STATUS_TEXT[currentStatus];

  private nextFeedId = 0;
  private hadConnection = false;

  constructor() {
    // Al volver la conexion tras un corte se recarga el historial: se pudieron perder eventos.
    effect(() => {
      if (this.connectionStatus() !== 'open') {
        return;
      }
      if (this.hadConnection) {
        untracked(() => this.loadHistory());
      }
      this.hadConnection = true;
    });
  }

  ngOnInit(): void {
    this.loadHistory();
    this.connectLive();
  }

  loadHistory(): void {
    this.loadingHistory.set(true);
    this.historyError.set(null);
    // takeUntilDestroyed cancela la suscripcion si el componente se destruye antes de la respuesta.
    this.telemetryService
      .getLogs()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (logs) => {
          this.logs.set(logs);
          this.loadingHistory.set(false);
        },
        error: (err) => {
          console.error('[API Gateway] No se pudo cargar el historial:', err);
          this.historyError.set('No se pudo cargar el historial. Verifica que el API esté activo.');
          this.loadingHistory.set(false);
        }
      });
  }

  simulateAutoMix(): void {
    const testEvent: MidiEvent = { controlId: 14, value: 127 };
    this.calculatingMix.set(true);
    this.mixError.set(null);

    this.telemetryService
      .predictMix(testEvent)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (decision) => {
          this.latestDecision.set(decision);
          this.calculatingMix.set(false);
          // Con la conexion en vivo abierta el evento ya llega por el stream; si no, se refresca a mano.
          if (this.connectionStatus() !== 'open') {
            this.loadHistory();
          }
        },
        error: (err) => {
          console.error('[API Gateway] Fallo de conexion:', err);
          this.mixError.set('No se pudo calcular la mezcla. Intenta de nuevo.');
          this.calculatingMix.set(false);
        }
      });
  }

  private connectLive(): void {
    this.stream
      .connect()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((domEvent) => this.onEventReceived(domEvent));
  }

  private onEventReceived(domEvent: StreamEvent): void {
    if (domEvent.type === 'midi') {
      this.addToFeed(`MIDI: Control ${domEvent.data.controlId} = ${domEvent.data.value}`);
      return;
    }
    this.onDecisionReceived(domEvent.data);
  }

  private onDecisionReceived(decision: DecisionMessage): void {
    const logEntry: DjSessionLog = {
      id: decision.id,
      controlId: decision.controlId,
      value: decision.value,
      action: decision.action,
      createdIn: decision.createdIn,
    };
    // Si el evento ya estaba en el historial (cargado por HTTP) se reemplaza en lugar de duplicarlo.
    this.logs.update((currentItems) =>
      [logEntry, ...currentItems.filter((log) => log.id !== logEntry.id)].slice(0, MAX_HISTORY),
    );
    this.latestDecision.set({ status: decision.status, action: decision.action });
    this.addToFeed(`IA (${decision.status}): ${decision.action ?? 'Sin decisión de la IA'}`);
  }

  private addToFeed(bodyText: string): void {
    this.feed.update((currentItem) => [{ id: this.nextFeedId++, bodyText }, ...currentItem].slice(0, MAX_FEED));
  }
}
