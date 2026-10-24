import { expect, test } from '@playwright/test';
import { simularApi } from './api-falso';

test.beforeEach(async ({ page }) => {
  await simularApi(page);
});

test('la navegación principal lleva a la pantalla de DJ y a la telemetría', async ({ page }) => {
  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { name: 'Panel de Telemetria DJ AI' })).toBeVisible();

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

test('la biblioteca lista las pistas y marca las que no tienen audio', async ({ page }) => {
  await page.goto('/dj');

  const tabla = page.getByRole('table', { name: 'Pistas analizadas' });
  await expect(tabla.getByRole('row')).toHaveCount(4); // cabecera + 3 pistas
  await expect(tabla.getByText('Noche de verano')).toBeVisible();
  await expect(tabla.getByText('sin audio')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Agregar Pista antigua a la cola' })).toBeDisabled();
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
