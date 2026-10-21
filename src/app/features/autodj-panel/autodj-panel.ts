import { Component, DestroyRef, OnInit, computed, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { formatBpm } from '../../core/audio/format';
import { QueueItem } from '../../core/models/autodj';
import { AutoDjService, AutoDjStatus } from '../../core/services/autodj';
import { QueueService } from '../../core/services/queue';
import { TrackApiService } from '../../core/services/tracks';
import { TransitionRunnerService } from '../../core/services/transition-runner';

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
      estilo: plan.style === 'cut' ? 'corte directo' : `mezcla de ${plan.bars} compases`,
      compatibilidad: Math.round(plan.compatibility.score * 100),
    };
  });

  constructor() {
    // Cuando el Auto-DJ saca una pista de la cola (o prepara otra), la cola cambio en el servidor.
    effect(() => {
      this.autodj.next();
      untracked(() => void this.queue.refresh());
    });
  }

  ngOnInit(): void {
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
