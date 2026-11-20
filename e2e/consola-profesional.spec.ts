import { Locator, Page, expect, test } from '@playwright/test';
import { simularApi } from './api-falso';

/**
 * La consola con aspecto de mezcladora profesional, probada en Chromium de verdad (escritorio y movil Pixel 7): el
 * diseño, las perillas con raton y teclado, el plato, los medidores con audio real y la accesibilidad basica.
 */

const canal = (page: Page, id: 'A' | 'B') => page.getByRole('region', { name: `Canal ${id}` });
const deck = (page: Page, id: 'A' | 'B') => page.getByRole('region', { name: `Deck ${id}` });
const valorDe = async (control: Locator) => Number(await control.inputValue());

/** Carga una pista en cada deck desde la biblioteca. */
async function cargarLosDosDecks(page: Page) {
  await page.getByRole('table', { name: 'Pistas analizadas' }).waitFor();
  await page.getByRole('button', { name: /Deck A/ }).first().click();
  await page.getByRole('button', { name: /Deck B/ }).nth(1).click();
}

/** Arrastra una perilla en vertical (arriba = sube) con el raton. */
async function arrastrar(page: Page, perilla: Locator, pixeles: number) {
  const caja = (await perilla.boundingBox())!;
  const x = caja.x + caja.width / 2;
  const y = caja.y + caja.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y - pixeles, { steps: 6 });
  await page.mouse.up();
}

test.beforeEach(async ({ page }) => {
  await simularApi(page);
  await page.goto('/dj');
});

test.describe('estructura de la mezcladora', () => {
  test('tiene los dos decks, los dos canales, el maestro con su medidor y el crossfader', async ({ page }) => {
    await expect(deck(page, 'A')).toBeVisible();
    await expect(deck(page, 'B')).toBeVisible();
    await expect(canal(page, 'A')).toBeVisible();
    await expect(canal(page, 'B')).toBeVisible();
    await expect(page.getByRole('meter', { name: 'Nivel de salida' })).toBeVisible();
    await expect(page.getByRole('meter', { name: 'Nivel del canal A' })).toBeVisible();
    await expect(page.getByRole('meter', { name: 'Nivel del canal B' })).toBeVisible();
    await expect(page.getByRole('slider', { name: 'Crossfader' })).toBeVisible();
    await expect(page.getByRole('slider', { name: 'Volumen maestro' })).toBeAttached();
  });

  test('cada canal lleva el EQ de arriba abajo: agudos, medios y graves', async ({ page }) => {
    const nombres = await canal(page, 'A').locator('app-knob input').evaluateAll((entradas) =>
      entradas.map((entrada) => entrada.getAttribute('aria-label')),
    );

    expect(nombres).toEqual(['Agudos', 'Medios', 'Graves']);
    const posiciones = await canal(page, 'A').locator('app-knob .dial').evaluateAll((diales) =>
      diales.map((dial) => dial.getBoundingClientRect().top),
    );
    expect([...posiciones].sort((a, b) => a - b)).toEqual(posiciones);
  });

  test('el EQ y el volumen ya no estan dentro del deck', async ({ page }) => {
    await expect(deck(page, 'A').getByRole('slider', { name: 'Graves' })).toHaveCount(0);
    await expect(deck(page, 'A').getByRole('slider', { name: 'Volumen del deck' })).toHaveCount(0);
    await expect(deck(page, 'A').getByRole('slider', { name: 'Pitch' })).toBeVisible();
  });

  test('la pagina no se desplaza en horizontal', async ({ page }) => {
    await cargarLosDosDecks(page);

    const desborda = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);

    expect(desborda).toBe(false);
  });

  test('la mezcladora cabe en pantalla y nada de la consola se sale por la derecha', async ({ page }) => {
    const ancho = page.viewportSize()!.width;

    for (const caja of await page.locator('.consola app-deck, .consola .mezclador').evaluateAll((els) =>
      els.map((el) => el.getBoundingClientRect().toJSON() as { left: number; right: number }),
    )) {
      expect(caja.left).toBeGreaterThanOrEqual(0);
      expect(caja.right).toBeLessThanOrEqual(ancho + 1);
    }
  });
});

