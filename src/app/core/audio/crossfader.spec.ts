import { crossfaderGains } from './crossfader';

describe('crossfaderGains', () => {
  it('en el extremo izquierdo solo suena A', () => {
    const { a, b } = crossfaderGains(0);

    expect(a).toBe(1);
    expect(b).toBeCloseTo(0);
  });

  it('en el extremo derecho solo suena B', () => {
    const { a, b } = crossfaderGains(1);

    expect(a).toBeCloseTo(0);
    expect(b).toBe(1);
  });

  it('en el centro los dos suenan con la misma ganancia (-3 dB)', () => {
    const { a, b } = crossfaderGains(0.5);

    expect(a).toBeCloseTo(b);
    expect(a).toBeCloseTo(Math.SQRT1_2);
  });

  it('la potencia total es constante en todo el recorrido', () => {
    for (let p = 0; p <= 1.0001; p += 0.05) {
      const { a, b } = crossfaderGains(p);
      expect(a * a + b * b).toBeCloseTo(1, 10);
    }
  });

  it('al mover hacia B, A baja y B sube', () => {
    let previousItem = crossfaderGains(0);
    for (let p = 0.05; p <= 1.0001; p += 0.05) {
      const currentItem = crossfaderGains(p);
      expect(currentItem.a).toBeLessThanOrEqual(previousItem.a);
      expect(currentItem.b).toBeGreaterThanOrEqual(previousItem.b);
      previousItem = currentItem;
    }
  });

  it('limita las posiciones fuera de rango', () => {
    expect(crossfaderGains(-2)).toEqual(crossfaderGains(0));
    expect(crossfaderGains(5)).toEqual(crossfaderGains(1));
  });
});
