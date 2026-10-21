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
```

## Configuración

La URL del API está en `src/environments/environment.ts` (`apiBaseUrl`).

## Estructura

```
src/app/
├── core/
│   ├── models/stream-messages.ts      # tipos de los mensajes SSE
│   ├── services/telemetry.ts          # llamadas HTTP al API (historial, predicción)
│   ├── services/telemetry-stream.ts   # conexión en vivo (EventSource) y su estado
│   └── testing/fake-event-source.ts   # EventSource falso para pruebas
└── features/dashboard/                # panel principal
```

## MIDI

`MidiService` usa la Web MIDI API (Chrome y Edge; en Firefox/Safari el panel avisa que no hay soporte) para
listar los controladores conectados, detectar si se enchufan o desenchufan con la página abierta y emitir sus
movimientos como `{controlId, value}`. `parseMidiMessage` define la conversión:

| Mensaje MIDI | controlId | value |
|---|---|---|
| Control Change (faders, perillas) | número de CC | 0-127 |
| Note On (botones, pads) | 128 + número de nota | velocidad |
| Note Off, reloj, pitch bend, incompletos | se ignoran | — |

`MidiBridgeService` reenvía esos eventos a `POST /api/v1/midi/event` con un *throttle* por control (50 ms,
conserva siempre el último valor) y envío secuencial por control. El envío **empieza apagado**: se activa con el
botón del panel MIDI. Limitación conocida: el canal MIDI se ignora, así que dos decks que usen el mismo CC en
canales distintos llegan como el mismo control.

## Tiempo real

`TelemetryStreamService` abre `GET /api/v1/midi/stream` (Server-Sent Events) mientras haya un suscriptor y
expone el estado de la conexión como signal (`connecting`, `open`, `reconnecting`, `closed`). El dashboard:

- agrega cada evento `midi` y `decision` a un feed en vivo (los 20 más recientes);
- inserta cada `decision` en el historial (máximo 50, sin duplicados);
- al reconectar tras un corte, recarga el historial para recuperar lo perdido.

`EventSource` se crea mediante el token `EVENT_SOURCE_FACTORY`, así las pruebas usan un falso
(`provideFakeEventSource()`). En el servidor (SSR) el servicio no abre ninguna conexión.
