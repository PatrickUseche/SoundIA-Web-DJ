import { HttpErrorResponse } from '@angular/common/http';
import { Component, InjectionToken, OnInit, computed, effect, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DestroyRef } from '@angular/core';
import { areCompatible } from '../../core/audio/camelot';
import { DeckId } from '../../core/audio/deck';
import { formatBpm, formatTime } from '../../core/audio/format';
import { httpErrorMessage } from '../../core/http-error-message';
import { Track } from '../../core/models/track';
import { MixerService } from '../../core/services/mixer';
import { QueueService } from '../../core/services/queue';
import { TrackApiService } from '../../core/services/tracks';

/** Tamano maximo de un archivo de audio que acepta el API (50 MB). */
export const MAX_SIZE_BYTES = 50 * 1024 * 1024;

/** Por encima de esto el servidor gratuito (poca memoria) puede fallar al analizar: se avisa, pero se intenta igual. */
export const SIZE_WARNING_BYTES = 20 * 1024 * 1024;

/**
 * Esperas (ms) entre reintentos cuando el servidor no responde en medio de una subida: un API gratuito que se reinicia
 * tarda hasta ~2 minutos en volver. Son 6 reintentos (5, 10, 20, 30, 45 y 60 s): si ni asi responde, la tanda se
 * detiene y se pueden reintentar los pendientes. Un token para que las pruebas usen esperas de 1 ms.
 */
export const SERVER_WAIT_DELAYS = new InjectionToken<number[]>('SERVER_WAIT_DELAYS', {
  providedIn: 'root',
  factory: () => [5000, 10000, 20000, 30000, 45000, 60000],
});

/** El servidor no esta (se cayo, se reinicia o esta despertando), a diferencia de un error del propio archivo. */
export function servidorNoDisponible(err: unknown): boolean {
  return err instanceof HttpErrorResponse && [0, 429, 502, 503, 504].includes(err.status);
}

/** Cada cuanto se vuelve a pedir la lista mientras alguna pista tiene la voz en analisis. */
export const VOICE_REFRESH_MS = 5000;

/** Formas de ordenar la lista: la del API (mas recientes primero), por tempo, por tonalidad o por titulo. */
export type LibraryOrder = 'recent' | 'bpm-asc' | 'bpm-desc' | 'camelot' | 'title' | 'genre';

export const SORT_ORDERS: { rawValue: LibraryOrder; bodyText: string }[] = [
  { rawValue: 'recent', bodyText: 'Más recientes' },
  { rawValue: 'bpm-asc', bodyText: 'BPM de menor a mayor' },
  { rawValue: 'bpm-desc', bodyText: 'BPM de mayor a menor' },
  { rawValue: 'camelot', bodyText: 'Tonalidad (Camelot)' },
  { rawValue: 'title', bodyText: 'Titulo' },
  { rawValue: 'genre', bodyText: 'Genero' },
];

/** Generos que se sugieren al escribir (se puede poner cualquier otro). */
export const SUGGESTED_GENRES = [
  'merengue', 'bachata', 'salsa', 'despecho', 'discobar', 'reggaeton', 'vallenato', 'cumbia', 'champeta', 'popular',
];

/** Posicion de un codigo Camelot en la rueda (1A, 1B, 2A...); los codigos no validos van al final. */
export function camelotKey(camelotCode: string): number {
  const parts = /^(\d{1,2})([AB])$/i.exec(camelotCode.trim());
  return parts ? Number(parts[1]) * 2 + (parts[2].toUpperCase() === 'B' ? 1 : 0) : Number.MAX_SAFE_INTEGER;
}

