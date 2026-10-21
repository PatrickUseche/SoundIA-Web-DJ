import { Canvas2D, DEFAULT_WAVEFORM_COLORS, drawWaveform } from './waveform-draw';

/** Contexto 2D de mentira que registra lo que se pinta con cada color. */
class FakeCanvas2D implements Canvas2D {
  fillStyle: string | CanvasGradient | CanvasPattern = '';
  cleared: number[][] = [];
  rects: { x: number; y: number; w: number; h: number; color: string }[] = [];

  clearRect(x: number, y: number, w: number, h: number): void {
    this.cleared.push([x, y, w, h]);
  }

  fillRect(x: number, y: number, w: number, h: number): void {
    this.rects.push({ x, y, w, h, color: String(this.fillStyle) });
  }

  porColor(color: string) {
    return this.rects.filter((r) => r.color === color);
  }
}

const C = DEFAULT_WAVEFORM_COLORS;

describe('drawWaveform', () => {
  it('siempre limpia el lienzo primero', () => {
    const ctx = new FakeCanvas2D();

    drawWaveform(ctx, null, 100, 40, 0);

    expect(ctx.cleared).toEqual([[0, 0, 100, 40]]);
  });

  it('sin picos no dibuja nada mas', () => {
    const ctx = new FakeCanvas2D();

    drawWaveform(ctx, null, 100, 40, 0.5);
    drawWaveform(ctx, new Float32Array(0), 100, 40, 0.5);

    expect(ctx.rects).toEqual([]);
  });

  it('dibuja una barra por columna de pixeles mas la linea de reproduccion', () => {
    const ctx = new FakeCanvas2D();

    drawWaveform(ctx, new Float32Array([0.5, 0.5]), 10, 40, 0);

    const barras = ctx.rects.filter((r) => r.color !== C.playhead);
    expect(barras.length).toBe(10);
    expect(ctx.porColor(C.playhead).length).toBe(1);
  });

  it('colorea de verde lo reproducido y de gris lo que falta', () => {
    const ctx = new FakeCanvas2D();

    drawWaveform(ctx, new Float32Array([1, 1, 1, 1]), 10, 40, 0.5);

    expect(ctx.porColor(C.played).length).toBe(5);
    expect(ctx.porColor(C.remaining).length).toBe(5);
  });

  it('con progreso 0 todo es gris y con progreso 1 todo es verde', () => {
    const inicio = new FakeCanvas2D();
    drawWaveform(inicio, new Float32Array([1]), 8, 40, 0);
    const fin = new FakeCanvas2D();
    drawWaveform(fin, new Float32Array([1]), 8, 40, 1);

    expect(inicio.porColor(C.played).length).toBe(0);
    expect(fin.porColor(C.remaining).length).toBe(0);
  });

  it('la altura de cada barra es proporcional al pico y esta centrada', () => {
    const ctx = new FakeCanvas2D();

    drawWaveform(ctx, new Float32Array([0.5]), 4, 40, 0);

    const barra = ctx.rects[0];
    expect(barra.h).toBe(20);
    expect(barra.y).toBe(10); // (40 - 20) / 2
  });

  it('el silencio se dibuja como una linea de 1 px', () => {
    const ctx = new FakeCanvas2D();

    drawWaveform(ctx, new Float32Array([0]), 4, 40, 0);

    expect(ctx.rects[0].h).toBe(1);
  });

  it('cada columna toma el pico que le corresponde', () => {
    const ctx = new FakeCanvas2D();

    drawWaveform(ctx, new Float32Array([0, 1]), 4, 100, 0);

    const alturas = ctx.rects.filter((r) => r.color === C.remaining).map((r) => r.h);
    expect(alturas).toEqual([1, 1, 100, 100]); // mitad izquierda: pico 0; mitad derecha: pico 1
  });

  it('marca los puntos de mezcla y descarta los que caen fuera de la pista', () => {
    const ctx = new FakeCanvas2D();

    drawWaveform(ctx, new Float32Array([1]), 100, 40, 0, [0.25, 0.8, 1.5, -0.2]);

    const marcas = ctx.porColor(C.cue);
    expect(marcas.map((m) => m.x)).toEqual([25, 80]);
    expect(marcas.every((m) => m.w === 2 && m.h === 40)).toBe(true);
  });

  it('la linea de reproduccion esta en la posicion actual y dentro del lienzo', () => {
    const ctx = new FakeCanvas2D();

    drawWaveform(ctx, new Float32Array([1]), 100, 40, 0.5);
    expect(ctx.porColor(C.playhead)[0].x).toBe(50);

    const fin = new FakeCanvas2D();
    drawWaveform(fin, new Float32Array([1]), 100, 40, 1);
    expect(fin.porColor(C.playhead)[0].x).toBe(99);
  });

  it('limita un progreso fuera de rango', () => {
    const ctx = new FakeCanvas2D();

    drawWaveform(ctx, new Float32Array([1]), 10, 40, 7);

    expect(ctx.porColor(C.remaining).length).toBe(0);
  });

  it('un lienzo sin tamano no dibuja barras', () => {
    const ctx = new FakeCanvas2D();

    drawWaveform(ctx, new Float32Array([1]), 0, 40, 0.5);
    drawWaveform(ctx, new Float32Array([1]), 10, 0, 0.5);

    expect(ctx.rects).toEqual([]);
  });
});
