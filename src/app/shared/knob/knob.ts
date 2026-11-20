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
  readonly etiqueta = input.required<string>();
  /** Texto corto que se ve bajo la perilla cuando el nombre accesible no cabe; por defecto, el mismo nombre. */
  readonly etiquetaVisible = input<string | null>(null);
  readonly valor = input.required<number>();
  readonly min = input(0);
  readonly max = input(1);
  readonly paso = input(0.01);
  /** Valor al que vuelve con doble clic (el centro: en el EQ es la banda plana). */
  readonly reposo = input(0.5);

  /** Avisa del nuevo valor, ya limitado al rango y ajustado al paso. */
  readonly cambio = output<number>();

  protected readonly activa = signal(false);
  private arrastre: { y: number; valor: number } | null = null;

  /** Posicion de la perilla, de 0 (minimo) a 1 (maximo). */
  private readonly fraccion = computed(() => {
    const rango = this.max() - this.min();
    return rango > 0 ? Math.min(1, Math.max(0, (this.valor() - this.min()) / rango)) : 0;
  });
  protected readonly angulo = computed(() => MIN_ANGLE + SWEEP * this.fraccion());
  protected readonly arco = computed(() => `${(ARC_LENGTH * this.fraccion()).toFixed(2)} ${RING_LENGTH.toFixed(2)}`);
  protected readonly arcoTotal = `${ARC_LENGTH.toFixed(2)} ${RING_LENGTH.toFixed(2)}`;

  protected alPulsar(evento: PointerEvent): void {
    evento.preventDefault();
    this.arrastre = { y: evento.clientY, valor: this.valor() };
    this.activa.set(true);
    try {
      (evento.currentTarget as HTMLElement).setPointerCapture?.(evento.pointerId);
    } catch {
      // Un puntero sintetico (pruebas) no se puede capturar: el arrastre sigue funcionando sobre la perilla.
    }
    // El foco va al control nativo para que el teclado siga a partir de aqui.
    ((evento.currentTarget as HTMLElement).parentElement?.querySelector('input') as HTMLElement | null)?.focus();
  }

  protected alMover(evento: PointerEvent): void {
    if (!this.arrastre) {
      return;
    }
    const factor = evento.shiftKey ? FINE_FACTOR : 1;
    const desplazamiento = ((this.arrastre.y - evento.clientY) / DRAG_PIXELS) * (this.max() - this.min()) * factor;
    this.cambio.emit(this.ajustar(this.arrastre.valor + desplazamiento));
  }

  protected alSoltar(): void {
    this.arrastre = null;
    this.activa.set(false);
  }

  protected alDobleClic(): void {
    this.cambio.emit(this.ajustar(this.reposo()));
  }

  protected alEntrada(evento: Event): void {
    this.cambio.emit(Number((evento.target as HTMLInputElement).value));
  }

  /** Limita al rango y ajusta al paso (con redondeo para no arrastrar errores de coma flotante). */
  private ajustar(valor: number): number {
    const limitado = Math.min(this.max(), Math.max(this.min(), valor));
    const pasos = Math.round((limitado - this.min()) / this.paso());
    return Number(Math.min(this.max(), this.min() + pasos * this.paso()).toFixed(6));
  }
}
