// Prepara el build de Angular para publicarlo en Cloudflare Pages (u otro hosting estatico) separado del API.
//   SOUNDIA_API_URL=https://soundia-api.onrender.com/api/v1 npm run build:pages
// Parte de `ng build` (dist/soundia-web-dj/browser) y le agrega lo que Pages necesita:
//   index.html     el build genera index.csr.html; Pages sirve index.html
//   _redirects     las rutas de la SPA (/dj, /login...) vuelven a index.html al recargar
//   config.js      la URL del API en tiempo de ejecucion (ver src/environments/environment.ts)
//   _headers       cabeceras de seguridad, con la CSP abierta solo al origen del API
import { copyFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export function validarApiUrl(valor) {
  let url;
  try {
    url = new URL(valor ?? '');
  } catch {
    throw new Error('Define SOUNDIA_API_URL con la URL completa del API, por ejemplo https://soundia-api.onrender.com/api/v1');
  }
  if (url.protocol !== 'https:' && url.hostname !== 'localhost') {
    throw new Error('SOUNDIA_API_URL debe empezar por https:// (el token viaja en cada peticion).');
  }
  return valor.trim().replace(/\/+$/, '');
}

export function generarArchivos(apiUrl) {
  const origen = new URL(apiUrl).origin;
  const csp = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "media-src 'self' blob:",
    `connect-src 'self' ${origen}`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "object-src 'none'",
  ].join('; ');

  return {
    'config.js': `window.__SOUNDIA__ = { apiUrl: ${JSON.stringify(apiUrl)} };\n`,
    '_redirects': '/* /index.html 200\n',
    '_headers': [
      '/*',
      '  X-Content-Type-Options: nosniff',
      '  X-Frame-Options: DENY',
      '  Referrer-Policy: no-referrer',
      `  Content-Security-Policy: ${csp}`,
      '',
      '/config.js',
      '  Cache-Control: no-cache',
      '',
      '/index.html',
      '  Cache-Control: no-cache',
      '',
    ].join('\n'),
  };
}

function main() {
  const apiUrl = validarApiUrl(process.env.SOUNDIA_API_URL);
  const salida = fileURLToPath(new URL('../dist/soundia-web-dj/browser/', import.meta.url));
  copyFileSync(join(salida, 'index.csr.html'), join(salida, 'index.html'));
  for (const [nombre, contenido] of Object.entries(generarArchivos(apiUrl))) {
    writeFileSync(join(salida, nombre), contenido);
  }
  console.log(`Listo para Cloudflare Pages en ${salida} (API: ${apiUrl})`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
