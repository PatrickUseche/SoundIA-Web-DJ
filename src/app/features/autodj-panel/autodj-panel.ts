import { Component, DestroyRef, OnInit, computed, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { formatBpm, formatTime } from '../../core/audio/format';
import { QueueItem, TransitionPlan } from '../../core/models/autodj';
import { AutoDjService, AutoDjStatus } from '../../core/services/autodj';
import { QueueService } from '../../core/services/queue';
import { TrackApiService } from '../../core/services/tracks';
import { TransitionRunnerService } from '../../core/services/transition-runner';

function describirEstilo(plan: TransitionPlan): string {
  switch (plan.style) {
    case 'cut':
      return 'corte directo';
    case 'fade':
      return `fundido de ${plan.bars} compases`;
    default:
      return `mezcla de ${plan.bars} compases`;
  }
}

const TEXTO_ESTADO: Record<AutoDjStatus, string> = {
  off: 'Apagado',
  esperando: 'Activo: esperando el punto de salida de la pista que suena',
  preparando: 'Preparando la siguiente pista...',
  mezclando: 'Mezclando...',
  error: 'Hay un problema (ver el aviso)',
};

/** Panel del Auto-DJ: encenderlo, ver que pista viene y administrar la cola de la sesion. */
@Component({
  selector: 'app-autodj-panel',
  templateUrl: './autodj-panel.html',
})
export class AutoDjPanelComponent implements OnInit {
  protected readonly autodj = inject(AutoDjService);
  protected readonly queue = inject(QueueService);
  protected readonly runner = inject(TransitionRunnerService);
  private readonly tracks = inject(TrackApiService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly formatBpm = formatBpm;
  protected readonly formatTime = formatTime;

  /** Titulos de las pistas por id, para mostrar la cola con nombres y no con numeros. */
  private readonly titulos = signal<Map<number, string>>(new Map());

  protected readonly textoEstado = computed(() => TEXTO_ESTADO[this.autodj.status()]);

  protected readonly porcentajeMezcla = computed(() => Math.round(this.runner.progress() * 100));

  protected readonly resumenSiguiente = computed(() => {
    const preparada = this.autodj.next();
    if (!preparada) {
      return null;
    }
    const { track, plan } = preparada;
    return {
      titulo: track.title,
      bpm: track.bpm,
      camelot: track.camelot,
      deck: preparada.deck,
      estilo: describirEstilo(plan),
      compatibilidad: Math.round(plan.compatibility.score * 100),
      adelanto: Math.round(plan.mixOutAdvance ?? 0),
    };
  });

  constructor() {
    // Cuando el Auto-DJ saca una pista de la cola (o prepara otra), la cola cambio en el servidor.
    effect(() => {
      this.autodj.next();
      untracked(() => void this.queue.refresh());
    });
  }

  /** Pesos aprendidos como porcentajes enteros; null hasta conocerlos. */
  protected readonly pesos = computed(() => {
    const info = this.autodj.weights();
    if (!info) {
      return null;
    }
    const { tempo, harmonic, energy } = info.weights;
    return {
      aprendidos: info.learned,
      valoraciones: info.samples,
      tempo: Math.round(tempo * 100),
      armonia: Math.round(harmonic * 100),
      energia: Math.round(energy * 100),
    };
  });

  ngOnInit(): void {
    void this.autodj.loadWeights();
    this.tracks
      .list()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (lista) => this.titulos.set(new Map(lista.map((track) => [track.id, track.title]))),
        // Sin titulos la cola sigue funcionando: se muestran los numeros de pista.
        error: () => undefined,
      });
  }

  async alternar(): Promise<void> {
    if (this.autodj.enabled()) {
      this.autodj.stop();
    } else {
      await this.autodj.start();
    }
  }

  titulo(item: QueueItem): string {
    return this.titulos().get(item.trackId) ?? `Pista #${item.trackId}`;
  }

  quitar(item: QueueItem): void {
    void this.queue.remove(item.id);
  }
}