test.describe('distribucion en escritorio', () => {
  test.beforeEach(async ({ page }, info) => {
    test.skip(info.project.name !== 'escritorio', 'La distribucion en tres columnas es de pantalla ancha');
    await page.setViewportSize({ width: 1440, height: 900 });
  });

  test('deck A a la izquierda, mezcladora en el centro y deck B a la derecha', async ({ page }) => {
    const a = (await deck(page, 'A').boundingBox())!;
    const mezclador = (await page.getByRole('region', { name: 'Mezclador' }).boundingBox())!;
    const b = (await deck(page, 'B').boundingBox())!;

    expect(a.x + a.width).toBeLessThanOrEqual(mezclador.x + 1);
    expect(mezclador.x + mezclador.width).toBeLessThanOrEqual(b.x + 1);
    // Los tres arrancan a la misma altura.
    expect(Math.abs(a.y - mezclador.y)).toBeLessThan(12);
    expect(Math.abs(b.y - mezclador.y)).toBeLessThan(12);
  });

  test('los canales A y B quedan lado a lado con el maestro en medio, y el crossfader debajo de todo', async ({ page }) => {
    const a = (await canal(page, 'A').boundingBox())!;
    const b = (await canal(page, 'B').boundingBox())!;
    const maestro = (await page.locator('.maestro').boundingBox())!;
    const crossfader = (await page.getByRole('slider', { name: 'Crossfader' }).boundingBox())!;

    expect(a.x + a.width).toBeLessThanOrEqual(maestro.x + 1);
    expect(maestro.x + maestro.width).toBeLessThanOrEqual(b.x + 1);
    expect(crossfader.y).toBeGreaterThan(a.y + a.height);
    expect(crossfader.y).toBeGreaterThan(b.y + b.height);
  });

  test('los decks son tan altos como la mezcladora (se ve un solo equipo)', async ({ page }) => {
    const a = (await deck(page, 'A').boundingBox())!;
    const mezclador = (await page.getByRole('region', { name: 'Mezclador' }).boundingBox())!;

    expect(Math.abs(a.height - mezclador.height)).toBeLessThan(24);
  });

  test('guarda una captura de la consola con los dos decks sonando', async ({ page }, info) => {
    await cargarLosDosDecks(page);
    await deck(page, 'A').getByRole('button', { name: 'Play' }).click();
    await deck(page, 'B').getByRole('button', { name: 'Play' }).click();
    await page.waitForTimeout(500);

    await info.attach('consola-escritorio', { body: await page.locator('.consola').screenshot(), contentType: 'image/png' });
  });
});

test.describe('distribucion en movil', () => {
  test.beforeEach(async ({}, info) => {
    test.skip(info.project.name !== 'movil', 'Solo en el proyecto movil (Pixel 7)');
  });

  test('la mezcladora pasa arriba y los decks se apilan', async ({ page }, info) => {
    const mezclador = (await page.getByRole('region', { name: 'Mezclador' }).boundingBox())!;
    const a = (await deck(page, 'A').boundingBox())!;
    const b = (await deck(page, 'B').boundingBox())!;

    expect(mezclador.y).toBeLessThan(a.y);
    expect(a.y).toBeLessThan(b.y);
    await info.attach('consola-movil', { body: await page.screenshot({ fullPage: false }), contentType: 'image/png' });
  });
});

