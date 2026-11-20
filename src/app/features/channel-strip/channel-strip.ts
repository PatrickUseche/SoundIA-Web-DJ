import { isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, PLATFORM_ID, computed, inject, input, signal } from '@angular/core';
import { DeckId } from '../../core/audio/deck';
import { EqBand } from '../../core/audio/eq';
import { smoothLevel } from '../../core/audio/level';
import { MixerService } from '../../core/services/mixer';
import { KnobComponent } from '../../shared/knob/knob';
import { LevelMeterComponent } from '../../shared/level-meter/level-meter';

/** Cada cuanto se lee el nivel del canal para el medidor. */
export const METER_REFRESH_MS = 50;

/** De arriba abajo, como en una mezcladora: agudos, medios y graves. */
const EQ_ORDER: EqBand[] = ['high', 'mid', 'low'];
const BAND_NAME: Record<EqBand, string> = { low: 'Graves', mid: 'Medios', high: 'Agudos' };

/** Canal de un deck en la mezcladora: perillas del EQ, medidor de nivel y fader de volumen. */
@Component({
  selector: 'app-channel-strip',
  imports: [KnobComponent, LevelMeterComponent],
  templateUrl: './channel-strip.html',
  styleUrl: './channel-strip.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChannelStripComponent {
  readonly deckId = input.required<DeckId>();

  private readonly mixer = inject(MixerService);
  protected readonly deck = computed(() => this.mixer.deck(this.deckId()));
  protected readonly eqBands = EQ_ORDER;
  protected readonly bandName = BAND_NAME;
  protected readonly meterLevel = signal(0);

  constructor() {
    if (isPlatformBrowser(inject(PLATFORM_ID))) {
      const timerHandle = setInterval(
        () => this.meterLevel.update((previousItem) => smoothLevel(previousItem, this.deck().level())),
        METER_REFRESH_MS,
      );
      inject(DestroyRef).onDestroy(() => clearInterval(timerHandle));
    }
  }

  protected onVolumeMove(domEvent: Event): void {
    this.deck().setVolume(Number((domEvent.target as HTMLInputElement).value));
  }
}
