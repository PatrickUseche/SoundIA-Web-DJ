// Configuracion del entorno. Las rutas son relativas al mismo origen: en produccion nginx reenvia /api al API
// Gateway y en desarrollo lo hace el proxy de `ng serve` (proxy.conf.json), asi no hay que recompilar por dominio.
export const environment = {
  // API Gateway (Spring Boot). El frontend nunca habla directamente con Django.
  apiRootUrl: '/api/v1',
  // Telemetria MIDI (eventos, historial, stream en vivo).
  apiBaseUrl: '/api/v1/midi',
};
