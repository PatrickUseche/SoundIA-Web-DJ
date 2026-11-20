import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { litSegments, segmentZone, SegmentZone } from '../../core/audio/level';

interface Segmento {
  encendido: boolean;
  zona: SegmentZone;
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
  readonly etiqueta = input.required<string>();
  readonly nivel = input.required<number>();
  readonly segmentos = input(12);

  protected readonly porcentaje = computed(() => Math.round(Math.min(1, Math.max(0, this.nivel())) * 100));

  /** De arriba hacia abajo (como se dibuja), con el segmento 0 de la lista siendo el de abajo del medidor. */
  protected readonly lista = computed<Segmento[]>(() => {
    const total = this.segmentos();
    const encendidos = litSegments(this.nivel(), total);
    return Array.from({ length: total }, (_, i) => ({ encendido: i < encendidos, zona: segmentZone(i, total) }));
  });
}
