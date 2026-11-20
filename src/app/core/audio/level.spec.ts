import { METER_FLOOR_DB, litSegments, peakOf, peakToLevel, segmentZone } from './level';

describe('nivel de un medidor', () => {
  describe('peakToLevel', () => {
    it('el silencio da 0', () => {
      expect(peakToLevel(0)).toBe(0);
    });

    it('la amplitud maxima (0 dBFS) da 1', () => {
      expect(peakToLevel(1)).toBe(1);
    });

    it('lo que pasa de 0 dBFS no sube del tope', () => {
      expect(peakToLevel(2)).toBe(1);
    });

    it('por debajo del suelo del medidor da 0', () => {
      expect(peakToLevel(10 ** ((METER_FLOOR_DB - 10) / 20))).toBe(0);
    });

    it('es logaritmico: la mitad de la amplitud (-6 dB) queda cerca de 0.9', () => {
      expect(peakToLevel(0.5)).toBeCloseTo(0.9, 1);
    });

    it('crece con la amplitud', () => {
      expect(peakToLevel(0.01)).toBeLessThan(peakToLevel(0.1));
      expect(peakToLevel(0.1)).toBeLessThan(peakToLevel(0.9));
    });

    it('un valor invalido (NaN o negativo) da 0 y no rompe el medidor', () => {
      expect(peakToLevel(Number.NaN)).toBe(0);
      expect(peakToLevel(-1)).toBe(0);
    });
  });

  describe('peakOf', () => {
    it('toma el mayor valor absoluto, tambien de las muestras negativas', () => {
      expect(peakOf(Float32Array.of(0.1, -0.7, 0.3))).toBeCloseTo(0.7);
    });

    it('un bloque vacio o en silencio da 0', () => {
      expect(peakOf(new Float32Array(0))).toBe(0);
      expect(peakOf(new Float32Array(16))).toBe(0);
    });
  });

  describe('litSegments', () => {
    it('apagado con 0 y todo encendido con 1', () => {
      expect(litSegments(0, 12)).toBe(0);
      expect(litSegments(1, 12)).toBe(12);
    });

    it('redondea al segmento mas cercano', () => {
      expect(litSegments(0.5, 12)).toBe(6);
      expect(litSegments(0.49, 10)).toBe(5);
    });

    it('limita los valores fuera de 0-1', () => {
      expect(litSegments(-3, 12)).toBe(0);
      expect(litSegments(7, 12)).toBe(12);
    });
  });

  describe('segmentZone', () => {
    it('los de abajo son verdes, los medios ambar y el ultimo tramo rojo', () => {
      const zonas = Array.from({ length: 10 }, (_, i) => segmentZone(i, 10));

      expect(zonas.slice(0, 7)).toEqual(Array(7).fill('verde'));
      expect(zonas.slice(7, 9)).toEqual(['ambar', 'ambar']);
      expect(zonas[9]).toBe('rojo');
    });
  });
});
