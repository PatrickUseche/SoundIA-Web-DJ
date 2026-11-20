import { Component, DestroyRef, PLATFORM_ID, computed, inject, input, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { MixerService } from '../../core/services/mixer';
import { DeckId } from '../../core/audio/deck';
import { formatBpm, formatPitch, formatTime } from '../../core/audio/format';
import { WaveformComponent } from '../../shared/waveform/waveform';
import { DECK_WAVEFORM_COLORS } from '../../core/audio/waveform-draw';
import { httpErrorMessage } from '../../core/http-error-message';
import { MIN_DOWNBEAT_CONFIDENCE } from '../../core/audio/beatgrid';
import { TrackApiService } from '../../core/services/tracks';

/** Cuando quedan estos segundos o menos de una pista que suena, el contador se resalta. */
export const LOW_TIME_LEFT_SECONDS = 30;

// Cada cuanto se lee la posicion de reproduccion para refrescar el reloj y la forma de onda.
const POSITION_REFRESH_MS = 50;

/** Controles de un deck: reproduccion, cue, sincronizacion de tempo, pitch y forma de onda. El EQ y el volumen estan en el canal. */
@Component({
  selector: 'app-deck',
  imports: [WaveformComponent],
  templateUrl: './deck.html',
  styleUrl: './deck.css',
})
export class DeckComponent {
  readonly deckId = input.required<DeckId>();

  private readonly mixer = inject(MixerService);
  private readonly tracks = inject(TrackApiService);
  protected readonly deck = computed(() => this.mixer.deck(this.deckId()));

  protected readonly waveformColors = computed(() => DECK_WAVEFORM_COLORS[this.deckId()]);
  protected readonly formatTime = formatTime;
  protected readonly formatBpm = formatBpm;
  protected readonly formatPitch = formatPitch;

  /** Posicion actual en segundos; se refresca con un temporizador porque el reloj de audio avanza solo. */
  protected readonly position = signal(0);
  /** Resultado del ultimo intento de sincronizar el tempo, para mostrarlo al usuario. */
  protected readonly syncMessage = signal<string | null>(null);
  /** Resultado del ultimo intento de fijar el primer tiempo a mano. */
  protected readonly downbeatMessage = signal<{ bodyText: string; error: boolean } | null>(null);
  protected readonly settingDownbeat = signal(false);

  protected readonly playbackProgress = computed(() => {
    // La posicion se lee siempre: la duracion no es una se�al, y si solo se leyera con pista cargada, un deck creado
    // vacio nunca se suscribiria a la posicion y la barra se quedaria en 0.
    const position = this.position();
    const duration = this.deck().duration;
    return duration > 0 ? position / duration : 0;
  });

  /** Segundos que le quedan a la pista; con poco tiempo se resalta para avisar de que hay que preparar la siguiente. */
  protected readonly timeLeft = computed(() => Math.max(0, this.deck().duration - this.position()));
  protected readonly lowTimeLeft = computed(() => this.deck().playing() && this.timeLeft() <= LOW_TIME_LEFT_SECONDS);

  protected readonly cueMarks = computed(() => {
    const duration = this.deck().duration;
    const track = this.deck().track();
    return duration > 0 && track ? track.cuePoints.map((cue) => cue / duration) : [];
  });

  constructor() {
    if (isPlatformBrowser(inject(PLATFORM_ID))) {
      const timer = setInterval(() => this.position.set(this.deck().position()), POSITION_REFRESH_MS);
      inject(DestroyRef).onDestroy(() => clearInterval(timer));
    }
  }

  async togglePlayback(): Promise<void> {
    const deck = this.deck();
    if (deck.playing()) {
      deck.pause();
    } else {
      await this.mixer.resume(); // el navegador exige un gesto del usuario para empezar a sonar
      deck.play();
    }
    this.position.set(deck.position());
  }

  setCueMarker(): void {
    this.deck().setCue();
  }

  jumpToCue(): void {
    this.deck().goToCue();
    this.position.set(this.deck().position());
  }

  syncDeck(): void {
    const match = this.mixer.sync(this.deckId());
    if (match === null) {
      this.syncMessage.set('Carga una pista con BPM en los dos decks para sincronizar.');
    } else if (!match.feasible) {
      this.syncMessage.set('Los tempos están demasiado lejos: el pitch llegó al límite de +-8 %.');
    } else {
      this.syncMessage.set(null);
    }
  }

  /** Como de fiable es el primer tiempo de la pista cargada, en palabras. */
  protected downbeatStatus(): string | null {
    const grid = this.deck().track()?.grid;
    if (!grid) {
      return null;
    }
    if (grid.manual) {
      return 'fijado a mano';
    }
    return grid.confidence >= MIN_DOWNBEAT_CONFIDENCE
      ? `detectado (confianza ${Math.round(grid.confidence * 100)} %)`
      : 'incierto: se alinea solo por pulsos. Escucha y marca un primer tiempo para alinear por compases';
  }

  /**
   * Fija como primer tiempo el punto donde está la pista ahora. Se puede pausar o buscar para acertar; el motor lo
   * ajusta al pulso mas cercano, asi que basta con estar a menos de medio pulso.
   */
  markDownbeat(): void {
    const track = this.deck().track();
    if (!track?.grid || this.settingDownbeat()) {
      return;
    }
    const wholeSecond = this.deck().position();
    this.settingDownbeat.set(true);
    this.downbeatMessage.set(null);
    this.tracks.setDownbeat(track.id, wholeSecond).subscribe({
      next: (updatedTrackInfo) => {
        this.mixer.updateTrack(updatedTrackInfo);
        this.downbeatMessage.set({ bodyText: 'Primer tiempo fijado.', error: false });
        this.settingDownbeat.set(false);
      },
      error: (err: unknown) => {
        this.downbeatMessage.set({ bodyText: httpErrorMessage(err, 'No se pudo fijar el primer tiempo.'), error: true });
        this.settingDownbeat.set(false);
      },
    });
  }

  onSeek(fraction: number): void {
    this.deck().seek(fraction * this.deck().duration);
    this.position.set(this.deck().position());
  }

  onPitchMove(domEvent: Event): void {
    this.deck().setPitch(this.readValue(domEvent));
  }

  ejectDeck(): void {
    this.deck().eject();
    this.position.set(0);
    this.syncMessage.set(null);
  }

  private readValue(domEvent: Event): number {
    return Number((domEvent.target as HTMLInputElement).value);
  }
}
