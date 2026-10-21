import { Component, OnInit, computed, inject, signal } from '@angular/core';
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
  readonly cargando = signal(false);
  readonly error = signal<string | null>(null);

  /** Se esta analizando un archivo subido. */
  readonly subiendo = signal(false);
  readonly mensajeSubida = signal<string | null>(null);
  readonly errorSubida = signal<string | null>(null);

  /** Aviso tras agregar una pista a la cola del Auto-DJ (o el motivo por el que no se pudo). */
  readonly mensajeCola = signal<string | null>(null);
  readonly errorCola = signal<string | null>(null);

  /** Deck cuyo audio se esta descargando (para deshabilitar sus botones). */
  readonly cargandoDeck = signal<DeckId | null>(null);
  readonly errorDeck = signal<string | null>(null);

  /** Codigos Camelot de las pistas cargadas en los decks: sirven para resaltar lo que mezcla bien. */
  private readonly camelotsEnDecks = computed(() => {
    if (!this.mixer.supported) {
      return [];
    }
    return (['A', 'B'] as DeckId[])
      .map((id) => this.mixer.deck(id).track()?.camelot)
      .filter((codigo): codigo is string => !!codigo);
  });

  ngOnInit(): void {
    this.recargar();
  }

  recargar(): void {
    this.cargando.set(true);
    this.error.set(null);
    this.api
      .list()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (tracks) => {
          this.tracks.set(tracks);
          this.cargando.set(false);
        },
        error: (err) => {
          this.error.set(httpErrorMessage(err, 'No se pudo cargar la biblioteca.'));
          this.cargando.set(false);
        },
      });
  }

  /** La pista mezcla bien (por tonalidad) con alguna de las que ya estan cargadas en los decks. */
  compatible(track: Track): boolean {
    return this.camelotsEnDecks().some((codigo) => codigo !== '' && areCompatible(codigo, track.camelot));
  }

  /** La pista ya esta cargada en algun deck. */
  enDeck(track: Track): boolean {
    return this.mixer.supported && (['A', 'B'] as DeckId[]).some((id) => this.mixer.deck(id).track()?.id === track.id);
  }

  async cargarEnDeck(deck: DeckId, track: Track): Promise<void> {
    this.errorDeck.set(null);
    this.cargandoDeck.set(deck);
    try {
      await this.mixer.loadTrack(deck, track);
    } catch (err) {
      this.errorDeck.set(httpErrorMessage(err, `No se pudo cargar "${track.title}" en el deck ${deck}.`));
    } finally {
      this.cargandoDeck.set(null);
    }
  }

  /** Agrega la pista al final de la cola de la sesion (se abre una si no hay ninguna). */
  async encolar(track: Track): Promise<void> {
    this.mensajeCola.set(null);
    this.errorCola.set(null);
    if (await this.queue.enqueue(track.id)) {
      this.mensajeCola.set(`"${track.title}" agregada a la cola.`);
    } else {
      this.errorCola.set(this.queue.error() ?? 'No se pudo agregar la pista a la cola.');
    }
  }

  alElegirArchivo(evento: Event): void {
    const input = evento.target as HTMLInputElement;
    const archivo = input.files?.[0];
    if (archivo) {
      this.subir(archivo);
    }
    input.value = ''; // permite volver a elegir el mismo archivo
  }

  private subir(archivo: File): void {
    this.subiendo.set(true);
    this.mensajeSubida.set(null);
    this.errorSubida.set(null);
    this.api
      .analyze(archivo)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (track) => {
          this.tracks.update((actuales) => [track, ...actuales.filter((t) => t.id !== track.id)]);
          this.mensajeSubida.set(`"${track.title}" analizada: ${formatBpm(track.bpm)} BPM, ${track.key} (${track.camelot}).`);
          this.subiendo.set(false);
        },
        error: (err) => {
          this.errorSubida.set(httpErrorMessage(err, 'No se pudo analizar el archivo.'));
          this.subiendo.set(false);
        },
      });
  }
}
