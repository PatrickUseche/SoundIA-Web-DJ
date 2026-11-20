import { TestBed } from '@angular/core/testing';
import { QUICK_GUIDE_KEY, QUICK_GUIDE_STORAGE, QuickGuideComponent } from './quick-guide';

describe('QuickGuideComponent', () => {
  let almacen: Record<string, string>;

  function crear(storage: unknown = null) {
    TestBed.configureTestingModule({
      imports: [QuickGuideComponent],
      providers: [
        {
          provide: QUICK_GUIDE_STORAGE,
          useValue: storage ?? {
            getItem: (k: string) => almacen[k] ?? null,
            setItem: (k: string, v: string) => { almacen[k] = v; },
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(QuickGuideComponent);
    fixture.detectChanges();
    const detalles = (fixture.nativeElement as HTMLElement).querySelector('details') as HTMLDetailsElement;
    return { fixture, detalles, el: fixture.nativeElement as HTMLElement };
  }

  /** jsdom no dispara `toggle` solo: se abre o cierra el bloque y se emite el evento a mano. */
  const toggleState = (detalles: HTMLDetailsElement, abierto: boolean) => {
    detalles.open = abierto;
    detalles.dispatchEvent(new Event('toggle'));
  };

  beforeEach(() => {
    almacen = {};
  });

  it('la primera vez se muestra abierta', () => {
    const { detalles } = crear();

    expect(detalles.open).toBe(true);
  });

  it('explica los cinco pasos y el aviso de los servidores', () => {
    const { el } = crear();

    expect(el.querySelectorAll('li').length).toBe(5);
    expect(el.textContent).toContain('Sube tus canciones');
    expect(el.textContent).toContain('Grabar mis mezclas');
    expect(el.textContent).toContain('espera, no recargues');
  });

  it('al cerrarla se recuerda', () => {
    const { detalles } = crear();

    toggleState(detalles, false);

    expect(almacen[QUICK_GUIDE_KEY]).toBe('1');
  });

  it('despues de cerrarla aparece plegada en la siguiente visita', () => {
    almacen[QUICK_GUIDE_KEY] = '1';

    const { detalles } = crear();

    expect(detalles.open).toBe(false);
  });

  it('abrirla de nuevo a mano no cambia lo recordado', () => {
    almacen[QUICK_GUIDE_KEY] = '1';
    const { detalles } = crear();

    toggleState(detalles, true);

    expect(almacen[QUICK_GUIDE_KEY]).toBe('1');
  });

  it('sin almacenamiento disponible funciona y se muestra abierta', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [QuickGuideComponent],
      providers: [{ provide: QUICK_GUIDE_STORAGE, useValue: null }],
    });
    const fixture = TestBed.createComponent(QuickGuideComponent);
    fixture.detectChanges();
    const detalles = (fixture.nativeElement as HTMLElement).querySelector('details') as HTMLDetailsElement;

    expect(detalles.open).toBe(true);
    expect(() => toggleState(detalles, false)).not.toThrow();
  });

  it('si el almacenamiento falla al leer o guardar no rompe', () => {
    const roto = {
      getItem: () => { throw new Error('bloqueado'); },
      setItem: () => { throw new Error('bloqueado'); },
    };
    const { detalles } = crear(roto);

    expect(detalles.open).toBe(true);
    expect(() => toggleState(detalles, false)).not.toThrow();
  });
});
