import { expect, test } from '@playwright/test';
import { CREDENCIALES, simularApi } from './api-falso';

test.describe('con el API exigiendo iniciar sesion', () => {
  test.beforeEach(async ({ page }) => {
    await simularApi(page, { conLogin: true });
  });

  test('una pantalla protegida lleva al login y, tras entrar, vuelve a ella', async ({ page }) => {
    await page.goto('/dj');

    await expect(page).toHaveURL(/\/login\?returnUrl=%2Fdj$/);
    await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible();

    await page.getByLabel('Usuario').fill(CREDENCIALES.username);
    await page.getByLabel('Contraseña').fill(CREDENCIALES.password);
    await page.getByRole('button', { name: 'Entrar' }).click();

    await expect(page).toHaveURL(/\/dj$/);
    await expect(page.getByRole('heading', { name: 'SoundIA DJ' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Cerrar sesión' })).toBeVisible();
  });

  test('con una contrasena incorrecta se queda en el login y lo avisa', async ({ page }) => {
    await page.goto('/login');

    await page.getByLabel('Usuario').fill(CREDENCIALES.username);
    await page.getByLabel('Contraseña').fill('otra-clave');
    await page.getByRole('button', { name: 'Entrar' }).click();

    await expect(page.getByRole('alert')).toContainText('Usuario o contraseña incorrectos');
    await expect(page).toHaveURL(/\/login$/);
  });

  test('la sesion sobrevive a recargar la pagina y cerrar sesion vuelve al login', async ({ page }) => {
    await page.goto('/login?returnUrl=%2Fdashboard');
    await page.getByLabel('Usuario').fill(CREDENCIALES.username);
    await page.getByLabel('Contraseña').fill(CREDENCIALES.password);
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page.getByRole('heading', { name: 'Panel de Telemetría DJ AI' })).toBeVisible();

    await page.reload();
    await expect(page.getByRole('heading', { name: 'Panel de Telemetría DJ AI' })).toBeVisible();

    await page.getByRole('button', { name: 'Cerrar sesión' }).click();
    await expect(page).toHaveURL(/\/login$/);

    await page.goto('/dj');
    await expect(page).toHaveURL(/\/login\?returnUrl=%2Fdj$/);
  });

  test('el historial del panel de telemetria carga con el token', async ({ page }) => {
    await page.goto('/login?returnUrl=%2Fdashboard');
    await page.getByLabel('Usuario').fill(CREDENCIALES.username);
    await page.getByLabel('Contraseña').fill(CREDENCIALES.password);
    await page.getByRole('button', { name: 'Entrar' }).click();

    await expect(page.getByText('CROSSFADE')).toBeVisible();
  });
});

test('si el API no exige iniciar sesion, /login lleva directo a la aplicacion', async ({ page }) => {
  await simularApi(page);

  await page.goto('/login');

  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole('button', { name: 'Cerrar sesión' })).toHaveCount(0);
});
