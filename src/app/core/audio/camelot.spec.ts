import { areCompatible, compatibleCodes, harmonicDistance } from './camelot';

const TODOS = Array.from({ length: 12 }, (_, i) => i + 1).flatMap((n) => [`${n}A`, `${n}B`]);

describe('compatibleCodes', () => {
  it('los compatibles de 8B son el mismo, los vecinos y la relativa', () => {
    expect(compatibleCodes('8B')).toEqual(['8B', '7B', '9B', '8A']);
  });

  it('la rueda es circular al pasar de 12 a 1', () => {
    expect(compatibleCodes('12A')).toEqual(['12A', '11A', '1A', '12B']);
    expect(compatibleCodes('1B')).toEqual(['1B', '12B', '2B', '1A']);
  });

  it('cada codigo tiene exactamente cuatro compatibles distintos', () => {
    for (const camelotCode of TODOS) {
      expect(new Set(compatibleCodes(camelotCode)).size).toBe(4);
    }
  });

  it('rechaza codigos invalidos', () => {
    for (const invalido of ['', '13A', '0B', '8C', 'AB', '8', '8a', '08A']) {
      expect(() => compatibleCodes(invalido)).toThrow(RangeError);
    }
  });
});

describe('areCompatible', () => {
  it('es simetrica para todos los codigos', () => {
    for (const a of TODOS) {
      for (const b of TODOS) {
        expect(areCompatible(a, b)).toBe(areCompatible(b, a));
      }
    }
  });

  it('dos pasos de distancia no son compatibles', () => {
    expect(areCompatible('8B', '10B')).toBe(false);
    expect(areCompatible('8B', '9A')).toBe(false);
  });

  it('el mismo codigo es compatible consigo mismo', () => {
    expect(areCompatible('5A', '5A')).toBe(true);
  });
});

describe('harmonicDistance', () => {
  it('mide los pasos en la rueda', () => {
    expect(harmonicDistance('8B', '8B')).toBe(0);
    expect(harmonicDistance('8B', '9B')).toBe(1);
    expect(harmonicDistance('8B', '8A')).toBe(1);
    expect(harmonicDistance('12A', '1A')).toBe(1);
    expect(harmonicDistance('1A', '7A')).toBe(6);
    expect(harmonicDistance('8B', '10A')).toBe(3);
  });

  it('coincide con la compatibilidad: distancia <= 1 con letra igual o numero igual', () => {
    expect(harmonicDistance('8B', '7B')).toBe(1);
    expect(harmonicDistance('8B', '9A')).toBe(2);
  });
});
