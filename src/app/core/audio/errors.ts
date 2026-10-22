/** El navegador no pudo decodificar el archivo de audio (formato no soportado o archivo danado). */
export class AudioDecodeError extends Error {
  constructor(message = 'No se pudo decodificar el audio. Prueba con WAV, MP3, FLAC u OGG.') {
    super(message);
    this.name = 'AudioDecodeError';
  }
}

/** La pista de la biblioteca no tiene audio guardado en el servidor (se analizo antes de que se guardara). */
export class TrackWithoutAudioError extends Error {
  constructor(title: string) {
    super(`La pista "${title}" no tiene audio guardado. Vuelve a subirla para poder reproducirla.`);
    this.name = 'TrackWithoutAudioError';
  }
}

/** Este navegador no tiene Web Audio API. */
export class AudioUnsupportedError extends Error {
  constructor() {
    super('Este navegador no soporta Web Audio.');
    this.name = 'AudioUnsupportedError';
  }
}
