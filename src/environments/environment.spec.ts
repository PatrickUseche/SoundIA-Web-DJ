import { afterEach, describe, expect, it, vi } from 'vitest';

type Global = { __SOUNDIA__?: { apiUrl?: string } };

/** El entorno se calcula al importar el modulo: cada caso lo carga de nuevo con la configuracion indicada. */
async function cargar(config?: { apiUrl?: string }) {
  (globalThis as Global).__SOUNDIA__ = config;
  vi.resetModules();
  return (await import('./environment')).environment;
}

describe('environment', () => {
  afterEach(() => {
    delete (globalThis as Global).__SOUNDIA__;
  });

  it('sin configuracion usa la ruta relativa /api/v1', async () => {
    const env = await cargar();

    expect(env.apiRootUrl).toBe('/api/v1');
    expect(env.apiBaseUrl).toBe('/api/v1/midi');
  });

  it('con apiUrl vacia usa la ruta relativa', async () => {
    expect((await cargar({ apiUrl: '  ' })).apiRootUrl).toBe('/api/v1');
  });

  it('con apiUrl configurada usa esa URL completa del API', async () => {
    const env = await cargar({ apiUrl: 'https://soundia-api.onrender.com/api/v1' });

    expect(env.apiRootUrl).toBe('https://soundia-api.onrender.com/api/v1');
    expect(env.apiBaseUrl).toBe('https://soundia-api.onrender.com/api/v1/midi');
  });

  it('quita las barras del final de la URL configurada', async () => {
    expect((await cargar({ apiUrl: 'https://api.example.com/api/v1//' })).apiRootUrl).toBe('https://api.example.com/api/v1');
  });
});
