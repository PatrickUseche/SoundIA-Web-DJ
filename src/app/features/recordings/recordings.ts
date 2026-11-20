import { DatePipe } from '@angular/common';
import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { firstValueFrom } from 'rxjs';
import { httpErrorMessage } from '../../core/http-error-message';
import {
  RecordingCounts, RecordingQuality, RecordingSummary,
} from '../../core/models/recording';
import { RecordingApiService } from '../../core/services/recordings';
import { StyleModelService } from '../../core/services/style-model';
import { TrackApiService } from '../../core/services/tracks';
import { StyleModelPanelComponent } from '../style-model-panel/style-model-panel';

export type RecordingFilter = 'todas' | RecordingQuality;

export const FILTERS: { rawValue: RecordingFilter; bodyText: string }[] = [
  { rawValue: 'todas', bodyText: 'Todas' },
  { rawValue: 'unreviewed', bodyText: 'Sin revisar' },
  { rawValue: 'good', bodyText: 'Buenas' },
  { rawValue: 'discard', bodyText: 'Descartadas' },
];

const CROSSFADER_SHAPE: Record<string, string> = { corte: 'Corte', gradual: 'Gradual', lento: 'Lento' };

/**
 * Revision de las mezclas que el DJ grabo con el modo aprendizaje: marcarlas como buenas o descartarlas y anotar por
 * que, porque solo las buenas deberían usarse para entrenar. Tambien baja y restaura la copia de seguridad.
 */
