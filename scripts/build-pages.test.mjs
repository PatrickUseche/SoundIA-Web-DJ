import assert from 'node:assert/strict';
import { test } from 'node:test';
import { generarArchivos, validarApiUrl } from './build-pages.mjs';

test('acepta una URL https y quita la barra final', () => {
  assert.equal(validarApiUrl('https://soundia-api.onrender.com/api/v1/'), 'https://soundia-api.onrender.com/api/v1');
});

test('rechaza una URL vacia o ausente', () => {
  assert.throws(() => validarApiUrl(undefined), /SOUNDIA_API_URL/);
  assert.throws(() => validarApiUrl(''), /SOUNDIA_API_URL/);
  assert.throws(() => validarApiUrl('no-es-una-url'), /SOUNDIA_API_URL/);
});

test('rechaza http salvo en localhost', () => {
  assert.throws(() => validarApiUrl('http://soundia-api.onrender.com/api/v1'), /https/);
  assert.equal(validarApiUrl('http://localhost:8080/api/v1'), 'http://localhost:8080/api/v1');
});

test('config.js define la URL del API', () => {
  const { 'config.js': config } = generarArchivos('https://api.example.com/api/v1');
  assert.equal(config, 'window.__SOUNDIA__ = { apiUrl: "https://api.example.com/api/v1" };\n');
});

test('_redirects devuelve las rutas de la SPA a index.html', () => {
  assert.equal(generarArchivos('https://api.example.com/api/v1')['_redirects'], '/* /index.html 200\n');
});

test('la CSP solo abre connect-src al origen del API', () => {
  const { _headers } = generarArchivos('https://api.example.com/api/v1');
  assert.match(_headers, /connect-src 'self' https:\/\/api\.example\.com;/);
  assert.match(_headers, /script-src 'self';/);
  assert.doesNotMatch(_headers, /api\/v1;/);
});
