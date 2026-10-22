# TASKS — SoundIA Web DJ (Angular)

Plan de mejoras del frontend. Cada task es un commit; el mensaje del commit es el texto de la task con su sufijo `[x.y]`.
Al terminarla se marca `[x]` en ese mismo commit.

## Fase 1 — Estabilizar lo existente

- [x] fix(dashboard): eliminar el import de worker_threads que rompe el build del navegador [1.1]
- [x] fix(dashboard): mostrar el estado de la decisión (status) en la plantilla [1.2]
- [x] fix(dashboard): corregir el nombre DashboradComponent a DashboardComponent [1.3]
- [x] test(dashboard): corregir dashboard.spec.ts para que compile y pase [1.4]
- [x] test(app): corregir app.spec.ts, que espera un h1 inexistente [1.5]
- [x] refactor(telemetry): quitar import sin uso y tipar los logs con una interfaz DjSessionLog [1.6]
- [x] refactor(dashboard): migrar *ngIf y *ngFor a @if y @for, y usar signals [1.7]
- [x] refactor(config): mover la URL del API a environment [1.8]
- [x] fix(ssr): desactivar el prerender del dashboard, que depende de datos en vivo [1.9]
- [x] feat(dashboard): estados de carga y error al llamar al API [1.10]
- [x] test(telemetry): corregir telemetry.spec.ts y probar TelemetryService con HttpTestingController [1.11]

## Fase 2 — Tiempo real

- [x] feat(telemetry): servicio que consuma el stream SSE de Spring [2.1]
- [x] feat(dashboard): historial y decisiones de la IA actualizados en vivo [2.2]

## Fase 3 — MIDI real

- [x] feat(midi): servicio con Web MIDI API para detectar controladores [3.1]
- [x] feat(midi): enviar los eventos del controlador a /api/v1/midi/event [3.2]
- [x] feat(midi): indicador de conexión y selector de dispositivo [3.3]

## Fase 4 — Interfaz de DJ

- [x] feat(decks): componente de deck con reproducción usando Web Audio API [4.1]
- [x] feat(decks): visualización de forma de onda [4.2]
- [x] feat(mixer): crossfader y controles de EQ [4.3]
- [x] feat(library): lista de pistas con BPM y tonalidad [4.4]
- [x] feat(autodj): modo auto-DJ con cola y transiciones propuestas por la IA [4.5]
- [x] feat(autodj): valorar cada mezcla del Auto-DJ (me gustó / no me gustó) y ver lo que la IA ha aprendido [4.6]

## Fase 5 — Calidad

- [x] chore(style): sistema de estilos y diseño responsive [5.1]
- [x] feat(midi): controlar el mezclador con el aparato MIDI, con asignación por aprendizaje [5.5]
- [x] test(e2e): pruebas end-to-end del flujo principal [5.2]
- [x] chore(ci): pipeline de GitHub Actions con build y tests [5.3]
- [x] chore(docker): Dockerfile en dos etapas con nginx [5.4] (escrito pero sin probar: no hay Docker en la máquina de desarrollo)
