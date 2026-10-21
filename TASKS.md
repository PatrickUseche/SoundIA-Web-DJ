# TASKS — SoundIA Web DJ (Angular)

Plan de mejoras del frontend. Cada task es un commit; el mensaje del commit es el texto de la task con su sufijo `[x.y]`.
Al terminarla se marca `[x]` en ese mismo commit.

## Fase 1 — Estabilizar lo existente

- [ ] fix(dashboard): eliminar el import de worker_threads que rompe el build del navegador [1.1]
- [ ] fix(dashboard): mostrar el estado de la decisión (status) en la plantilla [1.2]
- [ ] fix(dashboard): corregir el nombre DashboradComponent a DashboardComponent [1.3]
- [ ] test(dashboard): corregir dashboard.spec.ts para que compile y pase [1.4]
- [ ] test(app): corregir app.spec.ts, que espera un h1 inexistente [1.5]
- [ ] refactor(telemetry): quitar import sin uso y tipar los logs con una interfaz DjSessionLog [1.6]
- [ ] refactor(dashboard): migrar *ngIf y *ngFor a @if y @for, y usar signals [1.7]
- [ ] refactor(config): mover la URL del API a environment [1.8]
- [ ] fix(ssr): desactivar el prerender del dashboard, que depende de datos en vivo [1.9]
- [ ] feat(dashboard): estados de carga y error al llamar al API [1.10]

## Fase 2 — Tiempo real

- [ ] feat(telemetry): servicio que consuma el stream SSE o WebSocket de Spring [2.1]
- [ ] feat(dashboard): historial y decisiones de la IA actualizados en vivo [2.2]

## Fase 3 — MIDI real

- [ ] feat(midi): servicio con Web MIDI API para detectar controladores [3.1]
- [ ] feat(midi): enviar los eventos del controlador a /api/v1/midi/event [3.2]
- [ ] feat(midi): indicador de conexión y selector de dispositivo [3.3]

## Fase 4 — Interfaz de DJ

- [ ] feat(decks): componente de deck con reproducción usando Web Audio API [4.1]
- [ ] feat(decks): visualización de forma de onda [4.2]
- [ ] feat(mixer): crossfader y controles de EQ [4.3]
- [ ] feat(library): lista de pistas con BPM y tonalidad [4.4]
- [ ] feat(autodj): modo auto-DJ con cola y transiciones propuestas por la IA [4.5]

## Fase 5 — Calidad

- [ ] chore(style): sistema de estilos y diseño responsive [5.1]
- [ ] test(e2e): pruebas end-to-end del flujo principal [5.2]
- [ ] chore(ci): pipeline de GitHub Actions con build y tests [5.3]
