import { expect, test } from '@playwright/test';
import { simularApi } from './api-falso';

test.beforeEach(async ({ page }) => {
  await simularApi(page);
});

test('la navegación principal lleva a la pantalla de DJ y a la telemetría', async ({ page }) => {
  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { name: 'Panel de Telemetría DJ AI' })).toBeVisible();

  await page.getByRole('link', { name: 'DJ' }).click();
  await expect(page).toHaveURL(/\/dj$/);
  await expect(page.getByRole('heading', { name: 'SoundIA DJ' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'DJ' })).toHaveAttribute('aria-current', 'page');
});

test('si el API tarda en responder (servidores dormidos) avisa y lo quita al llegar la respuesta', async ({ page }) => {
  // Un servidor que se esta despertando: la lista de pistas tarda mas que el limite del aviso (8 s).
  await page.route('**/api/v1/tracks', async (route) => {
    await new Promise((resolver) => setTimeout(resolver, 9500));
    await route.fallback();
  });
  await page.goto('/dj');

  const aviso = page.getByText('Esto esta tardando mas de lo normal');
  await expect(aviso).toBeVisible({ timeout: 12_000 });
  await page.screenshot({ path: process.env['CAPTURA_AVISO'] ?? 'test-results/aviso.png' });
  await expect(page.getByRole('table', { name: 'Pistas analizadas' })).toBeVisible({ timeout: 12_000 });
  await expect(aviso).toBeHidden();
});

test('la pantalla de grabaciones lista las mezclas y permite marcarlas como buenas', async ({ page }) => {
  await page.goto('/dj');
  await page.getByRole('link', { name: 'Grabaciones' }).click();
  await expect(page).toHaveURL(/\/grabaciones$/);

  const tabla = page.getByRole('table', { name: 'Mezclas grabadas' });
  await expect(tabla.getByRole('row')).toHaveCount(3); // cabecera + 2 grabaciones
  await expect(tabla.getByText('Noche de verano → Amanecer')).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'Total: 2' })).toBeVisible();

  await page.getByRole('group', { name: 'Revision de la mezcla 1' }).getByRole('button', { name: 'Buena' }).click();
  await expect(page.getByRole('group', { name: 'Revision de la mezcla 1' }).getByRole('button', { name: 'Buena' }))
    .toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('status').filter({ hasText: 'Buenas: 2' })).toBeVisible();
});

test('se pueden subir varias pistas de una vez y aparecen en la biblioteca', async ({ page }) => {
  await page.goto('/dj');
  const tabla = page.getByRole('table', { name: 'Pistas analizadas' });
  await expect(tabla.getByRole('row')).toHaveCount(4); // cabecera + 3 pistas

  await page.getByLabel('Archivo de audio').setInputFiles([
    { name: 'cumbia-uno.mp3', mimeType: 'audio/mpeg', buffer: Buffer.from('uno') },
    { name: 'cumbia-dos.mp3', mimeType: 'audio/mpeg', buffer: Buffer.from('dos') },
  ]);

  await expect(page.getByText('2 pistas analizadas.')).toBeVisible();
  await expect(tabla.getByRole('row')).toHaveCount(6);
  await expect(tabla.getByText('cumbia-uno.mp3')).toBeVisible();
  await expect(tabla.getByText('cumbia-dos.mp3')).toBeVisible();
});

test('la biblioteca lista las pistas y marca las que no tienen audio', async ({ page }) => {
  await page.goto('/dj');

  const tabla = page.getByRole('table', { name: 'Pistas analizadas' });
  await expect(tabla.getByRole('row')).toHaveCount(4); // cabecera + 3 pistas
  await expect(tabla.getByText('Noche de verano')).toBeVisible();
  await expect(tabla.getByText('sin audio')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Agregar Pista antigua a la cola' })).toBeDisabled();
});

test('al pulsar Play el audio arranca de verdad: el reloj del deck avanza con las reglas normales de autoplay', async ({ page }) => {
  // Sin opciones que salten la politica de autoplay: el audio solo puede sonar si Play reanuda el contexto de audio
  // dentro del clic. Si no lo hiciera, el boton diria "Pausa" pero el reloj se quedaria en 0:00.
  await page.goto('/dj');
  await page.getByRole('row', { name: /Noche de verano/ }).getByRole('button', { name: 'Deck A' }).click();
  const deck = page.getByRole('region', { name: 'Deck A' });
  await expect(deck.getByText('Noche de verano')).toBeVisible();
  await expect(deck.locator('.reloj')).toHaveText(/^0:00 \/ 0:02/);

  await deck.getByRole('button', { name: 'Play' }).click();

  await expect(deck.locator('.reloj')).not.toHaveText(/^0:00 \//, { timeout: 5000 });
});

test('una pista de la biblioteca se carga en el deck A y se puede reproducir', async ({ page }) => {
  await page.goto('/dj');

  const fila = page.getByRole('row', { name: /Noche de verano/ });
  await fila.getByRole('button', { name: 'Deck A' }).click();

  const deck = page.getByRole('region', { name: 'Deck A' });
  await expect(deck.getByText('Noche de verano')).toBeVisible();

  const play = deck.getByRole('button', { name: 'Play' });
  await expect(play).toBeEnabled();
  await play.click();
  await expect(deck.getByRole('button', { name: 'Pausa' })).toHaveAttribute('aria-pressed', 'true');

  await deck.getByRole('button', { name: 'Expulsar' }).click();
  await expect(deck.getByText('Deck vacio')).toBeVisible();
});

test('el mezclador permite centrar el crossfader', async ({ page }) => {
  await page.goto('/dj');

  const crossfader = page.getByRole('slider', { name: 'Crossfader' });
  await crossfader.fill('1');
  await expect(crossfader).toHaveValue('1');

  await page.getByRole('button', { name: 'Centrar' }).click();
  await expect(crossfader).toHaveValue('0.5');
});

test('el panel de telemetría muestra el historial del API', async ({ page }) => {
  await page.goto('/dashboard');

  await expect(page.getByText('CROSSFADE')).toBeVisible();
  await expect(page.getByText('Sin decision de la IA').first()).toBeVisible();
});

test('la pantalla de DJ no desborda horizontalmente', async ({ page }) => {
  await page.goto('/dj');
  await expect(page.getByRole('heading', { name: 'SoundIA DJ' })).toBeVisible();

  const desborda = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(desborda).toBe(false);
});