test.describe('perillas', () => {
  const agudosA = (page: Page) => canal(page, 'A').getByRole('slider', { name: 'Agudos' });
  const dialAgudosA = (page: Page) => canal(page, 'A').locator('app-knob').first().locator('.dial');

  test('arrastrar la perilla hacia arriba sube el valor y hacia abajo lo baja', async ({ page }) => {
    expect(await valorDe(agudosA(page))).toBe(0.5);

    await arrastrar(page, dialAgudosA(page), 40);
    const arriba = await valorDe(agudosA(page));
    await arrastrar(page, dialAgudosA(page), -80);
    const abajo = await valorDe(agudosA(page));

    expect(arriba).toBeGreaterThan(0.5);
    expect(abajo).toBeLessThan(arriba);
  });

  test('la perilla no pasa de sus topes aunque se arrastre mucho', async ({ page }) => {
    await arrastrar(page, dialAgudosA(page), 600);
    expect(await valorDe(agudosA(page))).toBe(1);

    await arrastrar(page, dialAgudosA(page), -1200);
    expect(await valorDe(agudosA(page))).toBe(0);
  });

  test('girar una perilla de un canal no mueve las del otro', async ({ page }) => {
    await arrastrar(page, dialAgudosA(page), 60);

    expect(await valorDe(canal(page, 'B').getByRole('slider', { name: 'Agudos' }))).toBe(0.5);
    expect(await valorDe(canal(page, 'A').getByRole('slider', { name: 'Medios' }))).toBe(0.5);
  });

  test('doble clic devuelve la perilla al centro', async ({ page }) => {
    await arrastrar(page, dialAgudosA(page), 60);
    expect(await valorDe(agudosA(page))).not.toBe(0.5);

    await dialAgudosA(page).dblclick();

    expect(await valorDe(agudosA(page))).toBe(0.5);
  });

  test('con el teclado las flechas mueven la perilla y Inicio / Fin van a los topes', async ({ page }) => {
    const medios = canal(page, 'A').getByRole('slider', { name: 'Medios' });
    await medios.focus();

    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ArrowUp');
    expect(await valorDe(medios)).toBeCloseTo(0.53, 2);

    await page.keyboard.press('Home');
    expect(await valorDe(medios)).toBe(0);
    await page.keyboard.press('End');
    expect(await valorDe(medios)).toBe(1);
  });

  test('al enfocar una perilla con el teclado se ve el anillo de foco', async ({ page }) => {
    await canal(page, 'A').getByRole('slider', { name: 'Graves' }).focus();
    await page.keyboard.press('ArrowDown');

    const contorno = await canal(page, 'A').locator('app-knob').nth(2).locator('.dial').evaluate((el) => getComputedStyle(el).outlineStyle);

    expect(contorno).not.toBe('none');
  });

  test('el volumen maestro es una perilla que vuelve al maximo con doble clic', async ({ page }) => {
    const maestro = page.getByRole('slider', { name: 'Volumen maestro' });
    const dial = page.locator('.maestro app-knob .dial');

    await arrastrar(page, dial, -70);
    expect(await valorDe(maestro)).toBeLessThan(1);

    await dial.dblclick();
    expect(await valorDe(maestro)).toBe(1);
  });

  test('las perillas son lo bastante grandes para tocarlas con el dedo (44 px)', async ({ page }) => {
    const caja = (await dialAgudosA(page).boundingBox())!;

    expect(caja.width).toBeGreaterThanOrEqual(44);
    expect(caja.height).toBeGreaterThanOrEqual(44);
  });
});

test.describe('faders y crossfader', () => {
  test('el fader de volumen del canal y el crossfader se mueven', async ({ page }) => {
    const volumen = canal(page, 'A').getByRole('slider', { name: 'Volumen del deck' });
    const crossfader = page.getByRole('slider', { name: 'Crossfader' });

    await volumen.fill('0.3');
    await crossfader.fill('0.9');

    expect(await valorDe(volumen)).toBeCloseTo(0.3);
    expect(await valorDe(crossfader)).toBeCloseTo(0.9);
    await page.getByRole('button', { name: 'Centrar' }).click();
    expect(await valorDe(crossfader)).toBe(0.5);
  });

  test('el pitch del deck se mueve y se muestra con signo', async ({ page }) => {
    await deck(page, 'A').getByRole('slider', { name: 'Pitch' }).fill('1.05');

    await expect(deck(page, 'A')).toContainText('+5.0%');
  });
});

