import { formatBpm, formatPitch, formatTime } from './format';

describe('formatTime', () => {
  it('formatea minutos y segundos', () => {
    expect(formatTime(0)).toBe('0:00');
    expect(formatTime(9)).toBe('0:09');
    expect(formatTime(65)).toBe('1:05');
    expect(formatTime(600)).toBe('10:00');
  });

  it('descarta los decimales sin redondear hacia arriba', () => {
    expect(formatTime(125.9)).toBe('2:05');
  });

  it('los valores invalidos o negativos dan 0:00', () => {
    for (const invalido of [-1, NaN, Infinity]) {
      expect(formatTime(invalido)).toBe('0:00');
    }
  });
});

describe('formatBpm', () => {
  it('muestra un decimal', () => {
    expect(formatBpm(127.98)).toBe('128.0');
    expect(formatBpm(120)).toBe('120.0');
  });

  it('un valor invalido se muestra como guiones', () => {
    expect(formatBpm(NaN)).toBe('--');
  });
});

describe('formatPitch', () => {
  it('muestra el cambio de velocidad con signo', () => {
    expect(formatPitch(1.035)).toBe('+3.5%');
    expect(formatPitch(0.95)).toBe('-5.0%');
  });

  it('sin cambio muestra 0.0% sin signo', () => {
    expect(formatPitch(1)).toBe('0.0%');
  });

  it('un cambio despreciable se redondea a 0.0%', () => {
    expect(formatPitch(1.0001)).toBe('0.0%');
    expect(formatPitch(0.9999)).toBe('0.0%');
  });
});
