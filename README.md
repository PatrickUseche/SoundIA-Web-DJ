# SoundIA — Web DJ (Angular)

Panel web de SoundIA, el DJ automatizado con IA. Muestra la telemetría de la consola DJ y las decisiones
de mezcla de la IA, en vivo.

```
Angular (:4200) ──► Spring Boot (:8080) ──► Django (:8000)
```

El frontend habla **solo** con el API Gateway (Spring Boot), nunca directamente con Django.

## Requisitos

- Node.js y npm
- El API Gateway corriendo en `http://localhost:8080` (ver `SoundIA-API-Core`). El front llama a `/api/v1` en su propio origen: en desarrollo `ng serve` lo reenvía a ese puerto con `proxy.conf.json`, y en producción lo hace nginx (`nginx.conf`, al servicio `api` del compose)

## Comandos

```bash
npm install
npm start          # ng serve en http://localhost:4200
npm test           # pruebas unitarias (Vitest)
npm run build      # build de producción en dist/
npm run e2e        # pruebas end-to-end (Playwright)
npm run build:pages  # build para Cloudflare Pages (necesita SOUNDIA_API_URL)
```

### Frontend aparte del API (Cloudflare Pages)

Por defecto el front llama a `/api/v1` en su propio origen (nginx o el proxy de `ng serve` lo reenvían al API). Para
publicarlo aparte, por ejemplo en Cloudflare Pages, la URL del API se define al desplegar:

```bash
SOUNDIA_API_URL=https://soundia-api.onrender.com/api/v1 npm run build:pages
```

El script (`scripts/build-pages.mjs`) copia `index.csr.html` a `index.html`, crea `_redirects` (las rutas de la SPA),
`config.js` (la URL del API en tiempo de ejecución) y `_headers` (CSP abierta solo al origen del API). En Cloudflare Pages:
comando de build `npm ci && npm run build:pages`, carpeta de salida `dist/soundia-web-dj/browser` y la variable
`SOUNDIA_API_URL`. El API debe permitir ese dominio en `SOUNDIA_CORS_ALLOWED_ORIGINS`.

### Pruebas end-to-end

Las pruebas de `e2e/` abren la aplicación en Chromium (escritorio y móvil) contra un API **simulado** dentro del propio navegador, así que no necesitan Spring ni Django. La primera vez hay que descargar el navegador: `npx playwright install chromium`. Playwright levanta `ng serve` en el puerto 4300 por su cuenta. En GitHub Actions corren en un job aparte («Pruebas end-to-end (Playwright)») junto con las pruebas unitarias y el build; si fallan se guardan las trazas como artefacto (`trazas-e2e`).

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
    ├── login/                         # inicio de sesión (/login), solo si el API lo exige
    └── dashboard/                     # telemetría en vivo (/dashboard)