test.describe('plato y medidores con audio de verdad', () => {
  test.beforeEach(async ({ page }) => {
    await cargarLosDosDecks(page);
  });

  test('el plato esta quieto y empieza a girar al dar Play', async ({ page }) => {
    const plato = deck(page, 'A').locator('.plato');
    await expect(plato).toHaveAttribute('data-sonando', 'false');
    expect(await plato.evaluate((el) => getComputedStyle(el).animationPlayState)).toBe('paused');

    await deck(page, 'A').getByRole('button', { name: 'Play' }).click();

    await expect(plato).toHaveAttribute('data-sonando', 'true');
    expect(await plato.evaluate((el) => getComputedStyle(el).animationPlayState)).toBe('running');
    await expect(deck(page, 'B').locator('.plato')).toHaveAttribute('data-sonando', 'false');
  });

  test('con movimiento reducido el plato no gira', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await deck(page, 'A').getByRole('button', { name: 'Play' }).click();

    const animacion = await deck(page, 'A').locator('.plato').evaluate((el) => getComputedStyle(el).animationName);

    expect(animacion).toBe('none');
  });

  test('el medidor del canal se enciende al sonar y el del otro canal sigue apagado', async ({ page }) => {
    const medidorA = page.getByRole('meter', { name: 'Nivel del canal A' });
    const medidorB = page.getByRole('meter', { name: 'Nivel del canal B' });
    expect(Number(await medidorA.getAttribute('aria-valuenow'))).toBe(0);

    await deck(page, 'A').getByRole('button', { name: 'Play' }).click();

    await expect.poll(async () => Number(await medidorA.getAttribute('aria-valuenow')), { timeout: 1800, intervals: [50] })
      .toBeGreaterThan(20);
    expect(Number(await medidorB.getAttribute('aria-valuenow'))).toBe(0);
  });

  test('el medidor de salida tambien se enciende y baja al callarse', async ({ page }) => {
    const salida = page.getByRole('meter', { name: 'Nivel de salida' });

    await deck(page, 'A').getByRole('button', { name: 'Play' }).click();
    await expect.poll(async () => Number(await salida.getAttribute('aria-valuenow')), { timeout: 1800, intervals: [50] })
      .toBeGreaterThan(20);

    await deck(page, 'A').getByRole('button', { name: 'Pausa' }).click();
    await expect.poll(async () => Number(await salida.getAttribute('aria-valuenow')), { timeout: 3000, intervals: [100] })
      .toBe(0);
  });

  test('con el fader del canal abajo el medidor del canal se apaga (se mide despues del fader)', async ({ page }) => {
    await canal(page, 'A').getByRole('slider', { name: 'Volumen del deck' }).fill('0');
    const medidorA = page.getByRole('meter', { name: 'Nivel del canal A' });

    await deck(page, 'A').getByRole('button', { name: 'Play' }).click();
    await page.waitForTimeout(600);

    expect(Number(await medidorA.getAttribute('aria-valuenow'))).toBe(0);
  });
});

test.describe('accesibilidad basica', () => {
  test('todos los controles deslizantes y botones de la consola tienen nombre', async ({ page }) => {
    const sinNombre = await page.locator('.consola input, .consola button').evaluateAll((els) =>
      els
        .filter((el) => !(el.getAttribute('aria-label') || el.textContent?.trim() || el.closest('label')?.textContent?.trim()))
        .map((el) => el.outerHTML.slice(0, 80)),
    );

    expect(sinNombre).toEqual([]);
  });

  test('el dibujo de las perillas, del plato y de los segmentos no estorba a los lectores de pantalla', async ({ page }) => {
    const sinOcultar = await page.locator('.consola .dial, .consola .plato, .consola .segmento').evaluateAll((els) =>
      els.filter((el) => el.getAttribute('aria-hidden') !== 'true').length,
    );

    expect(sinOcultar).toBe(0);
  });

  test('los botones principales miden al menos 44 px de alto', async ({ page }) => {
    for (const nombre of ['Play', 'Marcar cue']) {
      const caja = (await deck(page, 'A').getByRole('button', { name: nombre }).boundingBox())!;
      expect(caja.height).toBeGreaterThanOrEqual(36);
    }
    const play = (await deck(page, 'A').getByRole('button', { name: 'Play' }).boundingBox())!;
    expect(play.height).toBeGreaterThanOrEqual(44);
  });
});
