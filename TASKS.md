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
- [x] feat(autodj): botón «Mezclar ahora» con cuenta atrás, que además enseña al motor cuándo mezclar [4.7]
- [x] feat(library): mostrar el estado del análisis de voz de cada pista [4.8]
- [x] feat(autodj): alinear la entrada de la pista siguiente al compás de la que suena [4.9] (medido con música real, no escuchado)

## Fase 5 — Calidad

- [x] chore(style): sistema de estilos y diseño responsive [5.1]
- [x] feat(midi): controlar el mezclador con el aparato MIDI, con asignación por aprendizaje [5.5]
- [x] test(e2e): pruebas end-to-end del flujo principal [5.2]
- [x] chore(ci): pipeline de GitHub Actions con build y tests [5.3]
- [x] chore(docker): Dockerfile en dos etapas con nginx [5.4] (escrito pero sin probar: no hay Docker en la máquina de desarrollo)
- [x] feat(auth): pantalla de login, token en cada petición al API, guard de rutas, cerrar sesión y ticket para el stream en vivo [5.6] (solo si el API tiene la autenticación encendida; se probó con el API simulado, no con Spring real)

## Fase 6 — Pendiente

- [x] feat(autodj): alinear también cuando el motor mezcla a la mitad o al doble de tempo (x0.5 / x2) [6.1]
- [x] feat(deck): que el botón Sync de los decks alinee también la fase, no solo el tempo [6.2]
- [ ] feat(deck): time-stretch para igualar tempos con más de un 8 % de diferencia [6.3]
- [ ] feat(autodj): alinear por frases de 8 y 16 compases [6.4]
- [ ] feat(autodj): más tipos de transición y usar la intro de la pista entrante [6.5]
- [ ] feat(deck): key lock (master tempo) para que cambiar el pitch no cambie el tono [6.6]
- [x] feat(midi): distinguir el canal MIDI para que dos decks con el mismo CC no choquen [6.7]
- [x] feat(library): refrescar la lista sola mientras se analiza la voz, y avisar de las pistas sin audio para volver a subirlas [6.8]
- [x] chore(ci): ejecutar los tests e2e de Playwright en la CI [6.9]
- [x] feat(deck): botón «Marcar el 1» para fijar a mano el primer tiempo de una pista (usa el endpoint nuevo del motor) [6.11]
- [ ] test(audio): escuchar y afinar a oído el EQ y las transiciones, y probar con servicios reales [6.10]

## Fase 8 — Aprender el estilo de un DJ profesional (en curso)

- [x] feat(learning): modo aprendizaje que graba las mezclas hechas a mano (detector de transiciones, servicio y panel) [8.4]
- [x] feat(learning): pantalla para revisar las grabaciones (buenas / descartar / notas), con copia de seguridad [8.5]
- [ ] feat(learning): género de cada pista [8.6]

## Fase 7 — Despliegue en el navegador (pendiente)

Encontrado al probar el sistema completo en un navegador real (2026-10-22); nada de esto se ha hecho todavía.

- [x] chore(config): hacer configurable la URL del API: hoy se fija al compilar (`src/environments/environment.ts` apunta a `http://localhost:8080`), así que con otro dominio hay que cambiarla y reconstruir. Lo más simple es usar rutas relativas (`/api/v1`) con un proxy en el mismo origen, o leer la configuración al arrancar [7.1]
- [x] chore(nginx): si nginx hace de proxy del API: sin búfer para el stream en vivo (`proxy_buffering off` y un `proxy_read_timeout` largo, o el stream se corta o llega a golpes), `client_max_body_size` de 55 MB o más para subir audio, y cabeceras de seguridad (HSTS, CSP, X-Frame-Options) [7.2]
- [ ] chore(security): servir todo por HTTPS (el token y la contraseña viajan en cada petición) y definir una CSP estricta; no cargar scripts de terceros, porque el token vive en `sessionStorage` [7.3]
- [ ] test(deploy): construir y probar la imagen Docker (nunca se construyó) y el flujo completo con login detrás de HTTPS [7.4]

## Fase 9 — Nube gratuita sin tarjeta (en curso)

Arquitectura acordada con el usuario (2026-10-24): este frontend en Cloudflare Pages, el API y el motor de IA en Render (gratis, se duermen y su disco se borra), base de datos en Neon y audios en Supabase Storage. Nada de esto se ha probado contra las plataformas reales.

- [x] feat(config): la URL del API se puede definir en tiempo de ejecucion con `config.js` (`window.__SOUNDIA__.apiUrl`), para servir el frontend aparte del API [9.1]
- [x] chore(deploy): script de build para Cloudflare Pages (`index.html`, `_redirects`, `config.js` con `SOUNDIA_API_URL`) y cabeceras de seguridad [9.2]

## Fase 10 — Aprender desde la nube con el repertorio del DJ (en curso)

Acordado con el usuario (2026-10-24): el DJ usa la versión de la nube, por sesiones (sube las pistas de la sesión, mezcla con el modo aprendizaje y borra las pistas al terminar; las grabaciones se conservan). El almacenamiento gratuito de Supabase es de 1 GB.

- [x] feat(library): botón para borrar una pista y su audio, con confirmación [10.1]
- [x] feat(library): subir varias pistas de una vez, en cola y de una en una, con avance y resumen de errores [10.2]

## Fase 11 — Interfaz pensada para DJ (en curso)

Acordado con el usuario (2026-10-24, con la skill ui-ux-pro-max): tema oscuro para cabina, deck A en cian y deck B en magenta, Play en verde, mejoras en tres PRs.

- [x] feat(ui): base visual: paleta oscura de contraste comprobado, colores de deck, cifras tabulares, estilos de las clases que no tenían ninguno (pistas compatibles, avisos, chapa Camelot) [11.1]
- [x] feat(ui): consola de DJ: deck A y B con su color, faders verticales, Play grande, BPM y tonalidad destacados, forma de onda más alta [11.2]
- [x] feat(ui): biblioteca con buscador, orden por BPM y tonalidad y filtro de compatibles; el controlador MIDI en un bloque plegable (la consola no queda fija: ocuparía casi toda la pantalla de un portátil) [11.3]
- [x] feat(ui): aviso de que los servidores pueden estar despertando cuando una petición al API tarda más de 8 s [11.4]
- [x] feat(library): género de cada pista, editable en la biblioteca, con sugerencias, búsqueda y orden por género [8.6]
- [x] fix(learning): las mezclas grabadas no se pierden si el servidor está dormido o reiniciándose: quedan pendientes (también en el navegador), se reintentan solas y se avisa antes de cerrar la página [11.5]
- [x] feat(ui): mantener despiertos los servidores mientras se usa la app (consulta cada 4 min, con tope de inactividad de 2 h) e indicador «Servidores listos» en el menú [11.6]
- [x] feat(ui): para la sesión en vivo: confirmación al cerrar o recargar con música sonando, panel de Aprendizaje justo bajo los decks y guía rápida plegable de cinco pasos [11.8]
