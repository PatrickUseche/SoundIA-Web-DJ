import { ComponentFixture, TestBed } from '@angular/core/testing';
import { WaveformComponent } from './waveform';

/** jsdom no implementa canvas: se sustituye getContext por un contexto que registra lo que se dibuja. */
function espiarCanvas() {
  const rects: { x: number; color: string }[] = [];
  const contexto = {
    fillStyle: '',
    clearRect: vi.fn(),
    fillRect(x: number) {
      rects.push({ x, color: String(this.fillStyle) });
    },
  };
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(contexto as unknown as CanvasRenderingContext2D);
  return { contexto, rects };
}

describe('WaveformComponent', () => {
  let fixture: ComponentFixture<WaveformComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [WaveformComponent] }).compileComponents();
  });

  afterEach(() => vi.restoreAllMocks());

  const crear = () => {
    fixture = TestBed.createComponent(WaveformComponent);
    return fixture;
  };
  const poner = (displayName: string, rawValue: unknown) => fixture.componentRef.setInput(displayName, rawValue);
  const canvas = () => (fixture.nativeElement as HTMLElement).querySelector('canvas') as HTMLCanvasElement;

  it('dibuja con los colores recibidos', () => {
    const { rects } = espiarCanvas();
    crear();
    poner('peaks', new Float32Array([1]));
    poner('width', 10);
    poner('progress', 1);
    poner('colors', { played: '#123456', remaining: '#654321', playhead: '#ffffff', cue: '#ffb300' });
    fixture.detectChanges();

    expect(rects.some((r) => r.color === '#123456')).toBe(true);
  });

  it('crea un canvas con el tamano pedido y una etiqueta accesible', () => {
    espiarCanvas();
    crear();
    poner('width', 300);
    poner('height', 50);
    poner('labelText', 'Forma de onda del deck A');
    fixture.detectChanges();

    expect(canvas().getAttribute('width')).toBe('300');
    expect(canvas().getAttribute('height')).toBe('50');
    expect(canvas().getAttribute('aria-label')).toBe('Forma de onda del deck A');
    expect(canvas().getAttribute('role')).toBe('img');
  });

  it('sin picos solo limpia el lienzo', async () => {
    const { contexto, rects } = espiarCanvas();
    crear();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(contexto.clearRect).toHaveBeenCalled();
    expect(rects.length).toBe(0);
  });

  it('con picos dibuja la forma de onda', async () => {
    const { rects } = espiarCanvas();
    crear();
    poner('width', 60);
    poner('peaks', new Float32Array([0.5, 1, 0.3]));
    fixture.detectChanges();
    await fixture.whenStable();

    expect(rects.length).toBeGreaterThanOrEqual(10); // una barra cada 6 px mas la linea de reproduccion
  });

  it('se redibuja cuando cambia el progreso', async () => {
    const { contexto } = espiarCanvas();
    crear();
    poner('peaks', new Float32Array([1]));
    fixture.detectChanges();
    await fixture.whenStable();
    const antes = contexto.clearRect.mock.calls.length;

    poner('progress', 0.7);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(contexto.clearRect.mock.calls.length).toBeGreaterThan(antes);
  });

  it('no falla si el navegador no ofrece contexto 2D', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    crear();
    poner('peaks', new Float32Array([1]));

    expect(() => fixture.detectChanges()).not.toThrow();
    await fixture.whenStable();
  });

  describe('clic para buscar', () => {
    const hacerClic = (x: number, ancho = 200) => {
      vi.spyOn(canvas(), 'getBoundingClientRect').mockReturnValue({ left: 10, width: ancho } as DOMRect);
      canvas().dispatchEvent(new MouseEvent('click', { clientX: x }));
    };

    it('emite la fraccion de la pista donde se hizo clic', () => {
      espiarCanvas();
      crear();
      poner('peaks', new Float32Array([1]));
      fixture.detectChanges();
      const recibidas: number[] = [];
      fixture.componentInstance.seek.subscribe((f) => recibidas.push(f));

      hacerClic(110); // 100 px dentro de un canvas de 200 px

      expect(recibidas).toEqual([0.5]);
    });

    it('limita la fraccion a 0-1 si el clic cae fuera', () => {
      espiarCanvas();
      crear();
      poner('peaks', new Float32Array([1]));
      fixture.detectChanges();
      const recibidas: number[] = [];
      fixture.componentInstance.seek.subscribe((f) => recibidas.push(f));

      hacerClic(0);
      hacerClic(500);

      expect(recibidas).toEqual([0, 1]);
    });

    it('sin pista no emite nada', () => {
      espiarCanvas();
      crear();
      fixture.detectChanges();
      const recibidas: number[] = [];
      fixture.componentInstance.seek.subscribe((f) => recibidas.push(f));

      hacerClic(110);

      expect(recibidas).toEqual([]);
    });

    it('un canvas sin ancho no emite nada (evita dividir por cero)', () => {
      espiarCanvas();
      crear();
      poner('peaks', new Float32Array([1]));
      fixture.detectChanges();
      const recibidas: number[] = [];
      fixture.componentInstance.seek.subscribe((f) => recibidas.push(f));

      hacerClic(110, 0);

      expect(recibidas).toEqual([]);
    });
  });
});
