import { Component, ElementRef, effect, input, output, viewChild } from '@angular/core';
import { DEFAULT_WAVEFORM_COLORS, WaveformColors, drawWaveform } from '../../core/audio/waveform-draw';

/** Forma de onda de una pista dibujada en un canvas. Un clic emite la fraccion (0-1) donde se hizo. */
@Component({
  selector: 'app-waveform',
  template: `
    <canvas
      #canvas
      [attr.width]="width()"
      [attr.height]="height()"
      role="img"
      [attr.aria-label]="labelText()"
      style="width: 100%; cursor: pointer; background: var(--fondo, #0a0a14); border-radius: 6px;"
      (click)="onClick($event)"
    ></canvas>
  `,
})
export class WaveformComponent {
  /** Picos normalizados de la pista (0-1); null si no hay pista. */
  readonly peaks = input<Float32Array | null>(null);
  /** Posicion actual como fraccion de la duracion (0-1). */
  readonly progress = input(0);
  /** Puntos de mezcla como fracciones de la duracion (0-1). */
  readonly cues = input<number[]>([]);
  readonly width = input(600);
  readonly height = input(80);
  readonly labelText = input('Forma de onda');
  /** Colores del dibujo; por defecto los neutros. */
  readonly colors = input<WaveformColors>(DEFAULT_WAVEFORM_COLORS);

  /** Fraccion (0-1) de la pista en la que el usuario hizo clic. */
  readonly seek = output<number>();

  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');

  constructor() {
    // Se redibuja cada vez que cambia cualquier entrada.
    effect(() => {
      const context = this.canvas().nativeElement.getContext('2d');
      if (context) {
        drawWaveform(context, this.peaks(), this.width(), this.height(), this.progress(), this.cues(), this.colors());
      }
    });
  }

  onClick(domEvent: MouseEvent): void {
    if (!this.peaks()) {
      return; // sin pista no hay a donde saltar
    }
    const rect = this.canvas().nativeElement.getBoundingClientRect();
    if (rect.width === 0) {
      return;
    }
    this.seek.emit(Math.min(1, Math.max(0, (domEvent.clientX - rect.left) / rect.width)));
  }
}
