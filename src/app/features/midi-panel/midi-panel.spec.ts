import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { MidiPanelComponent } from './midi-panel';
import { MidiService } from '../../core/services/midi';
import { MidiBridgeService } from '../../core/services/midi-bridge';
import { FakeMidiAccess, FakeMidiInput, provideFakeMidi } from '../../core/testing/fake-midi';
import { environment } from '../../../environments/environment';

describe('MidiPanelComponent', () => {
  let fixture: ComponentFixture<MidiPanelComponent>;
  let http: HttpTestingController;

  function configurar(access: FakeMidiAccess | null, error?: Error) {
    TestBed.configureTestingModule({
      imports: [MidiPanelComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideFakeMidi(access, error)],
    });
    fixture = TestBed.createComponent(MidiPanelComponent);
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  }

  const el = () => fixture.nativeElement as HTMLElement;
  const texto = () => el().textContent ?? '';
  const boton = (contiene: string) =>
    Array.from(el().querySelectorAll('button')).find((b) => b.textContent?.includes(contiene));

  async function conectar() {
    boton('Conectar')!.click();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  afterEach(() => TestBed.inject(MidiBridgeService).stop());

  it('avisa si el navegador no soporta Web MIDI', () => {
    configurar(null);

    expect(texto()).toContain('no soporta Web MIDI');
    expect(boton('Conectar')).toBeUndefined();
  });

  it('ofrece conectar el controlador antes de pedir permiso', () => {
    configurar(new FakeMidiAccess());

    expect(boton('Conectar controlador MIDI')).toBeDefined();
  });

  it('indica cuando no hay controladores conectados', async () => {
    configurar(new FakeMidiAccess());

    await conectar();

    expect(texto()).toContain('No hay controladores conectados');
  });

  it('muestra un error con opcion de reintentar si el permiso se niega', async () => {
    configurar(null, new DOMException('no', 'SecurityError'));

    await conectar();

    expect(el().querySelector('[role="alert"]')?.textContent).toContain('Se denego el acceso');
    expect(boton('Reintentar')).toBeDefined();
  });

  it('muestra un error generico ante un fallo inesperado', async () => {
    configurar(null, new Error('raro'));

    await conectar();

    expect(el().querySelector('[role="alert"]')?.textContent).toContain('No se pudo acceder a MIDI');
  });

  it('lista los controladores y selecciona el unico disponible', async () => {
    configurar(new FakeMidiAccess([new FakeMidiInput('a', 'DDJ-400')]));

    await conectar();

    const select = el().querySelector('select') as HTMLSelectElement;
    expect(select.options.length).toBe(2); // "Ninguno" + el controlador
    expect(select.options[1].textContent).toContain('DDJ-400');
    expect(TestBed.inject(MidiService).selectedInputId()).toBe('a');
  });

  it('elegir otro controlador en la lista lo selecciona en el servicio', async () => {
    configurar(new FakeMidiAccess([new FakeMidiInput('a', 'DDJ-400'), new FakeMidiInput('b', 'Launchpad')]));
    await conectar();
    const select = el().querySelector('select') as HTMLSelectElement;

    select.value = 'b';
    select.dispatchEvent(new Event('change'));

    expect(TestBed.inject(MidiService).selectedInputId()).toBe('b');
  });

  it('elegir Ninguno deja de escuchar', async () => {
    configurar(new FakeMidiAccess([new FakeMidiInput('a')]));
    await conectar();
    const select = el().querySelector('select') as HTMLSelectElement;

    select.value = '';
    select.dispatchEvent(new Event('change'));

    expect(TestBed.inject(MidiService).selectedInputId()).toBeNull();
  });

  it('el boton de envio esta deshabilitado sin controlador elegido', async () => {
    configurar(new FakeMidiAccess([new FakeMidiInput('a'), new FakeMidiInput('b')]));

    await conectar();

    expect(boton('Iniciar envio')!.disabled).toBe(true);
  });

  it('el envio empieza apagado y se alterna con el boton', async () => {
    configurar(new FakeMidiAccess([new FakeMidiInput('a')]));
    await conectar();
    const bridge = TestBed.inject(MidiBridgeService);
    expect(bridge.active()).toBe(false);

    boton('Iniciar envio')!.click();
    fixture.detectChanges();
    expect(bridge.active()).toBe(true);
    expect(boton('Detener envio')).toBeDefined();

    boton('Detener envio')!.click();
    fixture.detectChanges();
    expect(bridge.active()).toBe(false);
  });

  it('muestra los contadores de enviados y fallidos y permite reiniciarlos', async () => {
    const controlador = new FakeMidiInput('a');
    configurar(new FakeMidiAccess([controlador]));
    await conectar();
    // Los timers falsos se activan despues de conectar: whenStable() espera timers reales.
    vi.useFakeTimers();
    boton('Iniciar envio')!.click();

    controlador.send(0xb0, 14, 100);
    vi.advanceTimersByTime(50);
    http.expectOne(`${environment.apiBaseUrl}/event`).flush('ok');
    fixture.detectChanges();
    expect(texto()).toMatch(/Enviados:\s*1/);

    boton('Reiniciar')!.click();
    fixture.detectChanges();
    expect(texto()).toMatch(/Enviados:\s*0/);
    vi.useRealTimers();
  });
});
