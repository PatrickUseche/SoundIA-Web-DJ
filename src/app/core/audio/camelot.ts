/**
 * Rueda de Camelot: dos pistas se mezclan bien armonicamente si sus codigos son iguales, si difieren en
 * +-1 con la misma letra, o si tienen el mismo numero y distinta letra (tonalidad relativa).
 * Replica `audio/camelot.py` del motor de IA.
 */

const CODE_PATTERN = /^(1[0-2]|[1-9])([AB])$/;

function parse(code: string): { number: number; letter: 'A' | 'B' } {
  const match = CODE_PATTERN.exec(code);
  if (!match) {
    throw new RangeError(`Codigo Camelot invalido: ${JSON.stringify(code)}`);
  }
  return { number: Number(match[1]), letter: match[2] as 'A' | 'B' };
}

/** Codigos que mezclan bien con `code`, incluido el mismo, en orden estable. */
export function compatibleCodes(code: string): string[] {
  const { number, letter } = parse(code);
  const previous = ((number - 2 + 12) % 12) + 1;
  const following = (number % 12) + 1;
  const otherLetter = letter === 'A' ? 'B' : 'A';
  return [`${number}${letter}`, `${previous}${letter}`, `${following}${letter}`, `${number}${otherLetter}`];
}

export function areCompatible(codeA: string, codeB: string): boolean {
  return compatibleCodes(codeA).includes(codeB);
}

/** Pasos entre dos codigos en la rueda (0 = igual); cambiar de letra cuenta como un paso. */
export function harmonicDistance(codeA: string, codeB: string): number {
  const a = parse(codeA);
  const b = parse(codeB);
  const around = Math.abs(a.number - b.number);
  return Math.min(around, 12 - around) + (a.letter === b.letter ? 0 : 1);
}
