export interface CrossfaderGains {
  a: number;
  b: number;
}

/**
 * Ganancias de los dos decks para una posicion del crossfader (0 = solo A, 0.5 = centro, 1 = solo B).
 *
 * Curva de potencia constante: a^2 + b^2 = 1 en todo el recorrido, asi el volumen percibido no baja a
 * mitad del fundido (con una curva lineal, en el centro cada deck suena a -6 dB y la mezcla "se hunde").
 */
export function crossfaderGains(position: number): CrossfaderGains {
  const p = Math.min(1, Math.max(0, position));
  return { a: Math.cos((p * Math.PI) / 2), b: Math.sin((p * Math.PI) / 2) };
}
