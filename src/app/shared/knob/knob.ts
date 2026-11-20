import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';

/** Recorrido del giro de la perilla: de -135 a +135 grados (270 en total), como en una mesa de mezclas. */
const MIN_ANGLE = -135;
const SWEEP = 270;
/** Pixeles que hay que arrastrar en vertical para recorrer todo el rango. */
const DRAG_PIXELS = 160;
/** Con Mayus pulsado el arrastre es 4 veces mas fino. */
const FINE_FACTOR = 0.25;
/** Largo de la circunferencia del anillo del dibujo (radio 20) y del arco de 270 grados. */
const RING_LENGTH = 2 * Math.PI * 20;
const ARC_LENGTH = RING_LENGTH * (SWEEP / 360);

/**
 * Perilla rotativa de una mesa de mezclas. Se maneja arrastrando en vertical (con el dedo o el raton), con las flechas
 * del teclado y con doble clic para volver al reposo. Debajo lleva un control deslizante nativo: es lo que ven los
 * lectores de pantalla y el teclado, asi que la perilla es tan accesible como un slider normal.
 */
@Component({
  selector: 'app-knob',
  templateUrl: './knob.html',
  styleUrl: './knob.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class KnobComponent {
  /** Nombre accesible del control (lo lee el lector de pantalla). */
  readonly labelText = input.required<string>();
  /** Texto corto que se ve bajo la perilla cuando el nombre accesible no cabe; por defecto, el mismo nombre. */
  readonly visibleLabel = input<string | null>(null);
  readonly rawValue = input.required<number>();
  readonly min = input(0);
  readonly max = input(1);
  readonly stepSize = input(0.01);
  /** Valor al que vuelve con doble clic (el centro: en el EQ es la banda plana). */
  readonly restValue = input(0.5);

  /** Avisa del nuevo valor, ya limitado al rango y ajustado al paso. */
  readonly change = output<number>();

  protected readonly isActive = signal(false);
  private dragState: { y: number; rawValue: number } | null = null;

  /** Posicion de la perilla, de 0 (minimo) a 1 (maximo). */
  private readonly fraction = computed(() => {
    const valueRange = this.max() - this.min();
    return valueRange > 0 ? Math.min(1, Math.max(0, (this.rawValue() - this.min()) / valueRange)) : 0;
  });
  protected readonly angle = computed(() => MIN_ANGLE + SWEEP * this.fraction());
  protected readonly arc = computed(() => `${(ARC_LENGTH * this.fraction()).toFixed(2)} ${RING_LENGTH.toFixed(2)}`);
  protected readonly totalArc = `${ARC_LENGTH.toFixed(2)} ${RING_LENGTH.toFixed(2)}`;

  protected onPress(domEvent: PointerEvent): void {
    domEvent.preventDefault();
    this.dragState = { y: domEvent.clientY, rawValue: this.rawValue() };
    this.isActive.set(true);
    try {
      (domEvent.currentTarget as HTMLElement).setPointerCapture?.(domEvent.pointerId);
    } catch {
      // Un puntero sintetico (pruebas) no se puede capturar: el arrastre sigue funcionando sobre la perilla.
    }
    // El foco va al control nativo para que el teclado siga a partir de aqui.
    ((domEvent.currentTarget as HTMLElement).parentElement?.querySelector('input') as HTMLElement | null)?.focus();
  }

  protected onMove(domEvent: PointerEvent): void {
    if (!this.dragState) {
      return;
    }
    const factor = domEvent.shiftKey ? FINE_FACTOR : 1;
    const displacement = ((this.dragState.y - domEvent.clientY) / DRAG_PIXELS) * (this.max() - this.min()) * factor;
    this.change.emit(this.adjust(this.dragState.rawValue + displacement));
  }

  protected onRelease(): void {
    this.dragState = null;
    this.isActive.set(false);
  }

  protected onDoubleClick(): void {
    this.change.emit(this.adjust(this.restValue()));
  }

  protected onInput(domEvent: Event): void {
    this.change.emit(Number((domEvent.target as HTMLInputElement).value));
  }

  /** Limita al rango y ajusta al paso (con redondeo para no arrastrar errores de coma flotante). */
  private adjust(rawValue: number): number {
    const clamped = Math.min(this.max(), Math.max(this.min(), rawValue));
    const stepCount = Math.round((clamped - this.min()) / this.stepSize());
    return Number(Math.min(this.max(), this.min() + stepCount * this.stepSize()).toFixed(6));
  }
}
