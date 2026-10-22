import { Component, DestroyRef, PLATFORM_ID, computed, inject, input, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { MixerService } from '../../core/services/mixer';
import { DeckId } from '../../core/audio/deck';
import { EQ_BANDS, EqBand } from '../../core/audio/eq';
import { formatBpm, formatPitch, formatTime } from '../../core/audio/format';
import { WaveformComponent } from '../../shared/waveform/waveform';

// Cada cuanto se lee la posicion de reproduccion para refrescar el reloj y la forma de onda.
const POSITION_REFRESH_MS = 50;

const NOMBRE_BANDA: Record<EqBand, string> = { low: 'Graves', mid: 'Medios', high: 'Agudos' };

/** Controles de un deck: reproduccion, cue, sincronizacion de tempo, pitch, volumen, EQ y forma de onda. */
@Component({
  selector: 'app-deck',
  imports: [WaveformComponent],
  templateUrl: './deck.html',
})
export class DeckComponent {
  readonly deckId = input.required<DeckId>();

  private readonly mixer = inject(MixerService);
  protected readonly deck = computed(() => this.mixer.deck(this.deckId()));

  protected readonly bandas = EQ_BANDS;
  protected readonly nombreBanda = NOMBRE_BANDA;
  protected readonly formatTime = formatTime;
  protected readonly formatBpm = formatBpm;
  protected readonly formatPitch = formatPitch;

  /** Posicion actual en segundos; se refresca con un temporizador porque el reloj de audio avanza solo. */
  protected readonly position = signal(0);
  /** Resultado del ultimo intento de sincronizar el tempo, para mostrarlo al usuario. */
  protected readonly mensajeSync = signal<string | null>(null);

  protected readonly progreso = computed(() => {
    const duration = this.deck().duration;
    return duration > 0 ? this.position() / duration : 0;
  });

  protected readonly marcasCue = computed(() => {
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

  async alternarReproduccion(): Promise<void> {
    const deck = this.deck();
    if (deck.playing()) {
      deck.pause();
    } else {
      await this.mixer.resume(); // el navegador exige un gesto del usuario para empezar a sonar
      deck.play();
    }
    this.position.set(deck.position());
  }

  ponerCue(): void {
    this.deck().setCue();
  }

  irAlCue(): void {
    this.deck().goToCue();
    this.position.set(this.deck().position());
  }

  sincronizar(): void {
    const match = this.mixer.sync(this.deckId());
    if (match === null) {
      this.mensajeSync.set('Carga una pista con BPM en los dos decks para sincronizar.');
    } else if (!match.feasible) {
      this.mensajeSync.set('Los tempos estan demasiado lejos: el pitch llego al limite de +-8 %.');
    } else {
      this.mensajeSync.set(null);
    }
  }

  alBuscar(fraccion: number): void {
    this.deck().seek(fraccion * this.deck().duration);
    this.position.set(this.deck().position());
  }

  alMoverPitch(evento: Event): void {
    this.deck().setPitch(this.valorDe(evento));
  }

  alMoverVolumen(evento: Event): void {
    this.deck().setVolume(this.valorDe(evento));
  }

  alMoverEq(banda: EqBand, evento: Event): void {
    this.deck().setEq(banda, this.valorDe(evento));
  }

  expulsar(): void {
    this.deck().eject();
    this.position.set(0);
    this.mensajeSync.set(null);
  }

  private valorDe(evento: Event): number {
    return Number((evento.target as HTMLInputElement).value);
  }
}