/** Biblioteca de pistas analizadas: se cargan en un deck o se sube un archivo nuevo para analizarlo. */
@Component({
  selector: 'app-library',
  templateUrl: './library.html',
})
export class LibraryComponent implements OnInit {
  private readonly api = inject(TrackApiService);
  protected readonly mixer = inject(MixerService);
  private readonly queue = inject(QueueService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly formatBpm = formatBpm;
  protected readonly formatTime = formatTime;

  readonly tracks = signal<Track[]>([]);
  readonly isLoading = signal(false);
  readonly error = signal<string | null>(null);

  /** Se esta analizando un archivo subido. */
  readonly uploading = signal(false);
  readonly uploadMessage = signal<string | null>(null);
  readonly uploadError = signal<string | null>(null);
  /** Cuando se suben varios archivos, el motivo del fallo de cada uno. */
  readonly uploadErrors = signal<string[]>([]);
  /** El servidor no respondio y se reintenta: que archivo, en que intento y de cuantos (null si no se espera). */
  readonly waitingForServer = signal<{ displayName: string; attempt: number; de: number } | null>(null);
  /** Archivos que quedaron sin subir porque el servidor dejo de responder (se pueden reintentar). */
  readonly pendingUploads = signal<File[]>([]);
  private readonly waitDelays = inject(SERVER_WAIT_DELAYS);
  /** Avisos de una subida en curso (por ejemplo archivos grandes que podrian fallar); no impiden subir. */
  readonly uploadNotices = signal<string[]>([]);
  /** Archivo que se esta analizando y cuantos hay en total (null si no hay una subida en curso). */
  readonly uploadProgress = signal<{ currentItem: number; total: number; displayName: string } | null>(null);
  private destroyed = false;

  /** Aviso tras agregar una pista a la cola del Auto-DJ (o el motivo por el que no se pudo). */
  readonly queueMessage = signal<string | null>(null);
  readonly queueError = signal<string | null>(null);

  /** Pista cuyo borrado espera confirmacion, y pista que se esta borrando. */
  readonly confirmingDelete = signal<number | null>(null);
  readonly deleting = signal<number | null>(null);
  readonly deleteMessage = signal<string | null>(null);
  readonly deleteError = signal<string | null>(null);

  /** Deck cuyo audio se esta descargando (para deshabilitar sus botones). */
  readonly loadingDeck = signal<DeckId | null>(null);
  readonly deckError = signal<string | null>(null);

  /** Codigos Camelot de las pistas cargadas en los decks: sirven para resaltar lo que mezcla bien. */
  private readonly camelotsInDecks = computed(() => {
    if (!this.mixer.supported) {
      return [];
    }
    return (['A', 'B'] as DeckId[])
      .map((id) => this.mixer.deck(id).track()?.camelot)
      .filter((camelotCode): camelotCode is string => !!camelotCode);
  });

  /** Filtros de la lista: texto del titulo, orden y solo las que mezclan bien con lo que hay en los decks. */
  readonly searchText = signal('');
  readonly sortOrder = signal<LibraryOrder>('recent');
  readonly onlyCompatible = signal(false);
  protected readonly sortOrders = SORT_ORDERS;
  protected readonly genres = SUGGESTED_GENRES;
  readonly genreError = signal<string | null>(null);

  /** Hay alguna pista cargada en un deck: solo entonces tiene sentido filtrar por compatibles. */
  readonly hasLoadedDecks = computed(() => this.camelotsInDecks().length > 0);

  /** Las pistas que se muestran: la lista filtrada y ordenada. */
  readonly visibleTracks = computed(() => {
    const bodyText = this.searchText().trim().toLowerCase();
    let itemList = this.tracks();
    if (bodyText !== '') {
      itemList = itemList.filter((t) => t.title.toLowerCase().includes(bodyText) || (t.genre ?? '').includes(bodyText));
    }
    if (this.onlyCompatible() && this.hasLoadedDecks()) {
      itemList = itemList.filter((t) => this.compatible(t));
    }
    const criteria: Record<LibraryOrder, ((a: Track, b: Track) => number) | null> = {
      recent: null,
      'bpm-asc': (a, b) => a.bpm - b.bpm,
      'bpm-desc': (a, b) => b.bpm - a.bpm,
      camelot: (a, b) => camelotKey(a.camelot) - camelotKey(b.camelot) || a.bpm - b.bpm,
      title: (a, b) => a.title.localeCompare(b.title, 'es'),
      // Las que no tienen genero van al final.
      genre: (a, b) => Number(!a.genre) - Number(!b.genre) || (a.genre ?? '').localeCompare(b.genre ?? '', 'es') || a.title.localeCompare(b.title, 'es'),
    };
    const compareValues = criteria[this.sortOrder()];
    return compareValues ? [...itemList].sort(compareValues) : itemList;
  });

  /** Pistas que se analizaron antes de guardar el audio: no se pueden cargar y hay que volver a subirlas. */
  readonly withoutAudio = computed(() => this.tracks().filter((t) => !t.hasAudio).length);

  private voiceTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    // Si una pista cambia en otra parte (por ejemplo se fija su primer tiempo en un deck), la lista se actualiza.
    effect(() => {
      const changed = this.mixer.updatedTrack();
      if (changed) {
        this.tracks.update((itemList) => itemList.map((t) => (t.id === changed.id ? changed : t)));
      }
    });
  }

