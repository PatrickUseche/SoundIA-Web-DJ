import { Component, OnInit, computed, effect, inject, signal } from '@angular/core';
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

/** Cada cuanto se vuelve a pedir la lista mientras alguna pista tiene la voz en analisis. */
export const REFRESCO_VOZ_MS = 5000;

/** Formas de ordenar la lista: la del API (mas recientes primero), por tempo, por tonalidad o por titulo. */
export type OrdenBiblioteca = 'recientes' | 'bpm-asc' | 'bpm-desc' | 'camelot' | 'titulo';

export const ORDENES: { valor: OrdenBiblioteca; texto: string }[] = [
  { valor: 'recientes', texto: 'Mas recientes' },
  { valor: 'bpm-asc', texto: 'BPM de menor a mayor' },
  { valor: 'bpm-desc', texto: 'BPM de mayor a menor' },
  { valor: 'camelot', texto: 'Tonalidad (Camelot)' },
  { valor: 'titulo', texto: 'Titulo' },
];

/** Posicion de un codigo Camelot en la rueda (1A, 1B, 2A...); los codigos no validos van al final. */
export function claveCamelot(codigo: string): number {
  const partes = /^(\d{1,2})([AB])$/i.exec(codigo.trim());
  return partes ? Number(partes[1]) * 2 + (partes[2].toUpperCase() === 'B' ? 1 : 0) : Number.MAX_SAFE_INTEGER;
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
  readonly cargando = signal(false);
  readonly error = signal<string | null>(null);

  /** Se esta analizando un archivo subido. */
  readonly subiendo = signal(false);
  readonly mensajeSubida = signal<string | null>(null);
  readonly errorSubida = signal<string | null>(null);

  /** Aviso tras agregar una pista a la cola del Auto-DJ (o el motivo por el que no se pudo). */
  readonly mensajeCola = signal<string | null>(null);
  readonly errorCola = signal<string | null>(null);

  /** Pista cuyo borrado espera confirmacion, y pista que se esta borrando. */
  readonly confirmandoBorrado = signal<number | null>(null);
  readonly borrando = signal<number | null>(null);
  readonly mensajeBorrado = signal<string | null>(null);
  readonly errorBorrado = signal<string | null>(null);

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

  /** Filtros de la lista: texto del titulo, orden y solo las que mezclan bien con lo que hay en los decks. */
  readonly busqueda = signal('');
  readonly orden = signal<OrdenBiblioteca>('recientes');
  readonly soloCompatibles = signal(false);
  protected readonly ordenes = ORDENES;

  /** Hay alguna pista cargada en un deck: solo entonces tiene sentido filtrar por compatibles. */
  readonly hayDecksCargados = computed(() => this.camelotsEnDecks().length > 0);

  /** Las pistas que se muestran: la lista filtrada y ordenada. */
  readonly visibles = computed(() => {
    const texto = this.busqueda().trim().toLowerCase();
    let lista = this.tracks();
    if (texto !== '') {
      lista = lista.filter((t) => t.title.toLowerCase().includes(texto));
    }
    if (this.soloCompatibles() && this.hayDecksCargados()) {
      lista = lista.filter((t) => this.compatible(t));
    }
    const criterio: Record<OrdenBiblioteca, ((a: Track, b: Track) => number) | null> = {
      recientes: null,
      'bpm-asc': (a, b) => a.bpm - b.bpm,
      'bpm-desc': (a, b) => b.bpm - a.bpm,
      camelot: (a, b) => claveCamelot(a.camelot) - claveCamelot(b.camelot) || a.bpm - b.bpm,
      titulo: (a, b) => a.title.localeCompare(b.title, 'es'),
    };
    const comparar = criterio[this.orden()];
    return comparar ? [...lista].sort(comparar) : lista;
  });

  /** Pistas que se analizaron antes de guardar el audio: no se pueden cargar y hay que volver a subirlas. */
  readonly sinAudio = computed(() => this.tracks().filter((t) => !t.hasAudio).length);

  private temporizadorVoz: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    // Si una pista cambia en otra parte (por ejemplo se fija su primer tiempo en un deck), la lista se actualiza.
    effect(() => {
      const cambiada = this.mixer.updatedTrack();
      if (cambiada) {
        this.tracks.update((lista) => lista.map((t) => (t.id === cambiada.id ? cambiada : t)));
      }
    });
  }

  ngOnInit(): void {
    this.destroyRef.onDestroy(() => this.cancelarRefrescoVoz());
    this.recargar();
  }

  recargar(): void {
    this.cancelarRefrescoVoz();
    this.cargando.set(true);
    this.error.set(null);
    this.api
      .list()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (tracks) => {
          this.tracks.set(tracks);
          this.cargando.set(false);
          this.programarRefrescoVoz();
        },
        error: (err) => {
          this.error.set(httpErrorMessage(err, 'No se pudo cargar la biblioteca.'));
          this.cargando.set(false);
        },
      });
  }

  /**
   * Mientras alguna pista tenga la voz en analisis (tarda minutos, en segundo plano) vuelve a pedir la lista cada
   * pocos segundos, sin el estado de carga, para que el aviso "analizando voz" se quite solo. Si falla se detiene:
   * el boton Actualizar la reanuda.
   */
  private programarRefrescoVoz(): void {
    if (this.temporizadorVoz !== null || !this.tracks().some((t) => this.analizandoVoz(t))) {
      return;
    }
    this.temporizadorVoz = setTimeout(() => {
      this.temporizadorVoz = null;
      this.api
        .list()
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (tracks) => {
            this.tracks.set(tracks);
            this.programarRefrescoVoz();
          },
          // Es un refresco de fondo: si falla se deja la lista como esta, sin mostrar un error ni reintentar.
          error: () => undefined,
        });
    }, REFRESCO_VOZ_MS);
  }

  private cancelarRefrescoVoz(): void {
    if (this.temporizadorVoz !== null) {
      clearTimeout(this.temporizadorVoz);
      this.temporizadorVoz = null;
    }
  }

  /** La pista mezcla bien (por tonalidad) con alguna de las que ya estan cargadas en los decks. */
  compatible(track: Track): boolean {
    return this.camelotsEnDecks().some((codigo) => codigo !== '' && areCompatible(codigo, track.camelot));
  }

  /** La voz del final de la pista esta en la cola de analisis o analizandose. */
  analizandoVoz(track: Track): boolean {
    return track.vocals?.status === 'pending' || track.vocals?.status === 'running';
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

  alBuscarTexto(evento: Event): void {
    this.busqueda.set((evento.target as HTMLInputElement).value);
  }

  alOrdenar(evento: Event): void {
    this.orden.set((evento.target as HTMLSelectElement).value as OrdenBiblioteca);
  }

  alFiltrarCompatibles(evento: Event): void {
    this.soloCompatibles.set((evento.target as HTMLInputElement).checked);
  }

  /** Pide confirmacion antes de borrar: es irreversible (se borra tambien el audio). */
  pedirBorrado(track: Track): void {
    this.mensajeBorrado.set(null);
    this.errorBorrado.set(null);
    this.confirmandoBorrado.set(track.id);
  }

  cancelarBorrado(): void {
    this.confirmandoBorrado.set(null);
  }

  /** Borra la pista y su audio. Una pista cargada en un deck no se puede borrar: primero hay que descargarla. */
  borrar(track: Track): void {
    this.confirmandoBorrado.set(null);
    this.borrando.set(track.id);
    this.api
      .delete(track.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.tracks.update((actuales) => actuales.filter((t) => t.id !== track.id));
          this.mensajeBorrado.set(`"${track.title}" borrada.`);
          this.borrando.set(null);
          // El API la quita de las colas: se vuelve a leer la de la sesion para que no muestre pistas borradas.
          void this.queue.refresh();
        },
        error: (err) => {
          this.errorBorrado.set(httpErrorMessage(err, `No se pudo borrar "${track.title}".`));
          this.borrando.set(null);
        },
      });
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
          this.programarRefrescoVoz();
        },
        error: (err) => {
          this.errorSubida.set(httpErrorMessage(err, 'No se pudo analizar el archivo.'));
          this.subiendo.set(false);
        },
      });
  }
}
