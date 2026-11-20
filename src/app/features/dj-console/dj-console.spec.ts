import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { DjConsoleComponent } from './dj-console';
import { MixerService } from '../../core/services/mixer';
import { FakeAudioContext, provideFakeAudio } from '../../core/testing/fake-audio';

describe('DjConsoleComponent', () => {
  let fixture: ComponentFixture<DjConsoleComponent>;
  let ctx: FakeAudioContext | null;
  let mixer: MixerService;

  const el = () => fixture.nativeElement as HTMLElement;
  const slider = (labelText: string) => el().querySelector(`input[aria-label="${labelText}"]`) as HTMLInputElement;

  // jsdom no implementa canvas: se evita el aviso en consola.
  beforeEach(() => vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null));
  afterEach(() => vi.restoreAllMocks());

  function crear(contexto: FakeAudioContext | null) {
    ctx = contexto;
    TestBed.configureTestingModule({
      imports: [DjConsoleComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideFakeAudio(contexto)],
    });
    mixer = TestBed.inject(MixerService);
    fixture = TestBed.createComponent(DjConsoleComponent);
    fixture.detectChanges();
  }

  const mover = (input: HTMLInputElement, rawValue: number) => {
    input.value = String(rawValue);
    input.dispatchEvent(new Event('input'));
  };

  describe('sin Web Audio', () => {
    it('avisa que el navegador no lo soporta y no muestra los decks', () => {
      crear(null);

      expect(el().querySelector('[role="alert"]')?.textContent).toContain('no soporta Web Audio');
      expect(el().querySelectorAll('app-deck').length).toBe(0);
    });
  });

  describe('con Web Audio', () => {
    beforeEach(() => crear(new FakeAudioContext()));

    it('muestra el deck A, el mezclador y el deck B', () => {
      const decks = el().querySelectorAll('app-deck');

      expect(decks.length).toBe(2);
      expect(el().textContent).toContain('Deck A');
      expect(el().textContent).toContain('Deck B');
      expect(el().textContent).toContain('Mezclador');
      expect(el().querySelector('[role="alert"]')).toBeNull();
    });

    it('el crossfader empieza en el centro', () => {
      expect(slider('Crossfader').value).toBe('0.5');
    });

    it('mover el crossfader cambia el mezclador', () => {
      mover(slider('Crossfader'), 0.9);

      expect(mixer.crossfader()).toBeCloseTo(0.9);
    });

    it('Centrar devuelve el crossfader al medio', () => {
      mixer.setCrossfader(1);
      fixture.detectChanges();

      (Array.from(el().querySelectorAll('button')).find((b) => b.textContent?.includes('Centrar')) as HTMLButtonElement).click();

      expect(mixer.crossfader()).toBe(0.5);
    });

    it('mover el volumen maestro cambia el mezclador', () => {
      mover(slider('Volumen maestro'), 0.25);

      expect(mixer.masterVolume()).toBeCloseTo(0.25);
    });

    describe('mezclador', () => {
      const mezclador = () => el().querySelector('section[aria-label="Mezclador"]') as HTMLElement;

      it('lleva el canal de cada deck: el EQ y el volumen estan en el centro, como en una mezcladora', () => {
        expect(mezclador().querySelectorAll('app-channel-strip').length).toBe(2);
        expect(mezclador().querySelector('section[aria-label="Canal A"]')).not.toBeNull();
        expect(mezclador().querySelector('section[aria-label="Canal B"]')).not.toBeNull();
      });

      it('el volumen maestro es una perilla que vuelve al maximo con doble clic', () => {
        mixer.setMasterVolume(0.3);
        fixture.detectChanges();
        const perilla = mezclador().querySelector('.maestro app-knob .dial') as HTMLElement;

        perilla.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));

        expect(mixer.masterVolume()).toBe(1);
      });

      it('tiene un medidor de nivel de salida', () => {
        const meterTimer = mezclador().querySelector('.maestro [role="meter"]');

        expect(meterTimer?.getAttribute('aria-label')).toBe('Nivel de salida');
      });
    });

    describe('medidor de salida', () => {
      beforeEach(() => {
        TestBed.resetTestingModule();
        vi.useFakeTimers();
        crear(new FakeAudioContext());
      });

      afterEach(() => vi.useRealTimers());

      it('sigue al nivel de salida del mezclador y baja suave al callarse', () => {
        const meterTimer = () => el().querySelector('.maestro [role="meter"]') as HTMLElement;
        // El analizador 0 es el del maestro.
        (ctx as FakeAudioContext).analysers[0].peak = 1;

        vi.advanceTimersByTime(100);
        fixture.detectChanges();
        expect(meterTimer().getAttribute('aria-valuenow')).toBe('100');

        (ctx as FakeAudioContext).analysers[0].peak = 0;
        vi.advanceTimersByTime(3000);
        fixture.detectChanges();
        expect(meterTimer().getAttribute('aria-valuenow')).toBe('0');
      });

      it('deja de medir al destruirse la consola', () => {
        fixture.destroy();

        expect(vi.getTimerCount()).toBe(0);
      });
    });

    describe('al cerrar o recargar la pagina', () => {
      const intentarCerrar = () => {
        const domEvent = new Event('beforeunload', { cancelable: true });
        window.dispatchEvent(domEvent);
        return domEvent.defaultPrevented;
      };

      it('no avisa si no suena nada', () => {
        expect(intentarCerrar()).toBe(false);
      });

      it('avisa si suena el deck A', () => {
        mixer.deck('A').playing.set(true);

        expect(intentarCerrar()).toBe(true);
      });

      it('avisa si suena el deck B', () => {
        mixer.deck('B').playing.set(true);

        expect(intentarCerrar()).toBe(true);
      });

      it('deja de avisar cuando se pausa todo', () => {
        mixer.deck('A').playing.set(true);
        mixer.deck('A').playing.set(false);

        expect(intentarCerrar()).toBe(false);
      });

      it('al destruir la consola ya no avisa', () => {
        mixer.deck('A').playing.set(true);

        fixture.destroy();

        expect(intentarCerrar()).toBe(false);
      });
    });

    it('el contexto de audio recibe el cambio del crossfader', () => {
      mover(slider('Crossfader'), 0);

      // gains del contexto: [maestro, volA, crossA, volB, crossB]
      expect(ctx!.gains[2].gain.value).toBe(1);
      expect(ctx!.gains[4].gain.value).toBeCloseTo(0);
    });
  });
});
