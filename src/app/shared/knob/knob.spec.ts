import { ComponentFixture, TestBed } from '@angular/core/testing';
import { KnobComponent } from './knob';

describe('KnobComponent', () => {
  let fixture: ComponentFixture<KnobComponent>;
  let cambios: number[];

  const el = () => fixture.nativeElement as HTMLElement;
  const entrada = () => el().querySelector('input[type="range"]') as HTMLInputElement;
  const dial = () => el().querySelector('.dial') as HTMLElement;
  const angulo = () => dial().style.getPropertyValue('--angulo');

  function crear(valor = 0.5, extra: Record<string, unknown> = {}) {
    TestBed.configureTestingModule({ imports: [KnobComponent] });
    fixture = TestBed.createComponent(KnobComponent);
    fixture.componentRef.setInput('etiqueta', 'Graves');
    fixture.componentRef.setInput('valor', valor);
    for (const [clave, v] of Object.entries(extra)) {
      fixture.componentRef.setInput(clave, v);
    }
    cambios = [];
    fixture.componentInstance.cambio.subscribe((v: number) => cambios.push(v));
    fixture.detectChanges();
  }

  const puntero = (tipo: string, clientY: number, extra: MouseEventInit = {}) =>
    dial().dispatchEvent(new MouseEvent(tipo, { clientY, bubbles: true, ...extra }));

  describe('accesibilidad y teclado', () => {
    it('es un control deslizante nativo con el nombre de la perilla, el rango y el valor', () => {
      crear(0.3, { min: 0, max: 1, paso: 0.05 });

      expect(entrada().getAttribute('aria-label')).toBe('Graves');
      expect([entrada().min, entrada().max, entrada().step]).toEqual(['0', '1', '0.05']);
      expect(entrada().value).toBe('0.3');
    });

    it('muestra el nombre como etiqueta visible', () => {
      crear();

      expect(el().querySelector('.etiqueta')?.textContent).toContain('Graves');
    });

    it('el dibujo de la perilla se oculta a los lectores de pantalla (el control es el slider)', () => {
      crear();

      expect(dial().getAttribute('aria-hidden')).toBe('true');
    });

    it('al mover el control nativo (teclado o lector de pantalla) avisa del nuevo valor como numero', () => {
      crear();

      entrada().value = '0.8';
      entrada().dispatchEvent(new Event('input'));

      expect(cambios).toEqual([0.8]);
    });
  });

  describe('giro de la perilla', () => {
    it('el minimo apunta a -135 grados, el centro a 0 y el maximo a +135', () => {
      crear(0);
      expect(angulo()).toBe('-135deg');

      fixture.componentRef.setInput('valor', 0.5);
      fixture.detectChanges();
      expect(angulo()).toBe('0deg');

      fixture.componentRef.setInput('valor', 1);
      fixture.detectChanges();
      expect(angulo()).toBe('135deg');
    });

    it('respeta un rango distinto de 0 a 1', () => {
      crear(50, { min: 0, max: 100, paso: 1 });

      expect(angulo()).toBe('0deg');
    });

    it('un valor fuera del rango no gira mas alla de los topes', () => {
      crear(9);

      expect(angulo()).toBe('135deg');
    });
  });

  describe('arrastre con el raton o el dedo', () => {
    it('arrastrar hacia arriba sube el valor y hacia abajo lo baja', () => {
      crear(0.5);

      puntero('pointerdown', 200);
      puntero('pointermove', 160); // 40 px arriba: un cuarto del recorrido (160 px = todo el rango)
      puntero('pointermove', 216); // 16 px abajo del inicio

      expect(cambios[0]).toBeCloseTo(0.75);
      expect(cambios[1]).toBeCloseTo(0.4);
    });

    it('no pasa de los topes del rango', () => {
      crear(0.9);

      puntero('pointerdown', 300);
      puntero('pointermove', 0);
      puntero('pointermove', 900);

      expect(cambios).toEqual([1, 0]);
    });

    it('con Mayus el movimiento es fino (cuatro veces menos)', () => {
      crear(0.5);

      puntero('pointerdown', 200);
      puntero('pointermove', 160, { shiftKey: true });

      expect(cambios[0]).toBeCloseTo(0.5625);
    });

    it('el valor sale ajustado al paso del control', () => {
      crear(0.5, { paso: 0.1 });

      puntero('pointerdown', 200);
      puntero('pointermove', 187); // +0.08125 -> 0.58125 -> 0.6

      expect(cambios[0]).toBeCloseTo(0.6);
    });

    it('sin haber pulsado antes, mover el puntero encima no cambia nada', () => {
      crear();

      puntero('pointermove', 100);

      expect(cambios).toEqual([]);
    });

    it('al soltar deja de seguir al puntero', () => {
      crear();

      puntero('pointerdown', 200);
      puntero('pointerup', 200);
      puntero('pointermove', 100);

      expect(cambios).toEqual([]);
    });

    it('si el sistema cancela el gesto tambien deja de seguirlo', () => {
      crear();

      puntero('pointerdown', 200);
      puntero('pointercancel', 200);
      puntero('pointermove', 100);

      expect(cambios).toEqual([]);
    });

    it('marca la perilla como activa solo mientras se arrastra', () => {
      crear();
      expect(el().querySelector('.knob')?.getAttribute('data-activa')).toBe('false');

      puntero('pointerdown', 200);
      fixture.detectChanges();
      expect(el().querySelector('.knob')?.getAttribute('data-activa')).toBe('true');

      puntero('pointerup', 200);
      fixture.detectChanges();
      expect(el().querySelector('.knob')?.getAttribute('data-activa')).toBe('false');
    });
  });

  describe('doble clic', () => {
    it('vuelve al valor de reposo (el centro por defecto)', () => {
      crear(0.9);

      dial().dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));

      expect(cambios).toEqual([0.5]);
    });

    it('usa el reposo que se le indique (el volumen maestro, por ejemplo, vuelve al maximo)', () => {
      crear(0.2, { reposo: 1 });

      dial().dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));

      expect(cambios).toEqual([1]);
    });
  });
});
