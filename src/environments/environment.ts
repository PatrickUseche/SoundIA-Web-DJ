// Configuracion del entorno. Cuando exista una URL de produccion, se puede agregar un
// environment.production.ts y un fileReplacements en angular.json.
export const environment = {
  // API Gateway (Spring Boot). El frontend nunca habla directamente con Django.
  apiRootUrl: 'http://localhost:8080/api/v1',
  // Telemetria MIDI (eventos, historial, stream en vivo).
  apiBaseUrl: 'http://localhost:8080/api/v1/midi',
};
