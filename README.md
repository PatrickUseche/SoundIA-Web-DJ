# SoundIA — Web DJ (Angular)

Panel web de SoundIA, el DJ automatizado con IA. Muestra la telemetría de la consola DJ y las decisiones
de mezcla de la IA, en vivo.

```
Angular (:4200) ──► Spring Boot (:8080) ──► Django (:8000)
```

El frontend habla **solo** con el API Gateway (Spring Boot), nunca directamente con Django.

## Requisitos

- Node.js y npm
- El API Gateway corriendo en `http://localhost:8080` (ver `SoundIA-API-Core`)

## Comandos

```bash
npm install
npm start          # ng serve en http://localhost:4200
npm test           # pruebas unitarias (Vitest)
npm run build      # build de producción en dist/
npm run e2e        # pruebas end-to-end (Playwright)
```

### Pruebas end-to-end

Las pruebas de `e2e/` abren la aplicación en Chromium (escritorio y móvil) contra un API **simulado** dentro del propio navegador, así que no necesitan Spring ni Django. La primera vez hay que descargar el navegador: `npx playwright install chromium`. Playwright levanta `ng serve` en el puerto 4300 por su cuenta.

## Configuración

La URL del API está en `src/environments/environment.ts` (`apiBaseUrl`).

## Estructura

```
src/app/
├── core/
│   ├── audio/                         # Deck, EQ, crossfader, beatmatching, forma de onda, Camelot (Web Audio)
│   ├── midi/                          # parser de mensajes MIDI y controles asignables del mezclador
│   ├── models/                        # tipos: Track, mensajes SSE, Auto-DJ
│   ├── services/                      # HTTP (pistas, sesiones, Auto-DJ), mixer, MIDI, Auto-DJ, transiciones
│   └── testing/                       # dobles para pruebas (EventSource, MIDI y Web Audio falsos)
├── shared/waveform/                   # forma de onda en canvas
└── features/
    ├── dj-page/                       # pantalla /dj: consola + Auto-DJ + biblioteca
    ├── dj-console/  deck/             # los dos decks, crossfader y volumen maestro
    ├── library/                       # biblioteca de pistas y subida de archivos
    ├── autodj-panel/                  # Auto-DJ y cola de la sesión
    ├── midi-panel/                    # controlador MIDI
    ├── midi-mapping/                  # asignar controles del aparato al mezclador
    └── dashboard/                     # telemetría en vivo (/dashboard)
```

## Pantalla de DJ (`/dj`)

- **Biblioteca**: lista las pistas analizadas (BPM, tonalidad, código Camelot, energía). Se pueden cargar en el deck A o B
  (se descarga su audio del servidor), agregar a la cola, o subir un archivo nuevo para analizarlo. Resalta las pistas que
  mezclan bien armónicamente con las que ya están cargadas.
- **Decks**: reproducir/pausar, punto cue, pitch de ±8 %, volumen, EQ de tres bandas, forma de onda (clic para saltar) y
  **Sync** para igualar el tempo del otro deck y, si los dos suenan y tienen rejilla, poner sus pulsos en fase.
- **Mezclador**: crossfader de potencia constante (el volumen percibido no baja a mitad del fundido) y volumen maestro.
- **Auto-DJ**: mientras suena una pista prepara la siguiente en el otro deck (la primera de la cola de la sesión y, si no
  hay, la mejor recomendación de la IA con audio que no haya sonado) y, al llegar al punto de salida del plan, hace la
  transición moviendo crossfader y EQ (con intercambio de graves, para que nunca suenen los graves de las dos pistas a la vez).

- **Mezcla alineada a compás**: si las dos pistas tienen rejilla de pulsos (la calcula el motor al analizarlas) y sus
  tempos caben en el pitch fader, la entrante no arranca al instante: espera al próximo compás de la que suena y arranca
  justo en su propio primer tiempo, con el pitch calculado desde el tempo al que suena la saliente. El arranque se programa
  en el reloj de audio (no con un temporizador) a la hora exacta en que la saliente llega a su compás; el Auto-DJ lanza la
  transición ~1 s antes del punto de salida para poder hacerlo. Si no se sabe cuál es el primer tiempo de alguna de las
  pistas (`confidence < 0.2`) se alinea por pulsos, no por compases. Sin rejilla, o con tempos que no se igualan (fundido),
  arranca al momento como antes.
- **Valoración**: tras cada transición del Auto-DJ aparece «¿Te gustó la mezcla?». Cada respuesta se envía al motor, que
  ajusta cuánto pesan tempo, armonía y energía en sus recomendaciones. El panel muestra esos pesos y cuántas valoraciones
  lleva; con menos de 10 (o todas iguales) la IA sigue usando los de por defecto. Solo se pueden valorar las mezclas que hace
  el Auto-DJ, no las que haces a mano.

### Limitaciones conocidas

