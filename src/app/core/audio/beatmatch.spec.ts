import { MAX_PITCH_ADJUSTMENT, clampPitch, matchTempo } from './beatmatch';

describe('matchTempo', () => {
  it('mismo tempo no requiere ajuste', () => {
    expect(matchTempo(128, 128)).toEqual({ ratio: 1, multiplier: 1, feasible: true });
  });

  it('tempos cercanos son factibles y el ratio lleva la pista al tempo de la referencia', () => {
    const match = matchTempo(128, 124);

    expect(match.feasible).toBe(true);
    expect(124 * match.ratio).toBeCloseTo(128);
  });

  it('el limite exacto del pitch fader (8 %) es factible', () => {
    expect(matchTempo(108, 100).feasible).toBe(true);
  });

  it('mas alla del limite no es factible', () => {
    expect(matchTempo(128, 140).feasible).toBe(false); // -8.6 %
    expect(matchTempo(128, 115).feasible).toBe(false); // +11 %
  });

  it('una pista al doble de tempo se mezcla contando la mitad de sus pulsos', () => {
    const match = matchTempo(70, 140);

    expect(match.multiplier).toBe(0.5);
    expect(match.ratio).toBeCloseTo(1);
    expect(match.feasible).toBe(true);
  });

  it('una pista a la mitad de tempo se mezcla contando el doble de pulsos', () => {
    const match = matchTempo(140, 70);

    expect(match.multiplier).toBe(2);
    expect(match.ratio).toBeCloseTo(1);
  });

  it('drum and bass a 174 con house a 87 se mezcla a medio tiempo', () => {
    const match = matchTempo(174, 87);

    expect(match.multiplier).toBe(2);
    expect(match.feasible).toBe(true);
  });

  it('tempos sin relacion no son factibles por ningun camino', () => {
    expect(matchTempo(128, 174).feasible).toBe(false);
  });

  it('elige la opcion que menos pitch pide', () => {
    const match = matchTempo(128, 66); // 66 * 2 = 132: pide -3 %

    expect(match.multiplier).toBe(2);
    expect(Math.abs(match.ratio - 1)).toBeCloseTo(Math.abs(128 / 132 - 1), 6);
  });

  it('rechaza un BPM que no sea positivo', () => {
    for (const [a, b] of [[0, 128], [128, 0], [-5, 128], [128, -1], [NaN, 128]]) {
      expect(() => matchTempo(a, b)).toThrow(RangeError);
    }
  });
});

describe('clampPitch', () => {
  it('deja pasar los valores dentro del rango', () => {
    expect(clampPitch(1)).toBe(1);
    expect(clampPitch(1.05)).toBe(1.05);
  });

  it('limita al maximo y al minimo del fader', () => {
    expect(clampPitch(1.5)).toBeCloseTo(1 + MAX_PITCH_ADJUSTMENT);
    expect(clampPitch(0.5)).toBeCloseTo(1 - MAX_PITCH_ADJUSTMENT);
  });
});
