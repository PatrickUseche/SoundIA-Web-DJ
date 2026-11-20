import { ComponentFixture, TestBed } from '@angular/core/testing';
import { LevelMeterComponent } from './level-meter';

describe('LevelMeterComponent', () => {
  let fixture: ComponentFixture<LevelMeterComponent>;

  const el = () => fixture.nativeElement as HTMLElement;
  const medidor = () => el().querySelector('[role="meter"]') as HTMLElement;
  const segmentos = () => Array.from(el().querySelectorAll('.segmento')) as HTMLElement[];
  const encendidos = () => segmentos().filter((s) => s.classList.contains('encendido'));

  function crear(nivel: number, extra: Record<string, unknown> = {}) {
    TestBed.configureTestingModule({ imports: [LevelMeterComponent] });
    fixture = TestBed.createComponent(LevelMeterComponent);
    fixture.componentRef.setInput('etiqueta', 'Nivel del canal A');
    fixture.componentRef.setInput('nivel', nivel);
    for (const [clave, v] of Object.entries(extra)) {
      fixture.componentRef.setInput(clave, v);
    }
    fixture.detectChanges();
  }

  it('es un medidor accesible con nombre y valor en porcentaje', () => {
    crear(0.5);

    expect(medidor().getAttribute('aria-label')).toBe('Nivel del canal A');
    expect(medidor().getAttribute('aria-valuemin')).toBe('0');
    expect(medidor().getAttribute('aria-valuemax')).toBe('100');
    expect(medidor().getAttribute('aria-valuenow')).toBe('50');
  });

  it('dibuja 12 segmentos por defecto y se puede cambiar', () => {
    crear(0);
    expect(segmentos().length).toBe(12);

    fixture.componentRef.setInput('segmentos', 8);
    fixture.detectChanges();
    expect(segmentos().length).toBe(8);
  });

  it('en silencio no enciende ninguno', () => {
    crear(0);

    expect(encendidos().length).toBe(0);
  });

  it('al maximo los enciende todos', () => {
    crear(1);

    expect(encendidos().length).toBe(12);
  });

  it('enciende desde abajo: la mitad del nivel son los 6 primeros', () => {
    crear(0.5);

    expect(encendidos().length).toBe(6);
    expect(segmentos().slice(0, 6).every((s) => s.classList.contains('encendido'))).toBe(true);
  });

  it('los segmentos se colorean en verde, ambar y rojo de abajo hacia arriba', () => {
    crear(1, { segmentos: 10 });

    const zonas = segmentos().map((s) => s.getAttribute('data-zona'));

    expect(zonas.slice(0, 7)).toEqual(Array(7).fill('verde'));
    expect(zonas.slice(7, 9)).toEqual(['ambar', 'ambar']);
    expect(zonas[9]).toBe('rojo');
  });

  it('un nivel fuera de 0-1 se limita y el valor accesible no se sale de 0-100', () => {
    crear(7);
    expect(medidor().getAttribute('aria-valuenow')).toBe('100');
    expect(encendidos().length).toBe(12);

    fixture.componentRef.setInput('nivel', -2);
    fixture.detectChanges();
    expect(medidor().getAttribute('aria-valuenow')).toBe('0');
  });

  it('los segmentos son decorativos para los lectores de pantalla', () => {
    crear(0.5);

    expect(segmentos().every((s) => s.getAttribute('aria-hidden') === 'true')).toBe(true);
  });
});
