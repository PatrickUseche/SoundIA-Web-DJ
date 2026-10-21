import { Component, inject } from '@angular/core';
import { MixerService } from '../../core/services/mixer';
import { DeckComponent } from '../deck/deck';

/** La mesa de mezclas completa: deck A, crossfader y volumen maestro, y deck B. */
@Component({
  selector: 'app-dj-console',
  imports: [DeckComponent],
  templateUrl: './dj-console.html',
})
export class DjConsoleComponent {
  protected readonly mixer = inject(MixerService);

  alMoverCrossfader(evento: Event): void {
    this.mixer.setCrossfader(Number((evento.target as HTMLInputElement).value));
  }

  centrarCrossfader(): void {
    this.mixer.setCrossfader(0.5);
  }

  alMoverVolumenMaestro(evento: Event): void {
    this.mixer.setMasterVolume(Number((evento.target as HTMLInputElement).value));
  }
}