```

## Pantalla de DJ (`/dj`)

- **Pantalla de DJ** (`/dj`): guía rápida plegable arriba (abierta la primera vez), los dos decks, el panel de Aprendizaje justo
  debajo, la biblioteca, el Auto-DJ y el controlador MIDI plegado. Si hay música sonando, el navegador pide confirmación antes de
  recargar o cerrar la pestaña, para no cortar el set por error.
- **Modo aprendizaje**: si el servidor no responde al guardar una mezcla (dormido o reiniciándose en la nube gratuita), la mezcla
  **no se pierde**: queda pendiente, se guarda también en el navegador y se reintenta sola (5, 10, 20 y 30 s); el panel dice cuántas
  esperan y, si intentas cerrar la página con mezclas sin enviar, el navegador avisa.
- **Grabaciones** (`/grabaciones`): revisa las mezclas que grabó el modo aprendizaje. Para cada una muestra de qué pista a cuál
  fue, el género, los compases de solape, cómo movió el crossfader, el cambio de graves y el desfase de pulsos; se marca como
  *Buena*, *Descartar* o *Sin revisar* (solo las buenas deberían usarse para entrenar), con una nota opcional, y se puede filtrar
  por revisión y borrar. **Descargar copia** baja todas las grabaciones a un archivo JSON y **Restaurar una copia** las devuelve
  (sin duplicar las que ya están).
- **Servidores despiertos**: mientras la página esté abierta y alguien la use, cada 4 minutos se hace una consulta ligera a la lista
  de pistas (llega al API y al motor) para que el plan gratuito no los duerma; si nadie toca la página en 2 horas deja de hacerlo, para
  no gastar las horas mensuales gratuitas. En el menú, un indicador dice «Servidores listos» o «Sin respuesta del servidor».
- **Aviso de servidores dormidos**: si una petición al API tarda más de 8 s (en la nube gratuita los servidores se duermen y
  tardan hasta uno o dos minutos en despertar) aparece un aviso bajo el menú, y se quita solo cuando llega la respuesta.
- **Biblioteca**: lista las pistas analizadas (BPM, tonalidad, código Camelot, energía). Se pueden cargar en el deck A o B
  (se descarga su audio del servidor), agregar a la cola, o subir un archivo nuevo para analizarlo. Resalta las pistas que
  mezclan bien armónicamente con las que ya están cargadas. Se pueden elegir **varios archivos a la vez**: se analizan de uno en uno (el servidor gratuito tiene poca memoria), con el avance
  «pista 2 de 5», y un archivo que falla no detiene a los demás; al final se resume cuáles salieron bien y por qué fallaron los otros.
  Los de más de 50 MB ni se envían. Cada pista tiene un campo de **género** (merengue, bachata, salsa, despecho, discobar... con sugerencias; se puede escribir otro) que se
  guarda al salir del campo, y la búsqueda y el orden también lo usan: es contexto para aprender el estilo del DJ. Cada pista tiene un botón **Borrar** (pide confirmación) que
  elimina la pista y su audio: sirve para liberar espacio al terminar una sesión; las grabaciones de mezclas se conservan.
  Una pista cargada en un deck no se puede borrar.
- **Decks**: reproducir/pausar, punto cue, pitch de ±8 %, volumen, EQ de tres bandas, forma de onda (clic para saltar) y
  **Sync** para igualar el tempo del otro deck y, si los dos suenan y tienen rejilla, poner sus pulsos en fase. Cada deck
  indica cómo de fiable es el **primer tiempo** de la pista (detectado con su confianza, incierto o fijado a mano) y
  tiene el botón **Marcar el 1**: cuando la detección no se puede fiar (reggaetón), se escucha, se pausa o se busca
  con la forma de onda en un «1» y se pulsa; el motor ajusta ese instante al pulso más cercano y la pista queda con el
  primer tiempo fijado a mano (confianza 1), así el Auto-DJ y Sync pueden alinear por compases. No mueve los puntos de
  mezcla (cues) de la pista.
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
- **Aprendizaje** (panel «Aprendizaje», apagado por defecto): con «Grabar mis mezclas» encendido, cada mezcla que haces a
  mano entre dos pistas de la biblioteca se guarda en el motor de IA (`POST /recordings`) para aprender tu estilo: cuándo
  entra la siguiente, cuánto solapan, y cómo mueves el crossfader, el volumen y el EQ. El detector mira el mezclador 20
  veces por segundo y da por buena una mezcla cuando una pista sonaba sola, entró la otra y la primera acabó apagándose;
  si te arrepientes (la que entraba se apaga), cambias una de las pistas o se alarga más de 10 minutos, se descarta. No se
  graban las transiciones del Auto-DJ ni audio, solo números. Se guardan con el alias `dj`. El interruptor se recuerda al
  recargar la página.

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

Con el **inicio de sesión** encendido en el API (ver abajo), `EventSource` no puede enviar cabeceras, así que el
servicio pide un **ticket de 30 s** (`POST /api/v1/auth/stream-ticket`) y abre el stream con `?ticket=...`. Si la
conexión se corta, la cierra y, a los 3 s, pide un ticket nuevo y la reabre (la reconexión automática del navegador
reutilizaría el ticket vencido). Si el API responde 401 al pedir el ticket, no reintenta: la sesión ya no vale.

## Inicio de sesión

El API Gateway puede exigir login (viene apagado por defecto; ver su README). El front se adapta solo:

- `AuthService.status()` pregunta `GET /api/v1/auth/status` una vez. Si el API no exige login (o no responde), la
  aplicación funciona como siempre, sin pantalla de login ni botón de cerrar sesión.
- Si lo exige, el **guard** (`authGuard`) de `/dj` y `/dashboard` lleva a **`/login`** recordando a dónde ibas
  (`?returnUrl=`, solo rutas internas). Tras entrar vuelves ahí.
- El token se guarda en `sessionStorage` (se borra al cerrar la pestaña) y el **interceptor** lo envía como
  `Authorization: Bearer ...` a las peticiones al API (y solo a él). Un 401 del API cierra la sesión y lleva al
  login. El botón «Cerrar sesión» de la barra aparece solo con login exigido y sesión iniciada.
- El login responde 401 con un mensaje genérico y 429 (con cuánto esperar) tras demasiados intentos fallidos.

Limitación: un token en el navegador lo puede leer cualquier script de la página, así que no se deben cargar
scripts de terceros; los tokens caducan (8 h por defecto) y no se pueden revocar antes desde el front. Usa HTTPS en
producción. Las pruebas e2e simulan el API con login (`simularApi(page, { conLogin: true })`).