@Component({
  selector: 'app-recordings',
  imports: [DatePipe, StyleModelPanelComponent],
  templateUrl: './recordings.html',
  styleUrl: './recordings.css',
})
export class RecordingsComponent implements OnInit {
  private readonly api = inject(RecordingApiService);
  private readonly tracksApi = inject(TrackApiService);
  private readonly styleModel = inject(StyleModelService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly filterOptions = FILTERS;

  readonly recordings = signal<RecordingSummary[]>([]);
  readonly counts = signal<RecordingCounts>({ unreviewed: 0, good: 0, discard: 0, total: 0 });
  readonly activeFilter = signal<RecordingFilter>('todas');
  readonly isLoading = signal(false);
  readonly error = signal<string | null>(null);
  readonly messageText = signal<string | null>(null);
  readonly actionError = signal<string | null>(null);
  /** Grabacion cuyo borrado espera confirmacion. */
  readonly confirmingDelete = signal<number | null>(null);
  readonly working = signal(false);

  /** Titulos de las pistas por id, para decir de que pista a que pista fue cada mezcla. */
  private readonly titles = signal<Map<number, string>>(new Map());

  readonly hasRecordings = computed(() => this.counts().total > 0);

  ngOnInit(): void {
    this.loadItems();
  }

  loadItems(): void {
    this.isLoading.set(true);
    this.error.set(null);
    const qualityFilter = this.activeFilter() === 'todas' ? undefined : (this.activeFilter() as RecordingQuality);
    this.api
      .list(qualityFilter)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (itemList) => {
          this.recordings.set(itemList.recordings);
          this.counts.set(itemList.counts);
          this.isLoading.set(false);
        },
        error: (err) => {
          this.error.set(httpErrorMessage(err, 'No se pudieron cargar las grabaciones.'));
          this.isLoading.set(false);
        },
      });
    // Los titulos son un extra: si no se pueden leer, se muestra el numero de la pista.
    this.tracksApi
      .list()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (trackList) => this.titles.set(new Map(trackList.map((p) => [p.id, p.title]))),
        error: () => undefined,
      });
  }

  chooseFilter(rawValue: RecordingFilter): void {
    this.activeFilter.set(rawValue);
    this.loadItems();
  }

  /** "Titulo de A -> Titulo de B"; si una pista ya se borro se dice asi. */
  trackList(r: RecordingSummary): string {
    return `${this.displayName(r.fromTrackId)} → ${this.displayName(r.toTrackId)}`;
  }

  private displayName(id: number | null): string {
    if (id === null) {
      return '(pista borrada)';
    }
    return this.titles().get(id) ?? `pista ${id}`;
  }

  trackGenre(r: RecordingSummary): string {
    if (!r.genreA && !r.genreB) {
      return '';
    }
    return r.genreA === r.genreB || !r.genreB ? r.genreA : `${r.genreA || '?'} → ${r.genreB}`;
  }

  shapeLabel(r: RecordingSummary): string {
    const shapeLabel = r.features.crossfaderShape;
    return shapeLabel ? (CROSSFADER_SHAPE[shapeLabel] ?? shapeLabel) : '';
  }

  /** Cambio de graves: en que punto del solape (en %) bajo el grave de la pista que sale. */
  bassChange(r: RecordingSummary): string {
    const dataPoint = r.features.bassSwapAt;
    return dataPoint === null || dataPoint === undefined ? '' : `${Math.round(dataPoint * 100)} %`;
  }

  offsetLabel(r: RecordingSummary): string {
    const ms = r.features.phaseErrorMs;
    return ms === null || ms === undefined ? '' : `${Math.round(ms)} ms`;
  }

  /** Marca la grabacion como buena, descartada o sin revisar. */
  markItem(r: RecordingSummary, qualityFilter: RecordingQuality): void {
    if (r.quality === qualityFilter) {
      return;
    }
    this.actionError.set(null);
    this.api
      .review(r.id, { quality: qualityFilter })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updatedTrackInfo) => {
          this.changeCount(r.quality, updatedTrackInfo.quality);
          // El modelo solo aprende de las buenas: si cambia cuantas hay, cambia lo que falta y su evaluacion.
          if (r.quality === 'good' || updatedTrackInfo.quality === 'good') {
            this.styleModel.load();
          }
          const activeFilter = this.activeFilter();
          // Con un filtro puesto, la que ya no encaja sale de la lista.
          if (activeFilter !== 'todas' && updatedTrackInfo.quality !== activeFilter) {
            this.recordings.update((itemList) => itemList.filter((x) => x.id !== r.id));
          } else {
            this.recordings.update((itemList) => itemList.map((x) => (x.id === r.id ? { ...x, ...updatedTrackInfo } : x)));
          }
        },
        error: (err) => this.actionError.set(httpErrorMessage(err, 'No se pudo guardar la revisión.')),
      });
  }

  /** Guarda la nota al salir del campo; si no cambio, no llama al API. */
  saveNotes(r: RecordingSummary, domEvent: Event): void {
    const field = domEvent.target as HTMLInputElement;
    const reviewNotes = field.value.trim();
    if (reviewNotes === r.notes) {
      return;
    }
    this.actionError.set(null);
    this.api
      .review(r.id, { notes: reviewNotes })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updatedTrackInfo) =>
          this.recordings.update((itemList) => itemList.map((x) => (x.id === r.id ? { ...x, notes: updatedTrackInfo.notes } : x))),
        error: (err) => {
          this.actionError.set(httpErrorMessage(err, 'No se pudo guardar la nota.'));
          field.value = r.notes;
        },
      });
  }

  requestDelete(r: RecordingSummary): void {
    this.messageText.set(null);
    this.actionError.set(null);
    this.confirmingDelete.set(r.id);
  }

  cancelDelete(): void {
    this.confirmingDelete.set(null);
  }

  deleteItem(r: RecordingSummary): void {
    this.confirmingDelete.set(null);
    this.api
      .remove(r.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.recordings.update((itemList) => itemList.filter((x) => x.id !== r.id));
          this.counts.update((c) => ({ ...c, [r.quality]: Math.max(0, c[r.quality] - 1), total: Math.max(0, c.total - 1) }));
          this.messageText.set('Grabación borrada.');
          if (r.quality === 'good') {
            this.styleModel.load();
          }
        },
        error: (err) => this.actionError.set(httpErrorMessage(err, 'No se pudo borrar la grabación.')),
      });
  }

  /** Baja todas las grabaciones a un archivo JSON (con el token de sesion: un enlace directo no lo llevaria). */
  async downloadBackup(): Promise<void> {
    this.messageText.set(null);
    this.actionError.set(null);
    this.working.set(true);
    try {
      const audioFile = await firstValueFrom(this.api.exportAll());
      const url = URL.createObjectURL(audioFile);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'soundia-grabaciones.json';
      link.click();
      URL.revokeObjectURL(url);
      this.messageText.set('Copia descargada.');
    } catch (err) {
      this.actionError.set(httpErrorMessage(err, 'No se pudo descargar la copia.'));
    } finally {
      this.working.set(false);
    }
  }

  /** Restaura las grabaciones de una copia descargada antes; las que ya estan no se duplican. */
  async restoreBackup(domEvent: Event): Promise<void> {
    const input = domEvent.target as HTMLInputElement;
    const audioFile = input.files?.[0];
    input.value = '';
    if (!audioFile) {
      return;
    }
    this.messageText.set(null);
    this.actionError.set(null);
    this.working.set(true);
    try {
      let backup: unknown;
      try {
        backup = JSON.parse(await audioFile.text());
      } catch {
        throw new Error('El archivo no es un JSON válido.');
      }
      const outcome = await firstValueFrom(this.api.importAll(backup));
      this.messageText.set(`${outcome.created} grabaciones restauradas; ${outcome.skipped} ya estaban.`);
      this.loadItems();
    } catch (err) {
      this.actionError.set(
        err instanceof Error && !('status' in err) ? err.message : httpErrorMessage(err, 'No se pudo restaurar la copia.'),
      );
    } finally {
      this.working.set(false);
    }
  }

  private changeCount(antes: RecordingQuality, afterValue: RecordingQuality): void {
    this.counts.update((c) => ({ ...c, [antes]: Math.max(0, c[antes] - 1), [afterValue]: c[afterValue] + 1 }));
  }
}
