import { isPlatformBrowser } from '@angular/common';
import { Component, DestroyRef, PLATFORM_ID, inject, signal } from '@angular/core';
import { DeckId } from '../../core/audio/deck';
import { smoothLevel } from '../../core/audio/level';
import { MixerService } from '../../core/services/mixer';
import { KnobComponent } from '../../shared/knob/knob';
import { LevelMeterComponent } from '../../shared/level-meter/level-meter';
import { ChannelStripComponent, METER_REFRESH_MS } from '../channel-strip/channel-strip';
import { DeckComponent } from '../deck/deck';

/** La mesa de mezclas completa: deck A, mezclador (canales, volumen maestro y crossfader) y deck B. */
@Component({
  selector: 'app-dj-console',
  imports: [DeckComponent, ChannelStripComponent, KnobComponent, LevelMeterComponent],
  templateUrl: './dj-console.html',
  styleUrl: './dj-console.css',
})
export class DjConsoleComponent {
  protected readonly mixer = inject(MixerService);
  /** Nivel de la salida de la mesa para el medidor maestro. */
  protected readonly nivelMaestro = signal(0);

  constructor() {
    if (isPlatformBrowser(inject(PLATFORM_ID))) {
      // Recargar o cerrar la pestana sin querer en pleno set cortaria la musica: el navegador pide confirmacion.
      const advertir = (evento: BeforeUnloadEvent) => {
        const sonando = this.mixer.supported && (['A', 'B'] as DeckId[]).some((id) => this.mixer.deck(id).playing());
        if (sonando) {
          evento.preventDefault();
          evento.returnValue = '';
        }
      };
      window.addEventListener('beforeunload', advertir);
      inject(DestroyRef).onDestroy(() => window.removeEventListener('beforeunload', advertir));

      const medidor = setInterval(
        () => this.nivelMaestro.update((anterior) => smoothLevel(anterior, this.mixer.masterLevel())),
        METER_REFRESH_MS,
      );
      inject(DestroyRef).onDestroy(() => clearInterval(medidor));
    }
  }

  alMoverCrossfader(evento: Event): void {
    this.mixer.setCrossfader(Number((evento.target as HTMLInputElement).value));
  }

  centrarCrossfader(): void {
    this.mixer.setCrossfader(0.5);
  }
}
