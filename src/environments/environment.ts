// Configuracion del entorno. Por defecto las rutas son relativas al mismo origen: en produccion nginx reenvia /api al
// API Gateway y en desarrollo lo hace el proxy de `ng serve` (proxy.conf.json), asi no hay que recompilar por dominio.
// Si el frontend se sirve aparte del API (por ejemplo en Cloudflare Pages), `config.js` (public/config.js, que se
// genera al desplegar con SOUNDIA_API_URL) define `window.__SOUNDIA__.apiUrl` con la URL completa del API.
const configurada = (globalThis as { __SOUNDIA__?: { apiUrl?: string } }).__SOUNDIA__?.apiUrl?.trim();
const apiUrl = configurada ? configurada.replace(/\/+$/, '') : '/api/v1';

export const environment = {
  // API Gateway (Spring Boot). El frontend nunca habla directamente con Django.
  apiRootUrl: apiUrl,
  // Telemetria MIDI (eventos, historial, stream en vivo).
  apiBaseUrl: `${apiUrl}/midi`,
};