  ngOnInit(): void {
    this.destroyRef.onDestroy(() => {
      this.destroyed = true;
      this.cancelVoiceRefresh();
    });
    this.reload();
  }

  reload(): void {
    this.cancelVoiceRefresh();
    this.isLoading.set(true);
    this.error.set(null);
    this.api
      .list()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (tracks) => {
          this.tracks.set(tracks);
          this.isLoading.set(false);
          this.scheduleVoiceRefresh();
        },
        error: (err) => {
          this.error.set(httpErrorMessage(err, 'No se pudo cargar la biblioteca.'));
          this.isLoading.set(false);
        },
      });
  }

  /**
   * Mientras alguna pista tenga la voz en analisis (tarda minutos, en segundo plano) vuelve a pedir la lista cada
   * pocos segundos, sin el estado de carga, para que el aviso "analizando voz" se quite solo. Si falla se detiene:
   * el boton Actualizar la reanuda.
   */
  private scheduleVoiceRefresh(): void {
    if (this.voiceTimer !== null || !this.tracks().some((t) => this.analyzingVocals(t))) {
      return;
    }
    this.voiceTimer = setTimeout(() => {
      this.voiceTimer = null;
      this.api
        .list()
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (tracks) => {
            this.tracks.set(tracks);
            this.scheduleVoiceRefresh();
          },
          // Es un refresco de fondo: si falla se deja la lista como esta, sin mostrar un error ni reintentar.
          error: () => undefined,
        });
    }, VOICE_REFRESH_MS);
  }

  private cancelVoiceRefresh(): void {
    if (this.voiceTimer !== null) {
      clearTimeout(this.voiceTimer);
      this.voiceTimer = null;
    }
  }

  /** La pista mezcla bien (por tonalidad) con alguna de las que ya estan cargadas en los decks. */
  compatible(track: Track): boolean {
    return this.camelotsInDecks().some((camelotCode) => camelotCode !== '' && areCompatible(camelotCode, track.camelot));
  }

  /** La voz del final de la pista esta en la cola de analisis o analizandose. */
  analyzingVocals(track: Track): boolean {
    return track.vocals?.status === 'pending' || track.vocals?.status === 'running';
  }

  /** El deck en que esta cargada la pista (A o B), o null si no esta en ninguno. */
  deckOf(track: Track): DeckId | null {
    if (!this.mixer.supported) {
      return null;
    }
    return (['A', 'B'] as DeckId[]).find((id) => this.mixer.deck(id).track()?.id === track.id) ?? null;
  }

  /** La pista ya esta cargada en algun deck. */
  inDeck(track: Track): boolean {
    return this.deckOf(track) !== null;
  }

  async loadIntoDeck(deck: DeckId, track: Track): Promise<void> {
    this.deckError.set(null);
    this.loadingDeck.set(deck);
    try {
      await this.mixer.loadTrack(deck, track);
    } catch (err) {
      this.deckError.set(httpErrorMessage(err, `No se pudo cargar "${track.title}" en el deck ${deck}.`));
    } finally {
      this.loadingDeck.set(null);
    }
  }

  /** Agrega la pista al final de la cola de la sesion (se abre una si no hay ninguna). */
  async enqueueTrack(track: Track): Promise<void> {
    this.queueMessage.set(null);
    this.queueError.set(null);
    if (await this.queue.enqueue(track.id)) {
      this.queueMessage.set(`"${track.title}" agregada a la cola.`);
    } else {
      this.queueError.set(this.queue.error() ?? 'No se pudo agregar la pista a la cola.');
    }
  }

  onSearchText(domEvent: Event): void {
    this.searchText.set((domEvent.target as HTMLInputElement).value);
  }

  onSort(domEvent: Event): void {
    this.sortOrder.set((domEvent.target as HTMLSelectElement).value as LibraryOrder);
  }

  onFilterCompatible(domEvent: Event): void {
    this.onlyCompatible.set((domEvent.target as HTMLInputElement).checked);
  }

  /** Guarda el genero que el DJ escribio en la fila; si no se pudo, vuelve a mostrar el anterior y explica por que. */
  changeGenre(track: Track, domEvent: Event): void {
    const field = domEvent.target as HTMLInputElement;
    const newValue = field.value.trim().toLowerCase().replace(/\s+/g, ' ');
    this.genreError.set(null);
    if (newValue === (track.genre ?? '')) {
      field.value = track.genre ?? '';
      return;
    }
    this.api
      .setGenre(track.id, newValue)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updatedTrackInfo) => {
          this.tracks.update((itemList) => itemList.map((t) => (t.id === updatedTrackInfo.id ? updatedTrackInfo : t)));
          field.value = updatedTrackInfo.genre ?? '';
        },
        error: (err) => {
          this.genreError.set(httpErrorMessage(err, `No se pudo guardar el género de "${track.title}".`));
          field.value = track.genre ?? '';
        },
      });
  }

  /** Pide confirmacion antes de borrar: es irreversible (se borra tambien el audio). */
  requestDelete(track: Track): void {
    this.deleteMessage.set(null);
    this.deleteError.set(null);
    this.confirmingDelete.set(track.id);
  }

  cancelDelete(): void {
    this.confirmingDelete.set(null);
  }

  /** Borra la pista y su audio. Una pista cargada en un deck no se puede borrar: primero hay que descargarla. */
  deleteItem(track: Track): void {
    this.confirmingDelete.set(null);
    this.deleting.set(track.id);
    this.api
      .delete(track.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.tracks.update((currentItems) => currentItems.filter((t) => t.id !== track.id));
          this.deleteMessage.set(`"${track.title}" borrada.`);
          this.deleting.set(null);
          // El API la quita de las colas: se vuelve a leer la de la sesion para que no muestre pistas borradas.
          void this.queue.refresh();
        },
        error: (err) => {
          this.deleteError.set(httpErrorMessage(err, `No se pudo borrar "${track.title}".`));
          this.deleting.set(null);
        },
      });
  }

  onFileChosen(domEvent: Event): void {
    const input = domEvent.target as HTMLInputElement;
    const audioFiles = Array.from(input.files ?? []); // se copia antes de vaciar el campo
    input.value = ''; // permite volver a elegir el mismo archivo
    if (audioFiles.length > 0 && !this.uploading()) {
      void this.uploadMany(audioFiles);
    }
  }

  /**
   * Analiza los archivos de uno en uno (el servidor gratuito tiene poca memoria: en paralelo se ahogaria). Un archivo
   * que falla no detiene a los demas; al final se resume cuantos salieron bien y por que fallaron los otros.
   */
  private async uploadMany(audioFiles: File[]): Promise<void> {
    this.uploading.set(true);
    this.uploadMessage.set(null);
    this.uploadError.set(null);
    this.uploadErrors.set([]);
    this.pendingUploads.set([]);
    this.uploadNotices.set(
      audioFiles
        .filter((a) => a.size > SIZE_WARNING_BYTES && a.size <= MAX_SIZE_BYTES)
        .map((a) => `${a.name} pesa ${Math.round(a.size / (1024 * 1024))} MB: el servidor gratuito puede no aguantarlo; si falla, prueba con un MP3 más liviano.`),
    );
    const total = audioFiles.length;
    const failures: string[] = [];
    let pendingFiles: File[] = [];
    let correctCount = 0;
    let latest: Track | null = null;

    for (let i = 0; i < total && !this.destroyed; i++) {
      const audioFile = audioFiles[i];
      this.uploadProgress.set({ currentItem: i + 1, total, displayName: audioFile.name });
      if (audioFile.size > MAX_SIZE_BYTES) {
        failures.push(this.reason(audioFile, total, `supera el máximo de ${MAX_SIZE_BYTES / (1024 * 1024)} MB.`));
        continue;
      }
      let attempt = 0;
      for (;;) {
        try {
          const track = await firstValueFrom(this.api.analyze(audioFile));
          this.tracks.update((currentItems) => [track, ...currentItems.filter((t) => t.id !== track.id)]);
          correctCount++;
          latest = track;
          this.scheduleVoiceRefresh();
          break;
        } catch (err) {
          if (servidorNoDisponible(err) && !this.destroyed) {
            if (attempt >= this.waitDelays.length) {
              // Ya se espero todo lo razonable: se corta la tanda en vez de marcar todo lo que falta como fallido.
              pendingFiles = audioFiles.slice(i);
              break;
            }
            this.waitingForServer.set({ displayName: audioFile.name, attempt: attempt + 1, de: this.waitDelays.length });
            await this.sleepFor(this.waitDelays[attempt]);
            this.waitingForServer.set(null);
            attempt++;
            continue;
          }
          failures.push(this.reason(audioFile, total, httpErrorMessage(err, 'No se pudo analizar el archivo.')));
          break;
        }
      }
      if (pendingFiles.length > 0) {
        break;
      }
    }

    this.uploadProgress.set(null);
    this.waitingForServer.set(null);
    this.uploading.set(false);
    this.uploadNotices.set([]);
    if (this.destroyed) {
      return;
    }
    if (pendingFiles.length > 0) {
      this.pendingUploads.set(pendingFiles);
      if (correctCount > 0) {
        this.uploadMessage.set(`${correctCount} de ${total} pistas analizadas.`);
      }
      const missingText = pendingFiles.length === 1 ? 'quedó 1 archivo sin subir' : `quedaron ${pendingFiles.length} archivos sin subir`;
      this.uploadError.set(`El servidor no responde: se detuvo la subida y ${missingText}.`);
      this.uploadErrors.set(failures);
      return;
    }
    if (total === 1) {
      // Un solo archivo: los mismos mensajes de siempre.
      if (latest) {
        this.uploadMessage.set(`"${latest.title}" analizada: ${formatBpm(latest.bpm)} BPM, ${latest.key} (${latest.camelot}).`);
      } else {
        this.uploadError.set(failures[0]);
      }
      return;
    }
    if (correctCount > 0) {
      this.uploadMessage.set(
        correctCount === total ? `${total} pistas analizadas.` : `${correctCount} de ${total} pistas analizadas.`);
    }
    if (failures.length > 0) {
      this.uploadError.set(`No se pudieron analizar ${failures.length} de ${total} archivos:`);
      this.uploadErrors.set(failures);
    }
  }

  /** Vuelve a subir los archivos que quedaron sin subir cuando el servidor dejo de responder. */
  retryPending(): void {
    const pendingFiles = this.pendingUploads();
    if (pendingFiles.length > 0 && !this.uploading()) {
      void this.uploadMany(pendingFiles);
    }
  }

  private sleepFor(ms: number): Promise<void> {
    return new Promise((resolver) => setTimeout(resolver, ms));
  }

  /** Con varios archivos el mensaje de error dice a cual se refiere; con uno basta el motivo. */
  private reason(audioFile: File, total: number, bodyText: string): string {
    return total === 1 ? bodyText : `${audioFile.name}: ${bodyText}`;
  }
}
