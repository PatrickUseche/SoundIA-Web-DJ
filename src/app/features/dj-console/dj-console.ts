import { isPlatformBrowser } from '@angular/common';
import { Component, DestroyRef, PLATFORM_ID, inject } from '@angular/core';
import { DeckId } from '../../core/audio/deck';
import { MixerService } from '../../core/services/mixer';
import { DeckComponent } from '../deck/deck';

/** La mesa de mezclas completa: deck A, crossfader y volumen maestro, y deck B. */
@Component({
  selector: 'app-dj-console',
  imports: [DeckComponent],
  templateUrl: './dj-console.html',
  styleUrl: './dj-console.css',
})
export class DjConsoleComponent {
  protected readonly mixer = inject(MixerService);

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
    }
  }

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
