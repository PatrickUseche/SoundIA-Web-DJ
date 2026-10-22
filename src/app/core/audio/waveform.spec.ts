import { computePeaks, normalizePeaks } from './waveform';

describe('computePeaks', () => {
  it('devuelve tantos picos como se piden', () => {
    expect(computePeaks(new Float32Array(1000), 50).length).toBe(50);
  });

  it('cada pico es la amplitud maxima de su tramo', () => {
    const senal = new Float32Array([0.1, 0.5, 0.2, 0.9, 0.3, 0.4]);

    const picos = computePeaks(senal, 3);

    expect(Array.from(picos)).toEqual([
      Math.fround(0.5), // [0.1, 0.5]
      Math.fround(0.9), // [0.2, 0.9]
      Math.fround(0.4), // [0.3, 0.4]
    ]);
  });

  it('usa el valor absoluto: una amplitud negativa cuenta igual', () => {
    expect(Array.from(computePeaks(new Float32Array([0.2, -0.8]), 1))).toEqual([Math.fround(0.8)]);
  });

  it('el ultimo pico absorbe las muestras que sobran de la division entera', () => {
    // 7 muestras en 3 tramos de 2: la 7a muestra (la mayor) debe contar en el ultimo pico.
    const picos = computePeaks(new Float32Array([0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.9]), 3);

    expect(picos[2]).toBeCloseTo(0.9);
  });

  it('una senal mas corta que los picos deja los ultimos en cero', () => {
    const picos = computePeaks(new Float32Array([0.5, 0.7]), 5);

    expect(Array.from(picos)).toEqual([Math.fround(0.5), Math.fround(0.7), 0, 0, 0]);
  });

  it('el silencio da picos en cero', () => {
    expect(Array.from(computePeaks(new Float32Array(100), 4))).toEqual([0, 0, 0, 0]);
  });

  it('una senal vacia da picos en cero', () => {
    expect(Array.from(computePeaks(new Float32Array(0), 3))).toEqual([0, 0, 0]);
  });

  it('un seno de amplitud 1 llega a 1 en todos los picos', () => {
    const muestras = 44100;
    const seno = new Float32Array(muestras).map((_, i) => Math.sin((2 * Math.PI * 440 * i) / 44100));

    const picos = computePeaks(seno, 20);

    for (const pico of picos) {
      expect(pico).toBeGreaterThan(0.99);
    }
  });

  it('rechaza un numero de picos invalido', () => {
    for (const invalido of [0, -1, 1.5, NaN]) {
      expect(() => computePeaks(new Float32Array(10), invalido)).toThrow(RangeError);
    }
  });
});

describe('normalizePeaks', () => {
  it('escala para que el mayor pico valga 1', () => {
    const normalizados = normalizePeaks(new Float32Array([0.1, 0.25, 0.05]));

    expect(normalizados[1]).toBe(1);
    expect(normalizados[0]).toBeCloseTo(0.4);
    expect(normalizados[2]).toBeCloseTo(0.2);
  });

  it('conserva las proporciones entre picos', () => {
    const [a, b] = normalizePeaks(new Float32Array([0.2, 0.4]));

    expect(b / a).toBeCloseTo(2);
  });

  it('el silencio se queda en cero sin dividir por cero', () => {
    expect(Array.from(normalizePeaks(new Float32Array([0, 0, 0])))).toEqual([0, 0, 0]);
  });

  it('no modifica el arreglo original', () => {
    const original = new Float32Array([0.1, 0.2]);

    normalizePeaks(original);

    expect(original[1]).toBeCloseTo(0.2);
  });
});
