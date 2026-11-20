import { expect, test } from '@playwright/test';
import { crearWav, simularApi } from './api-falso';

/**
 * El API gratuito de Render se reinicia a veces en medio de una tanda de subidas. Antes, las canciones que quedaban en
 * la cola se marcaban todas como fallidas («No se pudo conectar con el servidor»); ahora la cola espera y reintenta.
 */

test('si el API se cae en la segunda canción, la cola espera, reintenta y sube las tres', async ({ page }) => {
  await simularApi(page);
  let intentosDeDos = 0;
  // Esta ruta se registra después, así que tiene prioridad: la segunda canción falla una vez con un 503.
  await page.route('**/api/v1/tracks/analyze', async (route) => {
    const cuerpo = route.request().postData() ?? '';
    if (cuerpo.includes('dos.wav') && intentosDeDos++ === 0) {
      return route.fulfill({
        status: 503, headers: { 'access-control-allow-origin': '*' }, body: 'Service Unavailable',
      });
    }
    return route.fallback();
  });
  await page.goto('/dj');
  await page.getByRole('table', { name: 'Pistas analizadas' }).waitFor();

  const wav = crearWav(1);
  await page.getByLabel('Archivo de audio').setInputFiles([
    { name: 'uno.wav', mimeType: 'audio/wav', buffer: wav },
    { name: 'dos.wav', mimeType: 'audio/wav', buffer: wav },
    { name: 'tres.wav', mimeType: 'audio/wav', buffer: wav },
  ]);

  const espera = page.locator('.subida-espera');
  await expect(espera).toBeVisible({ timeout: 10_000 });
  await expect(espera).toContainText('El servidor no responde');
  await expect(espera).toContainText('dos.wav');
  await expect(espera).toContainText('intento 1 de 6');

  // La primera espera es de 5 s.
  await expect(page.locator('.subida-ok')).toContainText('3 pistas analizadas.', { timeout: 20_000 });
  await expect(page.locator('.subida-error')).toHaveCount(0);
  await expect(espera).toHaveCount(0);
  expect(intentosDeDos).toBe(2);
  for (const nombre of ['uno.wav', 'dos.wav', 'tres.wav']) {
    await expect(page.getByRole('table', { name: 'Pistas analizadas' }).getByText(nombre)).toBeVisible();
  }
});

test('un archivo que el servidor rechaza (422) no se reintenta ni detiene a los demás', async ({ page }) => {
  await simularApi(page);
  let intentosDeSilencio = 0;
  await page.route('**/api/v1/tracks/analyze', async (route) => {
    if ((route.request().postData() ?? '').includes('silencio.wav')) {
      intentosDeSilencio++;
      return route.fulfill({
        status: 422, headers: { 'access-control-allow-origin': '*' }, json: { error: 'El audio es silencio; no hay nada que analizar.' },
      });
    }
    return route.fallback();
  });
  await page.goto('/dj');
  await page.getByRole('table', { name: 'Pistas analizadas' }).waitFor();

  const wav = crearWav(1);
  await page.getByLabel('Archivo de audio').setInputFiles([
    { name: 'silencio.wav', mimeType: 'audio/wav', buffer: wav },
    { name: 'bien.wav', mimeType: 'audio/wav', buffer: wav },
  ]);

  await expect(page.locator('.subida-ok')).toContainText('1 de 2 pistas analizadas.', { timeout: 15_000 });
  await expect(page.locator('.subida-errores')).toContainText('silencio.wav: El audio es silencio');
  await expect(page.locator('.subida-espera')).toHaveCount(0);
  expect(intentosDeSilencio).toBe(1);
});
