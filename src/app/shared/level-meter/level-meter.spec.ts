import { ComponentFixture, TestBed } from '@angular/core/testing';
import { LevelMeterComponent } from './level-meter';

describe('LevelMeterComponent', () => {
  let fixture: ComponentFixture<LevelMeterComponent>;

  const el = () => fixture.nativeElement as HTMLElement;
  const meterTimer = () => el().querySelector('[role="meter"]') as HTMLElement;
  const segments = () => Array.from(el().querySelectorAll('.segmento')) as HTMLElement[];
  const litCount = () => segments().filter((s) => s.classList.contains('encendido'));

  function crear(meterLevel: number, extra: Record<string, unknown> = {}) {
    TestBed.configureTestingModule({ imports: [LevelMeterComponent] });
    fixture = TestBed.createComponent(LevelMeterComponent);
    fixture.componentRef.setInput('labelText', 'Nivel del canal A');
    fixture.componentRef.setInput('meterLevel', meterLevel);
    for (const [clave, v] of Object.entries(extra)) {
      fixture.componentRef.setInput(clave, v);
    }
    fixture.detectChanges();
  }

  it('es un medidor accesible con nombre y valor en porcentaje', () => {
    crear(0.5);

    expect(meterTimer().getAttribute('aria-label')).toBe('Nivel del canal A');
    expect(meterTimer().getAttribute('aria-valuemin')).toBe('0');
    expect(meterTimer().getAttribute('aria-valuemax')).toBe('100');
    expect(meterTimer().getAttribute('aria-valuenow')).toBe('50');
  });

  it('dibuja 12 segmentos por defecto y se puede cambiar', () => {
    crear(0);
    expect(segments().length).toBe(12);

    fixture.componentRef.setInput('segments', 8);
    fixture.detectChanges();
    expect(segments().length).toBe(8);
  });

  it('en silencio no enciende ninguno', () => {
    crear(0);

    expect(litCount().length).toBe(0);
  });

  it('al maximo los enciende todos', () => {
    crear(1);

    expect(litCount().length).toBe(12);
  });

  it('enciende desde abajo: la mitad del nivel son los 6 primeros', () => {
    crear(0.5);

    expect(litCount().length).toBe(6);
    expect(segments().slice(0, 6).every((s) => s.classList.contains('encendido'))).toBe(true);
  });

  it('los segmentos se colorean en verde, ambar y rojo de abajo hacia arriba', () => {
    crear(1, { segments: 10 });

    const zonas = segments().map((s) => s.getAttribute('data-zona'));

    expect(zonas.slice(0, 7)).toEqual(Array(7).fill('verde'));
    expect(zonas.slice(7, 9)).toEqual(['ambar', 'ambar']);
    expect(zonas[9]).toBe('rojo');
  });

  it('un nivel fuera de 0-1 se limita y el valor accesible no se sale de 0-100', () => {
    crear(7);
    expect(meterTimer().getAttribute('aria-valuenow')).toBe('100');
    expect(litCount().length).toBe(12);

    fixture.componentRef.setInput('meterLevel', -2);
    fixture.detectChanges();
    expect(meterTimer().getAttribute('aria-valuenow')).toBe('0');
  });

  it('los segmentos son decorativos para los lectores de pantalla', () => {
    crear(0.5);

    expect(segments().every((s) => s.getAttribute('aria-hidden') === 'true')).toBe(true);
  });
});
