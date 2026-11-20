import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { litSegments, segmentZone, SegmentZone } from '../../core/audio/level';

interface Segment {
  lit: boolean;
  zone: SegmentZone;
}

/**
 * Medidor de nivel de columna con segmentos tipo LED (verde, ambar y rojo), como el de un canal de mezcladora. Dibuja el
 * nivel que le dan (0-1, ya en escala de dB); para los lectores de pantalla es un `meter` con el porcentaje.
 */
@Component({
  selector: 'app-level-meter',
  templateUrl: './level-meter.html',
  styleUrl: './level-meter.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LevelMeterComponent {
  readonly labelText = input.required<string>();
  readonly meterLevel = input.required<number>();
  readonly segments = input(12);

  protected readonly percentage = computed(() => Math.round(Math.min(1, Math.max(0, this.meterLevel())) * 100));

  /** De arriba hacia abajo (como se dibuja), con el segmento 0 de la lista siendo el de abajo del medidor. */
  protected readonly itemList = computed<Segment[]>(() => {
    const total = this.segments();
    const litCount = litSegments(this.meterLevel(), total);
    return Array.from({ length: total }, (_, i) => ({ lit: i < litCount, zone: segmentZone(i, total) }));
  });
}