- **Todo el audio se probó con un Web Audio simulado**: la lógica (grafo, ganancias, posiciones, curvas) está probada, pero
  nadie lo ha **escuchado** en un navegador. Las frecuencias del EQ y la calidad de las transiciones son una primera
  aproximación sin afinar de oído.
- Cambiar el pitch cambia también el tono (no hay *key lock* / *master tempo*).
- **Alineación a compás: precisión medida, no escuchada.** Con música real (dos canciones distintas, simulando el arranque
  programado), los golpes de las dos pistas quedan a unos 9-15 ms de media (hasta ~25-40 ms en tramos con ritmo débil),
  frente a 150-230 ms al arrancar sin alinear. En el navegador, la hora programada coincide con el pulso de la saliente
  a 0,00 ms según la rejilla. El primer tiempo del compás es una heurística (en el reggaetón, con el bombo en todos los
  pulsos, no se puede saber). Cuando el motor mezcla a la mitad o al doble de tempo también se alinea: la entrante
  arranca en uno de sus pulsos sobre uno de la saliente; a la mitad de tempo sus pulsos caen sobre uno de cada dos de
  la saliente, y al doble cae uno sobre cada pulso y el otro justo en medio. El botón **Sync** de los decks iguala el
  tempo y, si los dos decks suenan y las dos pistas tienen rejilla, mueve la pista como mucho medio pulso para que sus
  golpes caigan sobre los del otro deck (fase de **pulso**, no de compás; no se mueve si el tempo no cabe en el pitch
  fader ni si el motor lo igualaría a la mitad o al doble). Mover la pista con el deck sonando puede oírse como un salto.
- Los temporizadores del Auto-DJ (500 ms) y de la transición (100 ms) se **ralentizan en pestañas en segundo plano**: para
  mezclar, la pestaña debe estar visible.
- Hay que reproducir algo manualmente antes de activar el Auto-DJ (el navegador exige un gesto del usuario para sonar).
- Las pistas analizadas antes de que el servidor guardara el audio aparecen como «sin audio»: hay que volver a subirlas.

## MIDI

`MidiService` usa la Web MIDI API (Chrome y Edge; en Firefox/Safari el panel avisa que no hay soporte) para
listar los controladores conectados, detectar si se enchufan o desenchufan con la página abierta y emitir sus
movimientos como `{controlId, value}` más el canal MIDI (0-15), que solo usa el navegador. `parseMidiMessage` define
la conversión:

| Mensaje MIDI | controlId | value |
|---|---|---|
| Control Change (faders, perillas) | número de CC | 0-127 |
| Note On (botones, pads) | 128 + número de nota | velocidad |
| Note Off, reloj, pitch bend, incompletos | se ignoran | — |

`MidiBridgeService` reenvía esos eventos a `POST /api/v1/midi/event` con un *throttle* por control (50 ms,
conserva siempre el último valor) y envío secuencial por control. El envío **empieza apagado**: se activa con el
botón del panel MIDI. Al API solo viaja `{controlId, value}`: el canal no se envía, así que para el motor de IA
el mismo CC de dos canales sigue siendo el mismo control.

### Controlar el mezclador con el aparato

`MidiMapperService` hace que el aparato maneje la pantalla: en la pantalla **DJ**, el panel «Asignar controles MIDI»
lista los 18 controles (crossfader, volumen maestro y, por deck, volumen, pitch, EQ de 3 bandas, play, cue y sync).
Se pulsa **Asignar** en uno y se mueve el fader, la perilla o el botón del aparato: queda asignado y se guarda en
`localStorage` (clave `soundia.midi-mapping`). Faders y perillas usan el valor 0-127; el pitch recorre ±8 % con el
centro exacto en 1; los botones actúan al pulsarse, no al soltarse. Un control del aparato solo controla una cosa.
La asignación **distingue el canal MIDI**: el mismo CC en canales distintos (por ejemplo el volumen de cada deck)
se asigna a controles distintos, y el panel lo muestra como «Canal 2 · CC 7». Las asignaciones guardadas antes de
distinguir el canal siguen funcionando para cualquier canal y se muestran como «CC 7 (cualquier canal)»; si hay
una del canal exacto, gana sobre la de cualquier canal. Limitación: **solo se probó con un controlador simulado**
(no con un aparato real), así que los CC/notas/canales de cada marca no están verificados.

## Tiempo real

`TelemetryStreamService` abre `GET /api/v1/midi/stream` (Server-Sent Events) mientras haya un suscriptor y
expone el estado de la conexión como signal (`connecting`, `open`, `reconnecting`, `closed`). El dashboard:

- agrega cada evento `midi` y `decision` a un feed en vivo (los 20 más recientes);
- inserta cada `decision` en el historial (máximo 50, sin duplicados);
- al reconectar tras un corte, recarga el historial para recuperar lo perdido.

`EventSource` se crea mediante el token `EVENT_SOURCE_FACTORY`, así las pruebas usan un falso
(`provideFakeEventSource()`). En el servidor (SSR) el servicio no abre ninguna conexión.
